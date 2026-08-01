'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  AlertCircle,
  Lock,
  CalendarCheck,
  User as UserIcon,
  Repeat,
  CheckCircle2,
  X,
} from 'lucide-react';
import type { Booking, Room, TimeSlot } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import {
  KYIV_TIMEZONE,
  TOTAL_SLOTS,
  getWeekStart,
  getWeekDays,
  getDaySlots,
  formatLocalTime,
  formatDayHeader,
  formatWeekRangeLabel,
  getTimezoneOffsetLabel,
  getBrowserTimezone,
  isKyivToday,
} from '@/lib/schedule-utils';
import BookingModal from './BookingModal';
import CancelBookingDialog from './CancelBookingDialog';
import LoginRequiredDialog from './LoginRequiredDialog';
import EmailVerificationRequiredDialog from './EmailVerificationRequiredDialog';

const ROW_HEIGHT = 48; // px — висота одного 30-хвилинного слота

export default function BookingCalendar() {
  const { user: currentUser } = useAuth();
  const searchParams = useSearchParams();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Якщо в URL є ?date=YYYY-MM-DD (перехід зі сторінки "Мої бронювання") —
  // одразу відкриваємо тиждень, у якому це бронювання відбувається.
  // Лінивий ініціалізатор useState виконується лише РАЗ, при монтуванні,
  // тож подальша навігація по тижнях цим значенням більше не керується.
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsed = new Date(dateParam);
      if (!Number.isNaN(parsed.getTime())) {
        return getWeekStart(parsed);
      }
    }
    return getWeekStart(new Date());
  });

  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingSlot, setPendingSlot] = useState<{ slot: TimeSlot; dayCloseTime: Date } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [loginRequiredOpen, setLoginRequiredOpen] = useState(false);
  const [verificationRequiredOpen, setVerificationRequiredOpen] = useState(false);

  // Якщо повернулись за посиланням з /api/auth/verify?...redirect=/?verified=1 —
  // показуємо один раз дружній банер. Лінивий ініціалізатор читає URL лише
  // при монтуванні, самé значення прапорця далі керується лише dismiss-ом.
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(() => searchParams.get('verified') === '1');

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const daySlotsByDay = useMemo(() => weekDays.map((day) => getDaySlots(day)), [weekDays]);

  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const kyivOffset = useMemo(() => getTimezoneOffsetLabel(KYIV_TIMEZONE), []);
  const browserOffset = useMemo(() => getTimezoneOffsetLabel(browserTimezone), [browserTimezone]);

  // ---- Кімнати — один раз при монтуванні (поточний користувач іде з AuthProvider) ----
  useEffect(() => {
    async function loadRooms() {
      try {
        const roomsRes = await fetch('/api/rooms');
        const roomsData = await roomsRes.json();
        const fetchedRooms: Room[] = roomsData.rooms ?? [];
        setRooms(fetchedRooms);

        // Якщо в URL є ?roomId=... і така кімната справді існує — обираємо
        // саме її (deep-link з "Моїх бронювань"), інакше перша зі списку.
        const roomIdParam = searchParams.get('roomId');
        const matchedRoom = roomIdParam ? fetchedRooms.find((r) => r.id === roomIdParam) : undefined;
        setSelectedRoomId(matchedRoom?.id ?? fetchedRooms[0]?.id ?? null);
      } catch {
        setError('Не вдалося завантажити список кімнат');
      } finally {
        setLoadingRooms(false);
      }
    }
    loadRooms();
    // Навмисно порожній масив залежностей: параметри з URL нас цікавлять
    // лише в момент першого завантаження сторінки, а не при кожній зміні.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Бронювання для вибраної кімнати й тижня ----
  const loadBookings = useCallback(async () => {
    if (!selectedRoomId) return;
    setLoadingBookings(true);
    setError(null);
    try {
      const from = weekStart.toISOString();
      const to = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch(`/api/bookings?roomId=${selectedRoomId}&from=${from}&to=${to}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Не вдалося завантажити бронювання');
        return;
      }
      setBookings(data.bookings ?? []);
    } catch {
      setError("Помилка з'єднання із сервером");
    } finally {
      setLoadingBookings(false);
    }
  }, [selectedRoomId, weekStart]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  const goToPreviousWeek = () => setWeekStart((prev) => new Date(prev.getTime() - 7 * 24 * 60 * 60 * 1000));
  const goToNextWeek = () => setWeekStart((prev) => new Date(prev.getTime() + 7 * 24 * 60 * 60 * 1000));
  const goToToday = () => setWeekStart(getWeekStart(new Date()));

  function handleSlotClick(slot: TimeSlot, dayCloseTime: Date) {
    if (!currentUser) {
      setLoginRequiredOpen(true);
      return;
    }
    if (!currentUser.isVerified) {
      setVerificationRequiredOpen(true);
      return;
    }
    setPendingSlot({ slot, dayCloseTime });
  }

  function handleBookingCreated(newBookings: Booking[]) {
    setBookings((prev) => [...prev, ...newBookings]);
    setPendingSlot(null);
  }

  function handleBookingCancelled(bookingId: string) {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
    setCancelTarget(null);
  }

  function handleSeriesCancelled(seriesId: string) {
    // Сервер скасовує лише МАЙБУТНІ повторення серії — тож із локального
    // стану теж прибираємо тільки ті, що ще не почались.
    const now = Date.now();
    setBookings((prev) =>
      prev.filter((b) => !(b.seriesId === seriesId && new Date(b.startTime).getTime() > now))
    );
    setCancelTarget(null);
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Заголовок і вибір кімнати */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Розклад переговорних</h1>
        {!loadingRooms && rooms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  room.id === selectedRoomId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {room.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Навігація по тижнях + підпис часових поясів */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={goToPreviousWeek} aria-label="Попередній тиждень" className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goToToday} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Сьогодні
          </button>
          <button onClick={goToNextWeek} aria-label="Наступний тиждень" className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-1 text-sm font-medium text-slate-700">{formatWeekRangeLabel(weekStart)}</span>
        </div>

        <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
          <Globe className="h-3.5 w-3.5" />
          <span>
            Офісний час: Europe/Kyiv ({kyivOffset})
            {browserTimezone !== KYIV_TIMEZONE && <> · Показано у вашому поясі: {browserTimezone} ({browserOffset})</>}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {showVerifiedBanner && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Email підтверджено — тепер ви можете створювати бронювання.
          </span>
          <button
            type="button"
            onClick={() => setShowVerifiedBanner(false)}
            className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100"
            aria-label="Закрити"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {currentUser && !currentUser.isVerified && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" />
          Email ще не підтверджено — бронювання будуть недоступні, доки ви не перейдете за посиланням із консолі сервера.
        </div>
      )}

      {/* Сітка розкладу */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[820px]">
          {/* Заголовки днів */}
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-200">
            <div className="border-r border-slate-200" />
            {weekDays.map((day, i) => {
              const { weekday, dayMonth } = formatDayHeader(day);
              const today = isKyivToday(day);
              return (
                <div key={i} className={`border-r border-slate-200 px-2 py-2 text-center last:border-r-0 ${today ? 'bg-indigo-50' : ''}`}>
                  <div className={`text-xs uppercase ${today ? 'text-indigo-600' : 'text-slate-400'}`}>{weekday}</div>
                  <div className={`text-sm font-semibold ${today ? 'text-indigo-700' : 'text-slate-700'}`}>{dayMonth}</div>
                </div>
              );
            })}
          </div>

          {/* Тіло: вісь часу + 7 колонок днів */}
          <div className="relative grid grid-cols-[64px_repeat(7,1fr)]">
            {/* Вісь часу — локальний час браузера, підпис кожної години */}
            <div className="border-r border-slate-200">
              {daySlotsByDay[0]?.map((slot, i) => (
                <div
                  key={i}
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-start justify-end border-t border-slate-100 px-2 pt-0.5 text-[11px] text-slate-400 first:border-t-0"
                >
                  {i % 2 === 0 ? formatLocalTime(slot.start) : ''}
                </div>
              ))}
            </div>

            {/* Колонки днів — кожна є власним CSS Grid із 20 рядками */}
            {weekDays.map((day, dayIndex) => {
              const slots = daySlotsByDay[dayIndex];
              const dayCloseTime = slots[slots.length - 1].end;
              const dayBookings = bookings.filter((b) => {
                const bStart = new Date(b.startTime).getTime();
                return bStart >= slots[0].start.getTime() && bStart < dayCloseTime.getTime();
              });

              return (
                <div
                  key={dayIndex}
                  className="grid border-r border-slate-200 last:border-r-0"
                  style={{ gridTemplateRows: `repeat(${TOTAL_SLOTS}, ${ROW_HEIGHT}px)` }}
                >
                  {/* Фонові слоти — клікабельні, якщо вільні й у майбутньому */}
                  {slots.map((slot, slotIndex) => {
                    const isPast = slot.start.getTime() <= Date.now();
                    return (
                      <button
                        key={slotIndex}
                        type="button"
                        disabled={isPast}
                        onClick={() => handleSlotClick(slot, dayCloseTime)}
                        style={{ gridRow: `${slotIndex + 1} / ${slotIndex + 2}` }}
                        className={`border-t ${slotIndex % 2 === 0 ? 'border-slate-200' : 'border-slate-100'} ${
                          isPast ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-indigo-50'
                        }`}
                        aria-label={`Забронювати ${formatLocalTime(slot.start)}`}
                      />
                    );
                  })}

                  {/* Блоки бронювань — розміщені у тих самих grid-рядках, span = тривалість / 30 хв */}
                  {dayBookings.map((booking) => {
                    const bStart = new Date(booking.startTime);
                    const bEnd = new Date(booking.endTime);
                    const startSlotIdx = Math.round((bStart.getTime() - slots[0].start.getTime()) / (30 * 60000));
                    const spanSlots = Math.round((bEnd.getTime() - bStart.getTime()) / (30 * 60000));
                    const isOwn = currentUser !== null && booking.user.id === currentUser.id;

                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => isOwn && setCancelTarget(booking)}
                        disabled={!isOwn}
                        style={{
                          gridRow: `${startSlotIdx + 1} / ${startSlotIdx + 1 + spanSlots}`,
                          // Явний height: calc() + alignSelf: 'start' замість покладання
                          // на стандартний grid-stretch (align-items: stretch) + margin:
                          // блок гарантовано "прибитий" до ВЕРХНЬОЇ межі своїх рядків і
                          // залишає точно 6px вільного простору ВНИЗУ, перед наступним
                          // слотом — тому сусідній вільний слот одразу після цього
                          // бронювання завжди лишається на 100% клікабельним, а не лише
                          // тонкою смужкою по краю.
                          alignSelf: 'start',
                          height: 'calc(100% - 6px)',
                        }}
                        title={`${booking.title} · ${booking.user.name}`}
                        className={`z-10 mx-0.5 mt-0.5 flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ${
                          isOwn ? 'cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700' : 'cursor-default bg-slate-500 text-white'
                        }`}
                      >
                        <span className="flex items-center gap-1 font-medium">
                          {isOwn ? <CalendarCheck className="h-3 w-3 flex-shrink-0" /> : <Lock className="h-3 w-3 flex-shrink-0" />}
                          <span className="truncate">{booking.title}</span>
                          {booking.seriesId && <Repeat className="h-3 w-3 flex-shrink-0 opacity-80" aria-label="Повторюване бронювання" />}
                        </span>
                        <span className="flex items-center gap-1 truncate opacity-90">
                          <UserIcon className="h-3 w-3 flex-shrink-0" />
                          {booking.user.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {loadingBookings && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Легенда */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-indigo-600" /> Ваші бронювання</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-slate-500" /> Бронювання інших</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-slate-50 ring-1 ring-slate-200" /> Минулий час</span>
      </div>

      {/* Модальні вікна */}
      {pendingSlot && selectedRoom && (
        <BookingModal
          isOpen
          room={selectedRoom}
          slotStart={pendingSlot.slot.start}
          dayCloseTime={pendingSlot.dayCloseTime}
          onClose={() => setPendingSlot(null)}
          onCreated={handleBookingCreated}
        />
      )}

      <CancelBookingDialog
        isOpen={cancelTarget !== null}
        booking={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={handleBookingCancelled}
        onSeriesCancelled={handleSeriesCancelled}
      />

      <LoginRequiredDialog isOpen={loginRequiredOpen} onClose={() => setLoginRequiredOpen(false)} />

      {currentUser && (
        <EmailVerificationRequiredDialog
          isOpen={verificationRequiredOpen}
          email={currentUser.email}
          onClose={() => setVerificationRequiredOpen(false)}
        />
      )}
    </div>
  );
}
