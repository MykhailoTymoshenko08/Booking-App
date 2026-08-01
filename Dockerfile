# syntax=docker/dockerfile:1

FROM node:20-slim AS base
WORKDIR /app
# openssl потрібен Prisma Client для роботи з БД
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ---------- 1. Залежності (кешується окремим шаром) ----------
# --ignore-scripts: на цьому етапі ще немає prisma/schema.prisma (копіюється пізніше,
# на етапі builder), тож postinstall-хук "prisma generate" тут би впав з помилкою.
# Явний "npx prisma generate" нижче, на етапі builder, виконує цю ж роботу вже
# після копіювання повного вихідного коду.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# ---------- 2. Збірка ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---------- 3. Рантайм-образ ----------
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
