import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * URL живого Next.js-сервера, проти якого б'ють тести. За замовчуванням —
 * порт 3100, ВІДМІННИЙ від звичайного dev-порту (3000) і від
 * docker-compose (теж 3000), щоб `npm run test:integration` можна було
 * запускати, не зупиняючи звичайний `npm run dev` чи Docker-контейнер.
 */
export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3100';

/**
 * Prisma-клієнт для тестового процесу. Свідомо НЕ той самий сінглтон, що
 * в lib/prisma.ts (той заточений під hot-reload у Next.js-рантаймі) —
 * тут достатньо звичайного клієнта, який читає той самий DATABASE_URL
 * з .env (через dotenv/config вище), що й сервер, проти якого тестуємо.
 */
export const prisma = new PrismaClient();

/**
 * Валідний майбутній слот у робочі години (09:00–19:00 за Києвом),
 * 30-хвилинної тривалості за замовчуванням.
 *
 * 10:00 UTC завжди відповідає 12:00–13:00 за Києвом (UTC+2/+3, залежно
 * від DST) — тобто гарантовано в межах робочих годин незалежно від
 * пори року, коли б не запускались тести.
 */
export function futureWorkingHoursSlot(daysAhead: number, hourUTC = 10, durationMinutes = 30) {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(hourUTC, 0, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return { start, end };
}

/**
 * Майбутній слот, який ГАРАНТОВАНО поза робочими годинами за Києвом.
 * 21:00 UTC відповідає 23:00 (UTC+2) або 00:00 наступної доби (UTC+3) —
 * в обох випадках далеко за межами вікна 09:00–19:00.
 */
export function outsideWorkingHoursSlot(daysAhead: number) {
  const start = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  start.setUTCHours(21, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);
  return { start, end };
}

/**
 * Слот у минулому (вчора) — і при цьому кратний 30 хв, щоб тест на
 * "минулий час" не впав випадково на перевірці вирівнювання слоту.
 */
export function pastSlot() {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60000);
  return { start, end };
}

/** Дружня перевірка, що сервер узагалі піднятий, перш ніж ганяти весь сьют. */
export async function assertServerIsReachable(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/config`);
    if (!res.ok) throw new Error(`Неочікуваний статус: ${res.status}`);
  } catch (cause) {
    throw new Error(
      `Не вдалося достукатись до ${BASE_URL}. Переконайтесь, що сервер запущено ` +
        `(див. README → "Інтеграційні тести") перед запуском тестів.`,
      { cause }
    );
  }
}
