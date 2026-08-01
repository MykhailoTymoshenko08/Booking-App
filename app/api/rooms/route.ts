import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rooms = await prisma.room.findMany({
    orderBy: [{ floor: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json({ rooms });
}
