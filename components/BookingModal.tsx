'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, AlertCircle, CalendarPlus } from 'lucide-react';
import type { Booking, Room } from '@/lib/types';
import { formatLocalTime, formatDayHeader } from '@/lib/schedule-utils';

interface BookingModalProps {
  isOpen: boolean;
  room: Room;
  slotStart: Date;
  dayCloseTime: Date;
  onClose: () => void;
  onCreated: (booking: Booking) => void;
} 

const MIN_DURATION = 30;
const MAX_DURATION = 240;
const DURATION_STEP = 30;

function formatDurationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} хв`;
  if (mins === 0) return `${hours} год`;
  return `${hours} год ${mins} хв`;
}

export default function BookingModal({
  isOpen,
  room,
  slotStart,
  dayCloseTime,
  onClose,
  onCreated,
}: BookingModalProps) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const availableDurations = useMemo(() => {
    const maxByCloseTime = Math.floor((dayCloseTime.getTime() - slotStart.getTime()) / 60000);
    const cappedMax = Math.min(MAX_DURATION, maxByCloseTime);
    const options: number[] = [];
    for (let m = MIN_DURATION; m <= cappedMax; m += DURATION_STEP) options.push(m);
    return options;
  }, [slotStart, dayCloseTime]);

  const endTime = useMemo(() => new Date(slotStart.getTime() + duration * 60000), [slotStart, duration]);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setError(null);
      setTitleError(null);
      setDuration(availableDurations.includes(60) ? 60 : availableDurations[0] ?? MIN_DURATION);
    }
  }, [isOpen, slotStart]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  function validate(): boolean {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setTitleError("Назва бронювання обов'язкова");
      return false;
    }
    if (trimmed.length > 200) {
      setTitleError('Назва занадто довга (максимум 200 символів)');
      return false;
    }
    setTitleError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          roomId: room.id,
          startTime: slotStart.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Не вдалося створити бронювання');
        return;
      }
      onCreated(data.booking as Booking);
    } catch {
      setError("Помилка з'єднання із сервером. Спробуйте ще раз");
    } finally {
      setSubmitting(false);
    }
  }

  const dayLabel = formatDayHeader(slotStart);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="booking-modal-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CalendarPlus className="h-5 w-5 text-indigo-600" />
            Нове бронювання
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <div className="font-medium text-slate-900">
              {room.name} · {room.capacity} осіб
            </div>
            <div>
              {dayLabel.weekday}, {dayLabel.dayMonth} · {formatLocalTime(slotStart)}–{formatLocalTime(endTime)}
            </div>
          </div>

          <div>
            <label htmlFor="booking-title" className="mb-1 block text-sm font-medium text-slate-700">
              Назва зустрічі
            </label>
            <input
              id="booking-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Наприклад, Дейлі команди"
              autoFocus
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
                titleError ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {titleError && (
              <p className="mt-1 flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-3.5 w-3.5" /> {titleError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="booking-duration" className="mb-1 block text-sm font-medium text-slate-700">
              Тривалість
            </label>
            <select
              id="booking-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {availableDurations.map((m) => (
                <option key={m} value={m}>
                  {formatDurationLabel(m)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Кабінет вільний до {formatLocalTime(dayCloseTime)}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Забронювати
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
