import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { validateBookingInput, isOverlapping, BookingValidationError } from '@/lib/booking-validation';

export const dynamic = 'force-dynamic';


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
    include: {
      room: { select: { id: true, name: true, floor: true, capacity: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ bookings });
}

const createBookingSchema = z.object({
  title: z.string().trim().min(1, "Назва обов'язкова").max(200),
  roomId: z.string().min(1),
  startTime: z.string().datetime({ message: 'startTime має бути ISO-датою' }),
  endTime: z.string().datetime({ message: 'endTime має бути ISO-датою' }),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Необхідна автентифікація' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Некоректні дані' },
        { status: 400 }
      );
    }

    const { title, roomId, startTime: startRaw, endTime: endRaw } = parsed.data;
    const startTime = new Date(startRaw);
    const endTime = new Date(endRaw);

    validateBookingInput(startTime, endTime);

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: 'Кімнату не знайдено' }, { status: 404 });
    }

    const booking = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;

      const existingBookings = await tx.booking.findMany({
        where: {
          roomId,
          startTime: { lt: endTime }, // existingStartTime < newEndTime
          endTime: { gt: startTime }, // existingEndTime   > newStartTime
        },
        select: { id: true, startTime: true, endTime: true },
      });

      const conflict = existingBookings.find((b) => isOverlapping(startTime, endTime, b.startTime, b.endTime));

      if (conflict) {
        throw new BookingValidationError('Кімната вже заброньована на цей час');
      }

      return tx.booking.create({
        data: {
          title,
          startTime,
          endTime,
          roomId,
          userId: session.userId,
        },
        include: {
          room: { select: { id: true, name: true, floor: true, capacity: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 });
  }
}
