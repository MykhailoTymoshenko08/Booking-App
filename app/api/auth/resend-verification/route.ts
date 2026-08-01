import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAndSendVerificationToken } from '@/lib/email-verification';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Необхідна автентифікація' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, isVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Користувача не знайдено' }, { status: 404 });
  }

  if (user.isVerified) {
    return NextResponse.json({ error: 'Email вже підтверджено' }, { status: 409 });
  }

  await createAndSendVerificationToken(user.id, user.email, request.nextUrl.origin);

  return NextResponse.json({ success: true });
}
