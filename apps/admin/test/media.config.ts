import { defineConfig } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const schema =
  process.env.MEDIA_E2E_SCHEMA ??
  `media_e2e_${randomUUID().replaceAll('-', '')}`;
if (!/^media_e2e_[0-9a-f]{32}$/.test(schema))
  throw new Error('Invalid media test schema');
process.env.MEDIA_E2E_SCHEMA = schema;
process.env.MEDIA_E2E_PHONE ??= '+79990002001';
process.env.MEDIA_E2E_PASSWORD ??= `Manager-${randomBytes(24).toString('base64url')}!`;

export default defineConfig({
  testDir: '.',
  testMatch: 'media.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  outputDir:
    process.env.MEDIA_OUTPUT_DIR ?? resolve(root, 'test-results/media'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3105',
    actionTimeout: 5000,
    navigationTimeout: 10000,
    viewport: { width: 1440, height: 1000 },
    locale: 'ru-RU',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: 'node scripts/media-e2e-api.mjs',
      cwd: root,
      url: 'http://127.0.0.1:3201/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: {
        MEDIA_E2E_SCHEMA: schema,
        MEDIA_E2E_PHONE: process.env.MEDIA_E2E_PHONE,
        MEDIA_E2E_PASSWORD: process.env.MEDIA_E2E_PASSWORD,
      },
    },
    {
      command:
        'pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port 3105',
      cwd: root,
      url: 'http://127.0.0.1:3105/admin',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        AUTH_API_URL: 'http://127.0.0.1:3201',
        CATALOG_API_URL: 'http://127.0.0.1:3201',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
