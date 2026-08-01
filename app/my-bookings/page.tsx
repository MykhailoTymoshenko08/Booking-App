'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, History, Loader2, AlertCircle, MapPin, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { Booking } from '@/lib/types';
import { formatDayHeader, formatLocalTime, formatKyivDateParam } from '@/lib/schedule-utils';
import CancelBookingDialog from '@/components/CancelBookingDialog';

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/bookings?mine=true');
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Не вдалося завантажити бронювання');
        return;
      }
      setBookings(data.bookings ?? []);
    } catch {
      setError("Помилка з'єднання із сервером");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) loadBookings();
  }, [user, loadBookings]);

  function handleCancelled(bookingId: string) {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setCancelTarget(null);
  }

  function handleRowClick(booking: Booking) {
    const dateParam = formatKyivDateParam(new Date(booking.startTime));
    router.push(`/?roomId=${booking.roomId}&date=${dateParam}`);
  }

  if (authLoading || !user) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const now = Date.now();
  const upcoming = [...bookings]
    .filter((b) => new Date(b.endTime).getTime() > now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const past = [...bookings]
    .filter((b) => new Date(b.endTime).getTime() <= now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  function renderBooking(booking: Booking, cancellable: boolean) {
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    const dayLabel = formatDayHeader(start);

    return (
      <div
        key={booking.id}
        role="button"
        tabIndex={0}
        onClick={() => handleRowClick(booking)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick(booking);
          }
        }}
        title="Перейти до цього бронювання в розкладі"
        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{booking.title}</div>
          <div className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
            {booking.room.name}
          </div>
          <div className="text-sm text-slate-500">
            {dayLabel.weekday}, {dayLabel.dayMonth} · {formatLocalTime(start)}–{formatLocalTime(end)}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {cancellable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCancelTarget(booking);
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Скасувати
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Мої бронювання</h1>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <CalendarClock className="h-4 w-4" />
              Майбутні зустрічі
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Немає майбутніх бронювань.</p>
            ) : (
              <div className="space-y-2">{upcoming.map((b) => renderBooking(b, true))}</div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <History className="h-4 w-4" />
              Минулі зустрічі
            </h2>
            {past.length === 0 ? (
              <p className="text-sm text-slate-500">Минулих бронювань поки немає.</p>
            ) : (
              <div className="space-y-2 opacity-70">{past.map((b) => renderBooking(b, false))}</div>
            )}
          </section>
        </>
      )}

      <CancelBookingDialog
        isOpen={cancelTarget !== null}
        booking={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={handleCancelled}
      />
    </div>
  );
}
