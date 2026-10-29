import { defineConfig } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const schema =
  process.env.ADMIN_E2E_SCHEMA ??
  `admin_e2e_${randomUUID().replaceAll('-', '')}`;
if (!/^admin_e2e_[0-9a-f]{32}$/.test(schema))
  throw new Error('Invalid manager test schema');
process.env.ADMIN_E2E_SCHEMA = schema;
process.env.ADMIN_E2E_PHONE ??= '+79990002001';
process.env.ADMIN_E2E_PASSWORD ??= `Manager-${randomBytes(24).toString('base64url')}!`;

export default defineConfig({
  testDir: '.',
  testMatch: 'admin.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  outputDir:
    process.env.ADMIN_OUTPUT_DIR ?? resolve(root, 'test-results/admin'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3104',
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
      command: 'node scripts/admin-e2e-api.mjs',
      cwd: root,
      url: 'http://127.0.0.1:3193/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: {
        ADMIN_E2E_SCHEMA: schema,
        ADMIN_E2E_PHONE: process.env.ADMIN_E2E_PHONE,
        ADMIN_E2E_PASSWORD: process.env.ADMIN_E2E_PASSWORD,
      },
    },
    {
      command:
        'pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port 3104',
      cwd: root,
      url: 'http://127.0.0.1:3104/admin',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        AUTH_API_URL: 'http://127.0.0.1:3193',
        CATALOG_API_URL: 'http://127.0.0.1:3193',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
