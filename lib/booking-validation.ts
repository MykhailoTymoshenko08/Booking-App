import { toZonedTime } from 'date-fns-tz';
import { getHours, getMinutes } from 'date-fns';

const TIMEZONE = 'Europe/Kyiv';
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 19;

const SLOT_MINUTES = 30;
const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 4 * 60;

export class BookingValidationError extends Error {}

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

// newStartTime < existingEndTime  and  newEndTime > existingStartTime
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
