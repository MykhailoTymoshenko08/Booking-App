import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfWeek, addDays, addMinutes } from 'date-fns';
import type { TimeSlot } from './types';

export const KYIV_TIMEZONE = 'Europe/Kyiv';

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 19;
const SLOT_MINUTES = 30;
export const TOTAL_SLOTS = ((WORK_END_HOUR - WORK_START_HOUR) * 60) / SLOT_MINUTES; // 20

export function getWeekStart(date: Date): Date {
  const zoned = toZonedTime(date, KYIV_TIMEZONE);
  const monday = startOfWeek(zoned, { weekStartsOn: 1 });
  monday.setHours(0, 0, 0, 0);
  return fromZonedTime(monday, KYIV_TIMEZONE);
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}


export function getDaySlots(day: Date): TimeSlot[] {
  const zonedMidnight = toZonedTime(day, KYIV_TIMEZONE);
  zonedMidnight.setHours(0, 0, 0, 0);

  return Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const minutesFromMidnight = WORK_START_HOUR * 60 + i * SLOT_MINUTES;
    const zonedStart = addMinutes(zonedMidnight, minutesFromMidnight);
    const zonedEnd = addMinutes(zonedStart, SLOT_MINUTES);
    return {
      start: fromZonedTime(zonedStart, KYIV_TIMEZONE),
      end: fromZonedTime(zonedEnd, KYIV_TIMEZONE),
    };
  });
}

export function formatLocalTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDayHeader(date: Date): { weekday: string; dayMonth: string } {
  return {
    weekday: new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: KYIV_TIMEZONE }).format(date),
    dayMonth: new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: KYIV_TIMEZONE }).format(date),
  };
}

export function formatWeekRangeLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const start = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', timeZone: KYIV_TIMEZONE }).format(weekStart);
  const end = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: KYIV_TIMEZONE }).format(weekEnd);
  return `${start} – ${end}`;
}

export function isKyivToday(day: Date): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: KYIV_TIMEZONE }); // YYYY-MM-DD
  return fmt.format(day) === fmt.format(new Date());
}

export function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimezoneOffsetLabel(timeZone: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(date);
  const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  return offset.replace('GMT', 'UTC');
}
