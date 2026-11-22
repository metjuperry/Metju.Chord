import { defineConfig } from 'vitest/config';

// Unit tests only: e2e/*.spec.ts are Playwright tests (npm run e2e), not Vitest's.
export default defineConfig({
    test: {
        include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    },
});
