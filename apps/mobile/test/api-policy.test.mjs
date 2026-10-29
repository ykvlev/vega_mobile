// Executes the actual TypeScript API module with transport/platform doubles.
// This proves application request policy, not native TLS or OS transport behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const contracts = require('@vega/contracts');
const code = ts.transpileModule(
  readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const phone = '+79990003001';
const user = {
  id: 'f32689ce-6a38-4e74-a798-f79bba0e5bd7',
  phone,
  role: 'customer',
  commercialAccessStatus: 'pending',
  phoneVerified: false,
};
function load({
  origin = 'https://api.vega.example',
  platform = 'ios',
  development = false,
  allowHttp = 'false',
  respond = () => ({ items: [], nextCursor: null }),
} = {}) {
  const calls = [];
  const exports = {};
  const module = { exports };
  const mockedRequire = (name) => {
    if (name === '@vega/contracts') return contracts;
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === 'expo/fetch')
      return {
        fetch: async (url, options) => {
          calls.push({ url, options });
          return new globalThis.Response(
            JSON.stringify(respond(url, options)),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      };
    throw new Error(`Unexpected API dependency: ${name}`);
  };
  const execute = vm.runInNewContext(
    `(function(require,module,exports){${code}\n})`,
    {
      process: {
        env: {
          EXPO_PUBLIC_API_URL: origin,
          EXPO_PUBLIC_ALLOW_HTTP_DEMO: allowHttp,
        },
      },
      __DEV__: development,
      URL,
      URLSearchParams: globalThis.URLSearchParams,
      AbortController: globalThis.AbortController,
      TextDecoder: globalThis.TextDecoder,
      setTimeout,
      clearTimeout,
      Date,
      JSON,
      Promise,
      Set,
      Error,
    },
  );
  execute(mockedRequire, module, exports);
  return { api: module.exports, calls };
}

test('native production rejects every HTTP origin including loopback and opted-in LAN', async () => {
  for (const platform of ['ios', 'android']) {
    for (const origin of [
      'http://127.0.0.1:3001',
      'http://localhost:3001',
      'http://[::1]:3001',
      'http://192.168.1.20:3001',
    ]) {
      const app = load({ platform, origin, allowHttp: 'true' });
      await assert.rejects(
        () => app.api.listProducts(),
        (error) => error.kind === 'configuration',
      );
      assert.equal(app.calls.length, 0);
    }
  }
});

test('development LAN HTTP needs explicit opt-in and never accepts public HTTP', async () => {
  for (const origin of [
    'http://10.0.2.2:3001',
    'http://192.168.1.20:3001',
    'http://172.16.0.5:3001',
  ]) {
    const refused = load({ origin, development: true });
    await assert.rejects(
      () => refused.api.listProducts(),
      (error) => error.kind === 'configuration',
    );
    assert.equal(refused.calls.length, 0);
    const allowed = load({ origin, development: true, allowHttp: 'true' });
    await allowed.api.listProducts();
    assert.equal(allowed.calls.length, 1);
  }
  const publicHttp = load({
    origin: 'http://203.0.113.5:3001',
    development: true,
    allowHttp: 'true',
  });
  await assert.rejects(
    () => publicHttp.api.listProducts(),
    (error) => error.kind === 'configuration',
  );
  assert.equal(publicHttp.calls.length, 0);
});

test('web export permits loopback fixture but rejects credentials, paths and public HTTP', async () => {
  const fixture = load({ origin: 'http://127.0.0.1:3106', platform: 'web' });
  await fixture.api.listProducts();
  assert.equal(
    fixture.calls[0].url,
    'http://127.0.0.1:3106/api/v1/products?limit=20',
  );
  for (const origin of [
    ['https://', 'user', ':', 'password', '@api.vega.example'].join(''),
    'https://api.vega.example/path',
    'https://api.vega.example?key=invalid',
    'http://public.example',
  ]) {
    const app = load({ origin, platform: 'web' });
    await assert.rejects(
      () => app.api.listProducts(),
      (error) => error.kind === 'configuration',
    );
    assert.equal(app.calls.length, 0);
  }
});

test('HTTPS authenticated requests disable redirects and cookies and keep bearer out of URL', async () => {
  const session = {
    token: 'B'.repeat(43),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const app = load({
    respond: (url) => (url.endsWith('/me') ? { user } : { user, session }),
  });
  const password = ['a', 'long', 'demo', 'password'].join('-');
  await app.api.login({ phone, password });
  await app.api.getMe(session.token);
  assert.equal(app.calls.length, 2);
  for (const call of app.calls) {
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.url.startsWith('https://api.vega.example/'), true);
    assert.equal(call.url.includes(session.token), false);
    assert.equal(call.url.includes(password), false);
  }
  assert.equal(app.calls[0].options.headers.Authorization, undefined);
  assert.equal(
    app.calls[1].options.headers.Authorization,
    `Bearer ${session.token}`,
  );
  assert.equal(JSON.parse(app.calls[0].options.body).phone, phone);
});

test('client cannot add approval or manager assignment to authentication body', async () => {
  const app = load();
  const credentials = {
    phone,
    password: ['a', 'long', 'demo', 'password'].join('-'),
  };
  for (const extra of [
    { commercialAccessStatus: 'approved' },
    { managerId: user.id },
    { role: 'manager' },
  ]) {
    await assert.rejects(
      async () => app.api.register({ ...credentials, ...extra }),
      (error) => error.kind === 'validation',
    );
    await assert.rejects(
      async () => app.api.login({ ...credentials, ...extra }),
      (error) => error.kind === 'validation',
    );
  }
  assert.equal(app.calls.length, 0);
});

test('public image mapping uses configured origin, never transport or bearer', () => {
  const app = load();
  const id = user.id;
  assert.equal(
    app.api.productImageUrl(`https://untrusted.example/api/v1/media/${id}`),
    `https://api.vega.example/api/v1/media/${id}`,
  );
  assert.equal(
    app.api.productImageUrl(
      `https://untrusted.example/api/v1/media/${id}?token=invalid`,
    ),
    null,
  );
  assert.equal(app.api.productImageUrl('javascript:invalid'), null);
  assert.equal(
    app.api.productImageUrl('https://untrusted.example/other-image'),
    null,
  );
  assert.equal(app.calls.length, 0);
});
