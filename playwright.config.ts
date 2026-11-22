import { defineConfig } from '@playwright/test';

// Browser tests (e2e/) against the production build in dist/: run `npm run build` first.
// Chromium comes from Playwright's own install (`npx playwright install --with-deps chromium` in CI).
export default defineConfig({
    testDir: 'e2e',
    timeout: 45_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    retries: 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    outputDir: 'test-results',
    use: {
        baseURL: 'http://127.0.0.1:8124',
        screenshot: 'only-on-failure',
        trace: 'off',
    },
    webServer: {
        command: 'node e2e/serve.cjs 8124',
        url: 'http://127.0.0.1:8124/',
        reuseExistingServer: !process.env.CI,
    },
});
