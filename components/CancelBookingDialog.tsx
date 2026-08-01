'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Trash2, Repeat } from 'lucide-react';
import type { Booking } from '@/lib/types';
import { formatLocalTime, formatDayHeader } from '@/lib/schedule-utils';

interface CancelBookingDialogProps {
  isOpen: boolean;
  booking: Booking | null;
  onClose: () => void;
  onCancelled: (bookingId: string) => void;
  // Необов'язковий колбек: якщо переданий і booking.seriesId не null,
  // діалог показує ДРУГУ кнопку "Скасувати всю серію" на додачу до
  // звичайного одиночного скасування.
  onSeriesCancelled?: (seriesId: string) => void;
}

export default function CancelBookingDialog({
  isOpen,
  booking,
  onClose,
  onCancelled,
  onSeriesCancelled,
}: CancelBookingDialogProps) {
  const [submitting, setSubmitting] = useState<'single' | 'series' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen, booking?.id]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !booking) return null;

  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  const dayLabel = formatDayHeader(start);
  const isRecurring = booking.seriesId !== null && Boolean(onSeriesCancelled);

  async function handleConfirmSingle() {
    setSubmitting('single');
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${booking!.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Не вдалося скасувати бронювання');
        return;
      }
      onCancelled(booking!.id);
    } catch {
      setError("Помилка з'єднання із сервером. Спробуйте ще раз");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleConfirmSeries() {
    if (!booking!.seriesId || !onSeriesCancelled) return;
    setSubmitting('series');
    setError(null);
    try {
      const response = await fetch(`/api/bookings/series/${booking!.seriesId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Не вдалося скасувати серію');
        return;
      }
      onSeriesCancelled(booking!.seriesId);
    } catch {
      setError("Помилка з'єднання із сервером. Спробуйте ще раз");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="cancel-dialog-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Trash2 className="h-5 w-5 text-red-600" />
            Скасувати бронювання?
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting !== null}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600">Це бронювання буде скасовано без можливості відновлення:</p>

          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div className="font-medium text-slate-900">{booking.title}</div>
            <div className="text-slate-600">{booking.room.name}</div>
            <div className="text-slate-600">
              {dayLabel.weekday}, {dayLabel.dayMonth} · {formatLocalTime(start)}–{formatLocalTime(end)}
            </div>
            {isRecurring && (
              <div className="mt-1 flex items-center gap-1 text-xs font-medium text-indigo-600">
                <Repeat className="h-3 w-3" />
                Частина серії повторюваних бронювань
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting !== null}
                className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Залишити
              </button>
              <button
                type="button"
                onClick={handleConfirmSingle}
                disabled={submitting !== null}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting === 'single' && <Loader2 className="h-4 w-4 animate-spin" />}
                {isRecurring ? 'Скасувати тільки це' : 'Скасувати бронювання'}
              </button>
            </div>

            {isRecurring && (
              <button
                type="button"
                onClick={handleConfirmSeries}
                disabled={submitting !== null}
                className="flex items-center justify-center gap-2 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {submitting === 'series' && <Loader2 className="h-4 w-4 animate-spin" />}
                Скасувати всю серію (майбутні повторення)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
