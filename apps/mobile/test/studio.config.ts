import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import renderer from '../../admin/test/configurator3d.config';

const root = resolve(__dirname, '../../..');
export default defineConfig({
  ...renderer,
  testDir: '.',
  testMatch: 'studio.spec.ts',
  outputDir: resolve(root, 'test-results/mobile-studio'),
  use: {
    ...renderer.use,
    baseURL: 'http://127.0.0.1:3106',
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command:
        'pnpm --filter @vega/admin exec next start --hostname 127.0.0.1 --port 3108',
      cwd: root,
      url: 'http://127.0.0.1:3108/configurator3d/embed',
      reuseExistingServer: false,
      timeout: 30000,
      env: { NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
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
});
