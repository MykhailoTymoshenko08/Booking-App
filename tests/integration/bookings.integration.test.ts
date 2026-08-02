import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  BASE_URL,
  prisma,
  assertServerIsReachable,
  futureWorkingHoursSlot,
  outsideWorkingHoursSlot,
  pastSlot,
} from './setup';

/**
 * Інтеграційні тести API бронювань через Supertest — реальні HTTP-запити
 * до живого Next.js-сервера (не мокаємо route handlers напряму), бо
 * автентифікація в проєкті йде через `cookies()` з `next/headers`, який
 * коректно працює лише всередині справжнього request-контексту сервера.
 *
 * Запуск: `npm run test:integration` (сам піднімає dev-сервер на
 * порту 3100, чекає готовності, ганяє тести, гасить сервер).
 * Детальніше — README → "Інтеграційні тести".
 */
describe('Bookings API (integration)', () => {
  // request.agent зберігає Set-Cookie між запитами автоматично —
  // рівно те, що потрібно для сесії, яку видає /api/auth/login|register.
  const agent = request.agent(BASE_URL);

  const testEmail = `integration-test-${Date.now()}@example.com`;
  const testPassword = 'password123456';

  let testRoomId: string;
  let createdBookingId: string;

  beforeAll(async () => {
    await assertServerIsReachable();

    // Ізольована тестова кімната — не залежимо від сідованих даних
    // і не засмічуємо демо-контент своїми тестовими бронюваннями.
    const room = await prisma.room.create({
      data: { name: '__INTEGRATION_TEST_ROOM__', floor: 99, capacity: 4 },
    });
    testRoomId = room.id;

    // Реєструємось через РЕАЛЬНИЙ ендпоінт (а не напряму в БД) — так
    // тестуємо справжній флоу, включно з тим, що акаунт спершу
    // створюється неверифікованим.
    const registerRes = await agent.post('/api/auth/register').send({
      email: testEmail,
      name: 'Integration Test User',
      password: testPassword,
    });
    expect(registerRes.status).toBe(201);

    // Підтверджуємо email через РЕАЛЬНИЙ /api/auth/verify — токен
    // дістаємо напряму з БД (заміна "відкрити лист"), а не з console.log
    // сервера, який у тестовому середовищі ніхто не читає.
    const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
    const verificationToken = await prisma.verificationToken.findFirstOrThrow({
      where: { userId: user.id },
    });

    const verifyRes = await agent.get(`/api/auth/verify?token=${verificationToken.token}`).redirects(0);
    expect(verifyRes.status).toBeGreaterThanOrEqual(300);
    expect(verifyRes.status).toBeLessThan(400);
    expect(verifyRes.headers.location).toContain('verified=1');

    const me = await agent.get('/api/auth/me');
    expect(me.body.user?.isVerified).toBe(true);
  });

  afterAll(async () => {
    // Прибираємо все, що стосується тестової кімнати й користувача —
    // бронювання кімнати каскадом, окремо саму кімнату та юзера.
    await prisma.booking.deleteMany({ where: { roomId: testRoomId } });
    await prisma.room.delete({ where: { id: testRoomId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------
  // 1. Успішне створення бронювання
  // ---------------------------------------------------------------------
  describe('POST /api/bookings — успішне створення', () => {
    it('створює бронювання в майбутньому, в робочі години', async () => {
      const { start, end } = futureWorkingHoursSlot(1, 10);

      const res = await agent.post('/api/bookings').send({
        title: 'Інтеграційний тест — успішне бронювання',
        roomId: testRoomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      expect(res.status).toBe(201);
      expect(res.body.booking).toBeDefined();
      expect(res.body.booking.roomId).toBe(testRoomId);
      expect(res.body.booking.title).toBe('Інтеграційний тест — успішне бронювання');

      createdBookingId = res.body.booking.id;

      // Перевіряємо не лише HTTP-відповідь, а й що запис реально
      // з'явився в базі — це відрізняє інтеграційний тест від "тесту
      // формату JSON-відповіді".
      const dbBooking = await prisma.booking.findUnique({ where: { id: createdBookingId } });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking?.roomId).toBe(testRoomId);
    });
  });

  // ---------------------------------------------------------------------
  // 2. Успішне скасування бронювання
  // ---------------------------------------------------------------------
  describe('DELETE /api/bookings/:id — успішне скасування', () => {
    it('скасовує щойно створене бронювання його автором', async () => {
      expect(createdBookingId).toBeDefined();

      const res = await agent.delete(`/api/bookings/${createdBookingId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbBooking = await prisma.booking.findUnique({ where: { id: createdBookingId } });
      expect(dbBooking).toBeNull();
    });

    it('повертає 404 при повторній спробі скасувати вже скасоване бронювання', async () => {
      const res = await agent.delete(`/api/bookings/${createdBookingId}`);
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // 3. Відмови валідації
  // ---------------------------------------------------------------------
  describe('POST /api/bookings — відмови валідації', () => {
    it('відхиляє бронювання в минулому (409)', async () => {
      const { start, end } = pastSlot();

      const res = await agent.post('/api/bookings').send({
        title: 'Бронювання в минулому',
        roomId: testRoomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/майбутн/i);
    });

    it('відхиляє бронювання поза робочими годинами (409)', async () => {
      const { start, end } = outsideWorkingHoursSlot(2);

      const res = await agent.post('/api/bookings').send({
        title: 'Бронювання поза робочими годинами',
        roomId: testRoomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/робочі години/i);
    });

    it('відхиляє бронювання, що перетинається з існуючим (409)', async () => {
      const { start, end } = futureWorkingHoursSlot(3, 11);

      const first = await agent.post('/api/bookings').send({
        title: 'Базове бронювання для тесту перетину',
        roomId: testRoomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      expect(first.status).toBe(201);

      // Часткове перекриття: починається за 15 хв до кінця першого.
      const overlappingStart = new Date(start.getTime() + 15 * 60000);
      const overlappingEnd = new Date(end.getTime() + 15 * 60000);

      const second = await agent.post('/api/bookings').send({
        title: 'Бронювання, що перетинається',
        roomId: testRoomId,
        startTime: overlappingStart.toISOString(),
        endTime: overlappingEnd.toISOString(),
      });

      expect(second.status).toBe(409);
      expect(second.body.error).toMatch(/заброньован/i);
    });

    it('дозволяє бронювання ВПРИТУЛ одразу після існуючого (регресія на баг з ТЗ)', async () => {
      const { start, end } = futureWorkingHoursSlot(4, 9);

      const first = await agent.post('/api/bookings').send({
        title: 'Перше бронювання (впритул-тест)',
        roomId: testRoomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      expect(first.status).toBe(201);

      // Починається РІВНО в момент закінчення першого — не перетин.
      const backToBackStart = end;
      const backToBackEnd = new Date(end.getTime() + 30 * 60000);

      const second = await agent.post('/api/bookings').send({
        title: 'Друге бронювання, впритул до першого',
        roomId: testRoomId,
        startTime: backToBackStart.toISOString(),
        endTime: backToBackEnd.toISOString(),
      });

      expect(second.status).toBe(201);
    });

    it('відхиляє запит без автентифікації (401)', async () => {
      const { start, end } = futureWorkingHoursSlot(5, 10);

      // Новий, "анонімний" клієнт без агента-з-кукою.
      const res = await request(BASE_URL).post('/api/bookings').send({
        title: 'Спроба без сесії',
        roomId: testRoomId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      expect(res.status).toBe(401);
    });
  });
});
