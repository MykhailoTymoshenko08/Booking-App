import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Починаємо сідування...');

  await prisma.booking.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  const roomsData = [
    { name: 'Акваріум', floor: 1, capacity: 4 },
    { name: 'Марс', floor: 2, capacity: 8 },
    { name: 'Гагарін', floor: 2, capacity: 12 },
    { name: 'Коворкінг', floor: 1, capacity: 6 },
    { name: 'Бункер', floor: 0, capacity: 2 },
    { name: 'Олімп', floor: 3, capacity: 20 },
  ];

  const rooms = await Promise.all(roomsData.map((room) => prisma.room.create({ data: room })));
  console.log(`✅ Створено ${rooms.length} кімнат`);

  const passwordHash = await bcrypt.hash('password123', 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@ua-skills.dev',
        name: 'Олена Адмін',
        passwordHash,
        isVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'user@ua-skills.dev',
        name: 'Іван Тестовий',
        passwordHash,
        isVerified: true,
      },
    }),
  ]);
  console.log(`✅ Створено ${users.length} користувачів`);

  function dateThisWeek(dayOffset: number, hour: number, minute = 0): Date {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const target = new Date(monday);
    target.setDate(monday.getDate() + dayOffset);
    target.setHours(hour, minute, 0, 0);
    return target;
  }

  const bookingsData = [
    {
      title: 'Дейлі команди розробки',
      startTime: dateThisWeek(1, 10, 0),
      endTime: dateThisWeek(1, 10, 30),
      roomId: rooms[0].id,
      userId: users[0].id,
    },
    {
      title: 'Співбесіда з кандидатом',
      startTime: dateThisWeek(1, 11, 0),
      endTime: dateThisWeek(1, 12, 0),
      roomId: rooms[0].id,
      userId: users[1].id,
    },
    {
      title: 'Демо для інвесторів',
      startTime: dateThisWeek(2, 14, 0),
      endTime: dateThisWeek(2, 15, 30),
      roomId: rooms[2].id,
      userId: users[0].id,
    },
    {
      title: 'Ретроспектива спринту',
      startTime: dateThisWeek(3, 16, 0),
      endTime: dateThisWeek(3, 17, 0),
      roomId: rooms[1].id,
      userId: users[1].id,
    },
  ];

  await Promise.all(bookingsData.map((booking) => prisma.booking.create({ data: booking })));
  console.log(`✅ Створено ${bookingsData.length} бронювань`);

  console.log('🌱 Сідування завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Помилка сідування:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
