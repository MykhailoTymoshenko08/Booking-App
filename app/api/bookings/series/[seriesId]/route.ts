import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

// Роут завжди звертається до БД у рантаймі.
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Необхідна автентифікація' }, { status: 401 });
    }

    const { seriesId } = await params;

    // Скасовуємо лише МАЙБУТНІ бронювання цієї серії, що належать поточному
    // користувачу — минулі (вже відбулись) записи лишаємо як історію в
    // "Моїх бронюваннях", а не видаляємо заднім числом.
    const result = await prisma.booking.deleteMany({
      where: {
        seriesId,
        userId: session.userId,
        startTime: { gt: new Date() },
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Серію не знайдено або немає майбутніх бронювань для скасування' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, cancelledCount: result.count });
  } catch (error) {
    console.error('Cancel series error:', error);
    return NextResponse.json({ error: 'Внутрішня помилка сервера' }, { status: 500 });
  }
}
