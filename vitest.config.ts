import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
    // Інтеграційні тести (tests/integration/**) мають власний конфіг
    // (vitest.integration.config.ts) і власний npm-скрипт, бо потребують
    // живого HTTP-сервера й реальної БД — не повинні випадково підхопитись
    // сюди й провалитись у судді/CI, де сервер не піднятий.
    exclude: ['**/node_modules/**', 'tests/integration/**'],
  },
});
