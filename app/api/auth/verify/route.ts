import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Дозволяємо перейти за посиланням з листа без сесії в цьому браузері
// (наприклад, лист відкрили в іншій вкладці/пристрої) — довіряємо самому
// токену, а не поточній сесії.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?verifyError=missing_token', request.url));
  }

  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken || verificationToken.expiresAt < new Date()) {
    // Токен неіснує/вже використаний/протермінований — не розкриваємо деталей,
    // просто просимо запросити нове посилання.
    return NextResponse.redirect(new URL('/login?verifyError=invalid_token', request.url));
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verificationToken.userId },
      data: { isVerified: true },
    }),
    // Токен одноразовий — видаляємо одразу після використання.
    prisma.verificationToken.delete({ where: { id: verificationToken.id } }),
  ]);

  // Реальна навігація браузера (не client-side fetch), тому AuthProvider
  // при завантаженні "/" наново звернеться до /api/auth/me й побачить
  // вже оновлений isVerified: true.
  return NextResponse.redirect(new URL('/?verified=1', request.url));
}
