'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): boolean {
    const errs: FieldErrors = {};
    if (name.trim().length === 0) errs.name = "Ім'я обов'язкове";
    if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = 'Некоректний email';
    if (password.length < 8 || password.length > 72) {
      errs.password = 'Пароль має містити від 8 до 72 символів';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Не вдалося зареєструватися');
        return;
      }

      await refresh();
      router.push('/');
    } catch {
      setError("Помилка з'єднання із сервером. Спробуйте ще раз");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 flex items-center gap-2 text-xl font-semibold text-slate-900">
        <UserPlus className="h-5 w-5 text-indigo-600" />
        Реєстрація
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
            Ім&apos;я
          </label>
          <input
            id="name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
              fieldErrors.name ? 'border-red-400' : 'border-slate-300'
            }`}
          />
          {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
              fieldErrors.email ? 'border-red-400' : 'border-slate-300'
            }`}
          />
          {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
              fieldErrors.password ? 'border-red-400' : 'border-slate-300'
            }`}
          />
          {fieldErrors.password ? (
            <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Від 8 до 72 символів</p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Зареєструватися
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Вже є акаунт?{' '}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          Увійти
        </Link>
      </p>
    </div>
  );
}
