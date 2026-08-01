import { describe, it, expect } from 'vitest';
import { isOverlapping, findConflictingBooking, isWithinWorkingHours, addWeeksInKyiv } from './booking-validation';

// Допоміжна функція: створює Date у UTC, щоб тести не залежали
// від часового поясу машини, на якій вони запускаються.
function utc(dateStr: string): Date {
  return new Date(`${dateStr}Z`);
}

describe('isOverlapping', () => {
  it('бронювання впритул (10:00–11:00 і 11:00–12:00) НЕ є перетином', () => {
    const result = isOverlapping(
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00'),
      utc('2026-08-03T11:00:00'),
      utc('2026-08-03T12:00:00')
    );
    expect(result).toBe(false);
  });

  it('впритул навпаки (нове бронювання ПЕРЕД існуючим) теж не перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T09:00:00'),
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00')
    );
    expect(result).toBe(false);
  });

  it('часткове перекриття на початку (10:00–11:00 і 10:30–11:30) — перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00'),
      utc('2026-08-03T10:30:00'),
      utc('2026-08-03T11:30:00')
    );
    expect(result).toBe(true);
  });

  it('часткове перекриття в кінці (10:00–11:00 і 09:30–10:30) — перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00'),
      utc('2026-08-03T09:30:00'),
      utc('2026-08-03T10:30:00')
    );
    expect(result).toBe(true);
  });

  it('повний збіг інтервалів (10:00–11:00 і 10:00–11:00) — перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00'),
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00')
    );
    expect(result).toBe(true);
  });

  it('одне бронювання повністю поглинає інше (10:00–12:00 містить 10:30–11:00) — перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T12:00:00'),
      utc('2026-08-03T10:30:00'),
      utc('2026-08-03T11:00:00')
    );
    expect(result).toBe(true);
  });

  it('однакові години, але СУСІДНІ дні (Пн 18:00–19:00 і Вт 09:00–10:00) — не перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T18:00:00'), // понеділок
      utc('2026-08-03T19:00:00'),
      utc('2026-08-04T09:00:00'), // вівторок
      utc('2026-08-04T10:00:00')
    );
    expect(result).toBe(false);
  });

  it('повністю не пересічні інтервали в різний час — не перетин', () => {
    const result = isOverlapping(
      utc('2026-08-03T09:00:00'),
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T15:00:00'),
      utc('2026-08-03T16:00:00')
    );
    expect(result).toBe(false);
  });
});

describe('findConflictingBooking', () => {
  const existing = [
    { id: '1', startTime: utc('2026-08-03T10:00:00'), endTime: utc('2026-08-03T11:00:00') },
    { id: '2', startTime: utc('2026-08-03T14:00:00'), endTime: utc('2026-08-03T15:00:00') },
  ];

  it('дозволяє СКІЛЬКИ ЗАВГОДНО бронювань в одній кімнаті за один день, якщо вони не перетинаються', () => {
    // Регресійний тест на баг "система дозволяє лише одне бронювання на день":
    // кімната вже має бронювання 10:00–11:00 і 14:00–15:00 (existing вище).
    // Перевіряємо, що щонайменше ще 3 різні непересічні проміжки ТОГО Ж ДНЯ
    // в ТІЙ САМІЙ кімнаті проходять без конфлікту.
    const candidateSlots: [string, string][] = [
      ['2026-08-03T09:00:00', '2026-08-03T10:00:00'], // одразу перед першим, впритул
      ['2026-08-03T11:00:00', '2026-08-03T12:00:00'], // одразу після першого, впритул
      ['2026-08-03T12:30:00', '2026-08-03T13:30:00'], // між першим і другим
      ['2026-08-03T15:00:00', '2026-08-03T16:00:00'], // одразу після другого, впритул
      ['2026-08-03T17:00:00', '2026-08-03T18:00:00'], // ввечері, окремо від усіх
    ];

    for (const [start, end] of candidateSlots) {
      const conflict = findConflictingBooking(utc(start), utc(end), existing);
      expect(conflict).toBeNull();
    }
  });

  it('знаходить конфлікт при перекритті з одним із існуючих бронювань', () => {
    const conflict = findConflictingBooking(
      utc('2026-08-03T10:30:00'),
      utc('2026-08-03T11:30:00'),
      existing
    );
    expect(conflict?.id).toBe('1');
  });

  it('не знаходить конфлікту, якщо нове бронювання впритул до існуючих', () => {
    const conflict = findConflictingBooking(
      utc('2026-08-03T11:00:00'),
      utc('2026-08-03T12:00:00'),
      existing
    );
    expect(conflict).toBeNull();
  });

  it('ігнорує бронювання, вказане в excludeBookingId (кейс редагування)', () => {
    const conflict = findConflictingBooking(
      utc('2026-08-03T10:00:00'),
      utc('2026-08-03T11:00:00'),
      existing,
      '1'
    );
    expect(conflict).toBeNull();
  });
});

describe('isWithinWorkingHours (межові випадки)', () => {
  it('бронювання рівно 09:00–19:00 за Києвом — валідне (межі включно)', () => {
    // 09:00 і 19:00 за Києвом влітку (UTC+3) відповідають 06:00 і 16:00 UTC
    const result = isWithinWorkingHours(utc('2026-08-03T06:00:00'), utc('2026-08-03T16:00:00'));
    expect(result).toBe(true);
  });

  it('бронювання, що виходить за 19:00 за Києвом — недійсне', () => {
    const result = isWithinWorkingHours(utc('2026-08-03T15:30:00'), utc('2026-08-03T16:30:00'));
    expect(result).toBe(false);
  });
});

describe('addWeeksInKyiv (щотижневі повторення)', () => {
  it('без переходу DST зсуває рівно на N*7 днів у UTC', () => {
    const start = utc('2026-08-04T07:00:00'); // 10:00 за Києвом (влітку, UTC+3)
    const shifted = addWeeksInKyiv(start, 2);
    expect(shifted.toISOString()).toBe(utc('2026-08-18T07:00:00').toISOString());
  });

  it('weeks=0 повертає той самий Date (перше повторення = оригінал)', () => {
    const start = utc('2026-08-04T07:00:00');
    expect(addWeeksInKyiv(start, 0).getTime()).toBe(start.getTime());
  });

  it('через перехід на зимовий час (2026-10-25) зберігає той самий Kyiv-час доби', () => {
    // 10:00 за Києвом 6 жовтня 2026 (ще літній час, UTC+3) => 07:00 UTC
    const start = utc('2026-10-06T07:00:00');
    // +3 тижні -> 27 жовтня 2026, вже ПІСЛЯ переходу на зимовий час (UTC+2)
    const shifted = addWeeksInKyiv(start, 3);

    // Якби рахували "наївно" (просто +21*24 год у UTC), отримали б 07:00 UTC,
    // що за зимового часу відповідає вже 09:00 за Києвом — тобто зустріч
    // "поїхала б" на годину раніше. Правильний результат — 08:00 UTC,
    // що й є рівно 10:00 за Києвом за новим (зимовим) зсувом UTC+2.
    expect(shifted.toISOString()).toBe(utc('2026-10-27T08:00:00').toISOString());
  });
});
