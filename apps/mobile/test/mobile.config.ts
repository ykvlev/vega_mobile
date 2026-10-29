import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const schema =
  process.env.MOBILE_E2E_SCHEMA ??
  `mobile_e2e_${randomUUID().replaceAll('-', '')}`;
if (!/^mobile_e2e_[0-9a-f]{32}$/.test(schema))
  throw new Error('Invalid mobile test schema');
process.env.MOBILE_E2E_SCHEMA = schema;

export default defineConfig({
  testDir: '.',
  testMatch: 'mobile.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 7000 },
  outputDir: resolve(root, 'test-results/mobile'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3106',
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: 'node scripts/mobile-e2e-api.mjs',
      cwd: root,
      url: 'http://127.0.0.1:3202/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: { MOBILE_E2E_SCHEMA: schema },
    },
    {
      command: 'node scripts/mobile-web-server.mjs',
      cwd: root,
      url: 'http://127.0.0.1:3106',
      reuseExistingServer: false,
      timeout: 30000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
