'use client';

import { useState, useEffect } from 'react';
import { MailCheck, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface EmailVerificationRequiredDialogProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
}

export default function EmailVerificationRequiredDialog({
  isOpen,
  email,
  onClose,
}: EmailVerificationRequiredDialogProps) {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResent(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Не вдалося надіслати лист повторно');
        return;
      }
      setResent(true);
    } catch {
      setError("Помилка з'єднання із сервером. Спробуйте ще раз");
    } finally {
      setResending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-required-title"
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

        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <MailCheck className="h-6 w-6 text-amber-600" />
        </div>
        <h2 id="verify-required-title" className="text-lg font-semibold text-slate-900">
          Підтвердіть email, щоб бронювати
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Ми надіслали посилання підтвердження на <span className="font-medium text-slate-700">{email}</span>.
          У dev-режимі воно виводиться в консоль сервера (термінал з <code>docker-compose up</code>).
        </p>

        {resent && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Лист надіслано повторно — перевірте консоль сервера.
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Закрити
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {resending && <Loader2 className="h-4 w-4 animate-spin" />}
            Надіслати ще раз
          </button>
        </div>
      </div>
    </div>
  );
}
