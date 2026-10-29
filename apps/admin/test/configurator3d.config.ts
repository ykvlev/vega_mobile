import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: '.',
  testMatch: 'configurator3d.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 20000 },
  outputDir: resolve(__dirname, '../../../test-results/configurator3d'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3108',
    viewport: { width: 1440, height: 1000 },
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  webServer: {
    command:
      'pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port 3108',
    cwd: resolve(__dirname, '../../..'),
    url: 'http://127.0.0.1:3108/configurator3d',
    reuseExistingServer: false,
    timeout: 30000,
    env: { NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
