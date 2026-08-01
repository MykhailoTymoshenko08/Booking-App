import { NextResponse } from 'next/server';

// Роут завжди звертається до process.env у рантаймі й не повинен пререндеритись.
export const dynamic = 'force-dynamic';

const DEFAULT_NOTIFY_BEFORE_MINUTES = 10;

/**
 * Публічна runtime-конфігурація для клієнта.
 *
 * Свідомо НЕ використовуємо NEXT_PUBLIC_-змінну: такі змінні "запікаються"
 * в JS-бандл під час `next build` (на етапі builder у Dockerfile), а не
 * читаються з середовища контейнера в рантаймі — тобто зміна значення в
 * docker-compose.yml без перезбірки образу не мала б жодного ефекту.
 * Натомість тут читаємо process.env.NOTIFY_BEFORE_MINUTES напряму на
 * сервері (як і DATABASE_URL/JWT_SECRET) і віддаємо клієнту простим GET.
 */
export async function GET() {
  const raw = process.env.NOTIFY_BEFORE_MINUTES;
  const parsed = raw ? Number(raw) : NaN;
  const notifyBeforeMinutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_NOTIFY_BEFORE_MINUTES;

  return NextResponse.json({ notifyBeforeMinutes });
}
