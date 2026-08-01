import { describe, it, expect } from 'vitest';
import { isOverlapping, findConflictingBooking, isWithinWorkingHours } from './booking-validation';

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
      utc('2026-08-03T18:00:00'),
      utc('2026-08-03T19:00:00'),
      utc('2026-08-04T09:00:00'),
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
    const candidateSlots: [string, string][] = [
      ['2026-08-03T09:00:00', '2026-08-03T10:00:00'],
      ['2026-08-03T11:00:00', '2026-08-03T12:00:00'],
      ['2026-08-03T12:30:00', '2026-08-03T13:30:00'],
      ['2026-08-03T15:00:00', '2026-08-03T16:00:00'],
      ['2026-08-03T17:00:00', '2026-08-03T18:00:00'],
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
