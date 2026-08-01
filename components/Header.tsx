'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, ListChecks, LogIn, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function Header() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/');
    router.refresh();
  }

  function navLinkClass(href: string): string {
    const isActive = pathname === href;
    return `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
    }`;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <CalendarDays className="h-5 w-5 text-indigo-600" />
          Переговорні
        </Link>

        <nav className="flex items-center gap-1">
          <Link href="/" className={navLinkClass('/')}>
            Розклад
          </Link>
          <Link href="/my-bookings" className={navLinkClass('/my-bookings')}>
            <ListChecks className="h-4 w-4" />
            Мої бронювання
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {loading ? (
            <div className="h-8 w-20 animate-pulse rounded-md bg-slate-100" />
          ) : user ? (
            <>
              <span className="text-sm text-slate-600">{user.name}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Вийти
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <LogIn className="h-4 w-4" />
                Вхід
              </Link>
              <Link
                href="/register"
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                Реєстрація
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
