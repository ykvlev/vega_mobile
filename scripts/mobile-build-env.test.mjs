import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(
  new URL('./mobile-build-env.mjs', import.meta.url),
);
const cases = [
  ['missing endpoint', undefined, undefined, 1],
  [
    'HTTP LAN cannot enter an internal release',
    'http://192.168.1.20',
    undefined,
    1,
  ],
  [
    'phone loopback is not a reachable backend',
    'https://localhost',
    undefined,
    1,
  ],
  [
    'documentation placeholder cannot be shipped',
    'https://api.example.invalid',
    undefined,
    1,
  ],
  ['API path is not an origin', 'https://demo.vega.test/api/v1', undefined, 1],
  [
    'URL credentials stay out of logs',
    'https://user:test-only-marker@demo.vega.test',
    undefined,
    1,
  ],
  [
    'development bypass cannot enter EAS build',
    'https://demo.vega.test',
    'true',
    1,
  ],
  [
    'explicit HTTPS origin can proceed to compilation',
    'https://demo.vega.test',
    'false',
    0,
  ],
];
for (const [name, origin, bypass, status] of cases) {
  test(name, () => {
    const environment = { ...process.env };
    delete environment.EXPO_PUBLIC_API_URL;
    delete environment.EXPO_PUBLIC_ALLOW_HTTP_DEMO;
    if (origin !== undefined) environment.EXPO_PUBLIC_API_URL = origin;
    if (bypass !== undefined) environment.EXPO_PUBLIC_ALLOW_HTTP_DEMO = bypass;
    const result = spawnSync(process.execPath, [script], {
      env: environment,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, status);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /test-only-marker|demo\.vega\.test/,
    );
    if (status === 1) assert.match(result.stderr, /EXPO_PUBLIC_API_URL/);
    else assert.equal(result.stderr, '');
  });
}
