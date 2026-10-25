import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const schema =
  process.env.ACCOUNT_E2E_SCHEMA ??
  `account_e2e_${randomUUID().replaceAll('-', '')}`;
if (!/^account_e2e_[0-9a-f]{32}$/.test(schema)) {
  throw new Error('Invalid account test schema');
}
// Test metadata only; workers inherit the same owned schema. No credentials here.
process.env.ACCOUNT_E2E_SCHEMA = schema;

export default defineConfig({
  testDir: '.',
  testMatch: 'account.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  outputDir:
    process.env.ACCOUNT_OUTPUT_DIR ?? resolve(root, 'test-results/account'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3102',
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    screenshot: 'only-on-failure',
    // Auth traces can contain form credentials and session headers: never retain them.
    trace: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: 'node scripts/account-e2e-api.mjs',
      cwd: root,
      url: 'http://127.0.0.1:3181/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      env: { ACCOUNT_E2E_SCHEMA: schema },
    },
    ...[
      { port: 3102, apiPort: 3181 },
      { port: 3103, apiPort: 3182 },
    ].map(({ port, apiPort }) => ({
      command: `pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port ${port}`,
      cwd: root,
      url: `http://127.0.0.1:${port}/account`,
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10000 },
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        AUTH_API_URL: `http://127.0.0.1:${apiPort}`,
      },
    })),
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
