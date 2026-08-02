import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.integration.test.ts'],
    // Реальні мережеві запити + БД повільніші за юніт-тести —
    // дефолтних 5с для hook/test замало для стабільного CI.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
