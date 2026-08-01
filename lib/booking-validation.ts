import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { getHours, getMinutes, addDays } from 'date-fns';

const TIMEZONE = 'Europe/Kyiv';
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 19;

const SLOT_MINUTES = 30;
const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 4 * 60;

export class BookingValidationError extends Error {}

/**
 * Зсуває дату на `weeks` тижнів ВПЕРЕД, зберігаючи той самий час доби
 * за Kyiv-годинником (а не просто додаючи weeks*7*24 годин в UTC).
 *
 * Це важливо для щотижневих повторень: якщо просто додати фіксовану
 * кількість мілісекунд, перехід на літній/зимній час усередині періоду
 * повторень зсунув би фактичний kyiv-час зустрічі на годину. Через
 * toZonedTime/fromZonedTime кожне повторення завжди залишається,
 * наприклад, рівно "щовівторка о 10:00 за Києвом".
 */
export function addWeeksInKyiv(date: Date, weeks: number): Date {
  if (weeks === 0) return date;
  const zoned = toZonedTime(date, TIMEZONE);
  const shifted = addDays(zoned, weeks * 7);
  return fromZonedTime(shifted, TIMEZONE);
}

/**
 * Перевіряє, що бронювання (у UTC) повністю вкладається
 * в робочі години 09:00–19:00 за Europe/Kyiv.
 */
export function isWithinWorkingHours(startTime: Date, endTime: Date): boolean {
  const zonedStart = toZonedTime(startTime, TIMEZONE);
  const zonedEnd = toZonedTime(endTime, TIMEZONE);

  const startMinutes = getHours(zonedStart) * 60 + getMinutes(zonedStart);
  const endMinutes = getHours(zonedEnd) * 60 + getMinutes(zonedEnd);

  const workStartMinutes = WORK_START_HOUR * 60;
  const workEndMinutes = WORK_END_HOUR * 60;

  return (
    startMinutes >= workStartMinutes &&
    endMinutes <= workEndMinutes &&
    startMinutes < endMinutes
  );
}

/**
 * Перевіряє, чи перетинається НОВЕ бронювання з ОДНИМ існуючим.
 *
 * Перетин існує, якщо:  newStartTime < existingEndTime  ТА  newEndTime > existingStartTime
 *
 * Це навмисно НЕ перевіряє "чи припадає на той самий день" — двох бронювань
 * в одній кімнаті за один день може бути скільки завгодно, аби їхні
 * інтервали не перетинались. Впритул (existingEndTime === newStartTime)
 * НЕ вважається перетином — тому нерівності строгі (< / >), а не (<= / >=).
 */
export function isOverlapping(
  newStartTime: Date,
  newEndTime: Date,
  existingStartTime: Date,
  existingEndTime: Date
): boolean {
  return newStartTime < existingEndTime && newEndTime > existingStartTime;
}

interface ExistingBooking {
  id: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Перевіряє нове бронювання на перетин з масивом існуючих
 * бронювань тієї ж кімнати. Повертає перше знайдене
 * бронювання-конфлікт, або null, якщо все ок.
 */
export function findConflictingBooking(
  newStart: Date,
  newEnd: Date,
  existingBookings: ExistingBooking[],
  excludeBookingId?: string
): ExistingBooking | null {
  const conflict = existingBookings.find((booking) => {
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    return isOverlapping(newStart, newEnd, booking.startTime, booking.endTime);
  });

  return conflict ?? null;
}

/** Перевіряє, що час кратний 30 хвилинам (00 або 30 хвилин, 0 секунд/мс) */
export function isAlignedToSlot(date: Date): boolean {
  return (
    date.getUTCMinutes() % SLOT_MINUTES === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

export function isValidDuration(startTime: Date, endTime: Date): boolean {
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
  return durationMinutes >= MIN_DURATION_MINUTES && durationMinutes <= MAX_DURATION_MINUTES;
}

export function isInFuture(startTime: Date): boolean {
  return startTime.getTime() > Date.now();
}

/**
 * Повна серверна валідація вхідних даних бронювання (без перевірки перетинів —
 * та робиться окремо, всередині транзакції, де вже є лок на кімнату).
 */
export function validateBookingInput(startTime: Date, endTime: Date): void {
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new BookingValidationError('Некоректний формат дати/часу');
  }
  if (startTime >= endTime) {
    throw new BookingValidationError('Час початку має бути раніше часу завершення');
  }
  if (!isAlignedToSlot(startTime) || !isAlignedToSlot(endTime)) {
    throw new BookingValidationError('Час бронювання має бути кратним 30 хвилинам');
  }
  if (!isValidDuration(startTime, endTime)) {
    throw new BookingValidationError('Тривалість бронювання — від 30 хвилин до 4 годин');
  }
  if (!isInFuture(startTime)) {
    throw new BookingValidationError('Бронювати можна лише на майбутній час');
  }
  if (!isWithinWorkingHours(startTime, endTime)) {
    throw new BookingValidationError('Бронювання можливе лише в робочі години (09:00–19:00 за Києвом)');
  }
}

/**
 * Головна функція валідації "все в одному" — зручна для юніт-тестів
 * та сценаріїв, де перевірка перетинів вже має готовий список бронювань.
 */
export function validateBooking(
  startTime: Date,
  endTime: Date,
  existingBookings: ExistingBooking[],
  excludeBookingId?: string
): void {
  validateBookingInput(startTime, endTime);

  const conflict = findConflictingBooking(startTime, endTime, existingBookings, excludeBookingId);
  if (conflict) {
    throw new BookingValidationError(`Кімната вже заброньована в цей час (бронювання #${conflict.id})`);
  }
}
