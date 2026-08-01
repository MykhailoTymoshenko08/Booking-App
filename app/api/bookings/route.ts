import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import {
  validateBookingInput,
  isOverlapping,
  addWeeksInKyiv,
  BookingValidationError,
} from '@/lib/booking-validation';

// Роут завжди звертається до БД у рантаймі й не повинен пререндеритись
// під час `next build` (DATABASE_URL там ще недоступний).
export const dynamic = 'force-dynamic';

// Спільний "include" для відповіді API — і для сітки/списку, і для
// щойно створених бронювань.
const bookingIncludeArgs = {
  room: { select: { id: true, name: true, floor: true, capacity: true } },
  user: { select: { id: true, name: true, email: true } },
} as const;

// ---------- GET: список бронювань для сітки або "Мої бронювання" (?mine=true) ----------

const getQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  roomId: z.string().optional(),
  mine: z.enum(['true', 'false']).optional(),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const parsed = getQuerySchema.safeParse({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    roomId: searchParams.get('roomId') ?? undefined,
    mine: searchParams.get('mine') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Некоректні параметри дати' }, { status: 400 });
  }

  const { from, to, roomId, mine } = parsed.data;

  // ?mine=true — бронювання поточного користувача (для сторінки "Мої бронювання"),
  // незалежно від кімнати й діапазону дат; вимагає активної сесії.
  let ownerUserId: string | undefined;
  if (mine === 'true') {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Необхідна автентифікація' }, { status: 401 });
    }
    ownerUserId = session.userId;
  }

  const where: Prisma.BookingWhereInput = {
    ...(roomId ? { roomId } : {}),
    ...(ownerUserId ? { userId: ownerUserId } : {}),
    ...(from ? { endTime: { gt: new Date(from) } } : {}),
    ...(to ? { startTime: { lt: new Date(to) } } : {}),
  };

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { startTime: 'asc' },
    include: bookingIncludeArgs,
  });

  return NextResponse.json({ bookings });
}

// ---------- POST: створення бронювання (одноразового або серії повторень) ----------

const MAX_OCCURRENCES = 52; // максимум рік щотижневих повторень

const createBookingSchema = z.object({
  title: z.string().trim().min(1, "Назва обов'язкова").max(200),
  roomId: z.string().min(1),
  startTime: z.string().datetime({ message: 'startTime має бути ISO-датою' }),
  endTime: z.string().datetime({ message: 'endTime має бути ISO-датою' }),
  // Необов'язковий блок: якщо переданий — створюємо СЕРІЮ щотижневих
  // повторень (той самий день тижня й час, що й у startTime/endTime),
  // а не одне бронювання. occurrences включає саме перше бронювання,
  // тобто "8 повторень" = 8 записів у базі, останній — через 7 тижнів.
  recurrence: z
    .object({
      occurrences: z.number().int().min(2, 'Мінімум 2 повторення').max(MAX_OCCURRENCES, `Максимум ${MAX_OCCURRENCES} повторень`),
    })
    .optional(),
});

/**
 * Прогони транзакцію з повторними спробами при serialization failure
 * (Postgres-код 40001 / Prisma-код P2034) — очікувана й НОРМАЛЬНА подія
 * під час SERIALIZABLE isolation при конкурентних запитах, а не помилка
 * застосунку. Docs: https://www.prisma.io/docs/orm/prisma-client/queries/transactions#transaction-isolation-level
 */
