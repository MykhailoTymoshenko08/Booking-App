#!/bin/sh
set -e

echo "📦 Синхронізуємо схему бази даних (prisma db push)..."
# Використовуємо db push, а не migrate deploy: у проєкті ще немає збереженої
# історії міграцій (prisma/migrations), тож migrate deploy тут не застосував би
# жодних змін і база лишилась би порожньою. Якщо пізніше додасте
# `npx prisma migrate dev --name init` і закомітите prisma/migrations —
# замініть рядок нижче назад на `npx prisma migrate deploy`.
npx prisma db push --skip-generate --accept-data-loss

echo "🌱 Сідуємо базу тестовими даними..."
npx prisma db seed

echo "🚀 Запускаємо застосунок..."
exec npm run start
