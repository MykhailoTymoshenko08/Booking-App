'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Users,
  Bell,
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

  // Фільтр за мінімальною місткістю кімнати. 0 = "Будь-яка" (без фільтра).
  const [minCapacity, setMinCapacity] = useState(0);

  // За скільки хвилин до кінця бронювання показувати тост-сповіщення,
  // якщо наступний слот у кімнаті вже зайнятий. Значення підтягується
  // з /api/config (сервер читає process.env.NOTIFY_BEFORE_MINUTES),
  // 10 — розумний дефолт, поки конфіг ще не завантажився.
  const [notifyBeforeMinutes, setNotifyBeforeMinutes] = useState(10);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  // Booking id, для яких сповіщення вже показано — щоб не дублювати тост
  // на кожному тіку інтервалу. Ref, а не state: не повинен викликати ререндер.
  const notifiedBookingIdsRef = useRef<Set<string>>(new Set());

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

  // ---- Runtime-конфіг (NOTIFY_BEFORE_MINUTES) — один раз при монтуванні ----
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.notifyBeforeMinutes === 'number') {
          setNotifyBeforeMinutes(data.notifyBeforeMinutes);
        }
      })
      .catch(() => {
        // Мовчазний fallback на дефолтні 10 хв — не критично для роботи сітки.
      });
  }, []);

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

  // Пороги для пілюль фільтра — динамічно з реальних місткостей кімнат
  // (а не захардкоджені числа), тож фільтр завжди відповідає даним з БД.
  const capacityOptions = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.capacity))).sort((a, b) => a - b),
    [rooms]
  );
  const filteredRooms = useMemo(
    () => rooms.filter((r) => r.capacity >= minCapacity),
    [rooms, minCapacity]
  );

  // Якщо після зміни фільтра поточна вибрана кімната випала зі списку —
  // автоматично переключаємось на першу відповідну, а не лишаємо порожній стан.
  useEffect(() => {
    if (filteredRooms.length === 0) return;
    if (!filteredRooms.some((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(filteredRooms[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minCapacity, filteredRooms]);

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

  function pushToast(message: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message }]);
    // Автоматичне зникнення через 10 секунд.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 10000);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // ---- Сповіщення "кінець бронювання, наступний слот зайнятий" ----
  // Перевіряємо кожні 15 секунд стан УЖЕ ЗАВАНТАЖЕНИХ бронювань поточної
  // кімнати/тижня (без додаткових запитів до сервера). Оскільки перевірка
  // відбувається щоразу заново на основі АКТУАЛЬНОГО масиву `bookings`,
  // а не одноразового таймера при монтуванні — якщо власне бронювання АБО
  // наступне (яке його "підпирає") скасовується, умова просто перестає
  // виконуватись і сповіщення само по собі не приходить.
  useEffect(() => {
    if (!currentUser) return;

    function checkForEndingBookings() {
      const now = Date.now();

      for (const booking of bookings) {
        if (booking.user.id !== currentUser!.id) continue;
        if (notifiedBookingIdsRef.current.has(booking.id)) continue;

        const endMs = new Date(booking.endTime).getTime();
        const msUntilEnd = endMs - now;
        const notifyWindowMs = notifyBeforeMinutes * 60 * 1000;

        // Ще рано (більше ніж N хвилин лишилось) або вже закінчилось.
        if (msUntilEnd <= 0 || msUntilEnd > notifyWindowMs) continue;

        // Чи зайнятий наступний слот у ЦІЙ кімнаті одразу після цього
        // бронювання (інше бронювання починається рівно тоді, коли це
        // закінчується — впритул, без розриву)?
        const nextSlotOccupied = bookings.some(
          (other) => other.id !== booking.id && other.roomId === booking.roomId && new Date(other.startTime).getTime() === endMs
        );
        if (!nextSlotOccupied) continue;

        notifiedBookingIdsRef.current.add(booking.id);
        const minutesLeft = Math.max(1, Math.round(msUntilEnd / 60000));
        pushToast(
          `"${booking.title}" у кімнаті ${booking.room.name} закінчується через ${minutesLeft} хв — наступна зустріч уже чекає.`
        );
      }
    }

    checkForEndingBookings();
    const interval = setInterval(checkForEndingBookings, 15000);
    return () => clearInterval(interval);
  }, [bookings, currentUser, notifyBeforeMinutes]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Заголовок */}
      <h1 className="mb-3 text-xl font-semibold text-slate-900">Розклад переговорних</h1>

      {/* Кімнати */}
      {!loadingRooms && rooms.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {filteredRooms.length === 0 ? (
            <span className="text-sm text-slate-500">Немає кімнат із такою місткістю.</span>
          ) : (
            filteredRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  room.id === selectedRoomId ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {room.name} · {room.capacity}
              </button>
            ))
          )}
        </div>
      )}

      {/* Фільтр за місткістю */}
      {!loadingRooms && capacityOptions.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
            <Users className="h-3.5 w-3.5" />
            Місткість:
          </span>
          <button
            onClick={() => setMinCapacity(0)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              minCapacity === 0 ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Будь-яка
          </button>
          {capacityOptions.map((capacity) => (
            <button
              key={capacity}
              onClick={() => setMinCapacity(capacity)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                minCapacity === capacity ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {capacity}+
            </button>
          ))}
        </div>
      )}

      {/* Навігація по тижнях + підпис часових поясів (стек на мобільному) */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Підказка про горизонтальний скрол — лише на вузьких екранах */}
      <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-400 sm:hidden">
        <ChevronRight className="h-3 w-3" />
        Гортайте сітку по горизонталі, щоб побачити всі дні тижня
      </p>

      {/* Сітка розкладу */}
      <div className="relative">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[640px] sm:min-w-[820px]">
            {/* Заголовки днів */}
            <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-slate-200 sm:grid-cols-[64px_repeat(7,1fr)]">
              <div className="border-r border-slate-200" />
              {weekDays.map((day, i) => {
                const { weekday, dayMonth } = formatDayHeader(day);
                const today = isKyivToday(day);
                return (
                  <div key={i} className={`border-r border-slate-200 px-1 py-2 text-center last:border-r-0 sm:px-2 ${today ? 'bg-indigo-50' : ''}`}>
                    <div className={`text-[10px] uppercase sm:text-xs ${today ? 'text-indigo-600' : 'text-slate-400'}`}>{weekday}</div>
                    <div className={`text-xs font-semibold sm:text-sm ${today ? 'text-indigo-700' : 'text-slate-700'}`}>{dayMonth}</div>
                  </div>
                );
              })}
            </div>

            {/* Тіло: вісь часу + 7 колонок днів */}
            <div className="relative grid grid-cols-[48px_repeat(7,1fr)] sm:grid-cols-[64px_repeat(7,1fr)]">
              {/* Вісь часу — локальний час браузера, підпис кожної години */}
              <div className="border-r border-slate-200">
                {daySlotsByDay[0]?.map((slot, i) => (
                  <div
                    key={i}
                    style={{ height: ROW_HEIGHT }}
                    className="flex items-start justify-end border-t border-slate-100 px-1 pt-0.5 text-[10px] text-slate-400 first:border-t-0 sm:px-2 sm:text-[11px]"
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

        {/* Градієнт-хінт справа: підказує, що сітку можна прогорнути далі (лише мобільні) */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent sm:hidden" />
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

      {/* Тости "кінець бронювання" — фіксовані внизу справа, стеком */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-lg"
            >
              <Bell className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Закрити сповіщення"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
