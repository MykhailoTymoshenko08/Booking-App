'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Lock, X } from 'lucide-react';

interface LoginRequiredDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginRequiredDialog({ isOpen, onClose }: LoginRequiredDialogProps) {
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-required-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Закрити"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
          <Lock className="h-6 w-6 text-indigo-600" />
        </div>
        <h2 id="login-required-title" className="text-lg font-semibold text-slate-900">
          Увійдіть, щоб створити бронювання
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Бронювати переговорні кімнати можуть лише авторизовані користувачі.
        </p>

        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <LogIn className="h-4 w-4" />
            Увійти
          </button>
        </div>
      </div>
    </div>
  );
}
