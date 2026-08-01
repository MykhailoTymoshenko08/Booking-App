import { Suspense } from 'react';
import BookingCalendar from '@/components/BookingCalendar';

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <BookingCalendar />
    </Suspense>
  );
}