async function runWithSerializationRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isSerializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!isSerializationConflict || attempt === maxAttempts) {
        throw error;
      }
      // Короткий випадковий бекоф перед повтором, щоб конкуруючі
      // транзакції не билися в ту саму стіну знову й знову синхронно.
      await new Promise((resolve) => setTimeout(resolve, 30 * attempt + Math.random() * 30));
    }
  }
  // Недосяжно (цикл завжди або повертає, або кидає), потрібно лише для типів.
  throw new Error('runWithSerializationRetry: unreachable');
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Необхідна автентифікація' }, { status: 401 });
    }

    // Бронювати можуть лише користувачі з підтвердженим email. Перевіряємо
    // свіжий стан з БД (а не з JWT-сесії), бо isVerified міг змінитися вже
    // ПІСЛЯ видачі токена сесії.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { isVerified: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
    }
    if (!user.isVerified) {
      return NextResponse.json(
        { error: 'Підтвердіть email, щоб створювати бронювання' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Некоректні дані' },
        { status: 400 }
      );
    }

    const { title, roomId, startTime: startRaw, endTime: endRaw, recurrence } = parsed.data;
    const firstStart = new Date(startRaw);
    const firstEnd = new Date(endRaw);

    const occurrenceCount = recurrence?.occurrences ?? 1;
    const seriesId = recurrence ? randomUUID() : null;

    // Обчислюємо всі повторення (для одноразового бронювання — масив з 1 елемента).
    // Зсув на N тижнів рахується через addWeeksInKyiv, а не raw-мілісекунди,
    // щоб перехід на літній/зимній час усередині серії не зсунув Kyiv-час зустрічі.
    const occurrences = Array.from({ length: occurrenceCount }, (_, i) => ({
      startTime: i === 0 ? firstStart : addWeeksInKyiv(firstStart, i),
      endTime: i === 0 ? firstEnd : addWeeksInKyiv(firstEnd, i),
    }));

    // Кожне повторення незалежно повинно проходити ті самі правила
    // (робочі години, кратність 30 хв, тривалість, майбутній час).
    for (const occ of occurrences) {
      validateBookingInput(occ.startTime, occ.endTime);
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: 'Кімнату не знайдено' }, { status: 404 });
    }

    // Захист від race condition — два незалежні механізми одночасно:
    //
    // 1) Пессимістичний DB-лок: SELECT ... FOR UPDATE блокує рядок кімнати
    //    на час транзакції, тож другий конкурентний запит на ТУ САМУ кімнату
    //    просто ЧЕКАЄ на звільнення локу, а не читає застарілий "вільний" стан.
    // 2) Ізоляція SERIALIZABLE — найсуворіший рівень ізоляції Postgres:
    //    якщо, попри лок, десь виникне конфлікт читання/запису, Postgres сам
    //    відхилить одну з транзакцій з serialization failure (код 40001),
    //    яку ми ловимо в runWithSerializationRetry і повторюємо спробу.
    //
    // Разом це гарантує: два користувачі, що одночасно тиснуть "Забронювати"
    // на той самий (або пересічний) слот, ніколи не створять дублікат —
    // один запит завжди або чекає, або отримує серіалізовану помилку й
    // при повторній спробі бачить уже актуальний (зайнятий) стан.
    const createdBookings = await runWithSerializationRetry(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;

          const result = [] as Awaited<ReturnType<typeof tx.booking.create>>[];
          for (const occ of occurrences) {
            // Кандидати на конфлікт: бронювання ЦІЄЇ Ж кімнати, чий інтервал
            // перетинається з цим конкретним повторенням.
            //   existingStartTime < newEndTime  ТА  existingEndTime > newStartTime
            const existingBookings = await tx.booking.findMany({
              where: {
                roomId,
                startTime: { lt: occ.endTime },
                endTime: { gt: occ.startTime },
              },
              select: { id: true, startTime: true, endTime: true },
            });

            const conflict = existingBookings.find((b) =>
              isOverlapping(occ.startTime, occ.endTime, b.startTime, b.endTime)
            );

            if (conflict) {
              // Кидаємо помилку всередині транзакції -> Prisma автоматично
              // відкотить УСІ вже створені в цьому циклі повторення (all-or-nothing):
              // серія або створюється повністю, або не створюється взагалі.
              throw new BookingValidationError(
                occurrenceCount > 1
                  ? `Конфлікт у одному з повторень (${occ.startTime.toLocaleString('uk-UA')}) — серію не створено`
                  : 'Кімната вже заброньована на цей час'
              );
            }

            const created = await tx.booking.create({
              data: {
                title,
                startTime: occ.startTime,
                endTime: occ.endTime,
                roomId,
                userId: session.userId,
                seriesId,
              },
              include: bookingIncludeArgs,
            });
            result.push(created);
          }

          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );

    return NextResponse.json({ booking: createdBookings[0], bookings: createdBookings }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 });
  }
}
