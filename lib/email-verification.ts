import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 години

/**
 * Створює новий токен підтвердження email і "надсилає" лист.
 *
 * У реальному застосунку тут був би виклик SMTP/поштового провайдера.
 * У цьому проєкті (dev-режим, без реального SMTP) достатньо вивести
 * посилання підтвердження в консоль сервера — саме туди й дивиться
 * розробник/тестувальник під час хакатону.
 *
 * Попередні токени користувача видаляються, щоб лишався активним
 * лише останній надісланий (природна поведінка "надіслати ще раз").
 */
export async function createAndSendVerificationToken(
  userId: string,
  email: string,
  origin: string
): Promise<void> {
  await prisma.verificationToken.deleteMany({ where: { userId } });

  const token = randomUUID();
  await prisma.verificationToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const verificationUrl = `${origin}/api/auth/verify?token=${token}`;

  // eslint-disable-next-line no-console
  console.log(
    `\n📧 [DEV] Лист підтвердження для ${email}:\n` +
      `   Перейдіть за посиланням, щоб підтвердити email:\n` +
      `   ${verificationUrl}\n`
  );
}
