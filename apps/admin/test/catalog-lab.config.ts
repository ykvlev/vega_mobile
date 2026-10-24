import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

export default defineConfig({
  testDir: '.',
  testMatch: 'catalog-lab.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  outputDir:
    process.env.CATALOG_LAB_OUTPUT_DIR ??
    resolve(root, 'test-results/catalog-lab'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3101',
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: 'node scripts/catalog-e2e-api.mjs',
      cwd: root,
      url: 'http://127.0.0.1:3171/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    },
    {
      command:
        'pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port 3101',
      cwd: root,
      url: 'http://127.0.0.1:3101/catalog-lab',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        CATALOG_API_URL: 'http://127.0.0.1:3171',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
