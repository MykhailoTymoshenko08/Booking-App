import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Необхідна автентифікація' }, { status: 401 });
    }

    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Бронювання не знайдено' }, { status: 404 });
    }

    if (booking.userId !== session.userId) {
      return NextResponse.json(
        { error: 'Ви можете скасовувати лише власні бронювання' },
        { status: 403 }
      );
    }

    await prisma.booking.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete booking error:', error);
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 });
  }
}