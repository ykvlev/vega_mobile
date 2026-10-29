import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const externalBaseURL = process.env.DESIGN_PREVIEW_BASE_URL;

export default defineConfig({
  testDir: '.',
  testMatch: 'design-preview.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  outputDir:
    process.env.DESIGN_PREVIEW_OUTPUT_DIR ??
    resolve(__dirname, '../../../test-results/design-preview'),
  reporter: [['list']],
  use: {
    baseURL: externalBaseURL ?? 'http://127.0.0.1:3100',
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          'pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port 3100',
        cwd: resolve(__dirname, '../../..'),
        url: 'http://127.0.0.1:3100/design-preview',
        reuseExistingServer: false,
        timeout: 30000,
        env: { NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
