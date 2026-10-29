import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadConfig } = require('../dist/config.js');
const {
  HealthController,
  ProductsController,
  escapeLikeLiteral,
} = require('../dist/controllers.js');
const { validateDemoSeedConfig } = require('../dist/demo-seed.js');
const {
  PasswordHasher,
  BoundedKdf,
  KdfBusyError,
  DUMMY_PASSWORD_HASH,
} = require('../dist/auth-password.js');
const { normalizeSource, tokenDigest } = require('../dist/auth-service.js');
const { isAuthPath } = require('../dist/auth-errors.js');
const { validateManagerProvision } = require('../dist/admin-provision.js');
const { AuthService } = require('../dist/auth-service.js');
const valid = {
  APP_MODE: 'demo',
  COMMERCE_ENABLED: 'false',
  DATABASE_URL:
    'postgresql://demo:demo@127.0.0.1:5432/vega_test?schema=test_schema',
};

test('commerce and production cannot be enabled by missing or permissive configuration', () => {
  assert.equal(loadConfig(valid).commerceEnabled, false);
  assert.equal(loadConfig(valid).databaseSchema, 'test_schema');
  for (const patch of [
    { APP_MODE: undefined },
    { APP_MODE: 'production' },
    { COMMERCE_ENABLED: undefined },
    { COMMERCE_ENABLED: 'true' },
    { COMMERCE_ENABLED: '0' },
    { NODE_ENV: 'production' },
    { DATABASE_URL: undefined },
    { DATABASE_URL: 'https://example.com' },
    { DATABASE_URL: 'postgresql://localhost/test?schema=unsafe-schema' },
    { PORT: '3001abc' },
    { DB_TIMEOUT_MS: '0' },
    { DB_TIMEOUT_MS: '10001' },
  ]) {
    assert.throws(() => loadConfig({ ...valid, ...patch }));
  }
});

test('liveness is independent of database and readiness masks internal connection details', async () => {
  let queries = 0;
  const controller = new HealthController({
    async checkReadiness() {
      queries += 1;
      throw new Error('postgresql://sensitive:password@internal.invalid/db');
    },
  });
  assert.equal(controller.live().status, 'ok');
  assert.equal(queries, 0);
  await assert.rejects(controller.ready(), (error) => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.getResponse().error.code, 'DATABASE_UNAVAILABLE');
    assert.doesNotMatch(
      JSON.stringify(error.getResponse()),
      /password|internal\.invalid/,
    );
    return true;
  });
  assert.equal(queries, 1);
});

test('LIKE input is escaped as a literal and malformed queries never touch the database', async () => {
  assert.equal(escapeLikeLiteral('x%_\\end'), 'x\\%\\_\\\\end');
  let queries = 0;
  const controller = new ProductsController({
    prisma: {
      product: {
        async findMany() {
          queries += 1;
          return [];
        },
      },
    },
  });
  for (const query of [
    { price: '1' },
    { q: ['a', 'b'] },
    { limit: ['1', '2'] },
    { categoryId: 'bad' },
  ]) {
    await assert.rejects(
      controller.list(query),
      (error) => error.getStatus() === 400,
    );
  }
  assert.equal(queries, 0);
});

test('demo seed additionally refuses ordinary database names before opening a connection', () => {
  assert.equal(validateDemoSeedConfig(valid).mode, 'demo');
  for (const patch of [
    { DATABASE_URL: 'postgresql://localhost/vega' },
    { DATABASE_URL: 'postgresql://localhost/vega_test_backup' },
    { NODE_ENV: 'production' },
    { APP_MODE: 'production' },
    { COMMERCE_ENABLED: 'true' },
  ])
    assert.throws(() => validateDemoSeedConfig({ ...valid, ...patch }));
});

test('authentication is disabled by default and enabling it requires isolated database plus server secret', () => {
  assert.deepEqual(loadConfig(valid).auth, { enabled: false });
  for (const patch of [
    { AUTH_DEMO_ENABLED: 'yes' },
    { AUTH_DEMO_ENABLED: 'true' },
    { AUTH_DEMO_ENABLED: 'true', AUTH_RATE_LIMIT_SECRET: 'short' },
    { AUTH_DEMO_ENABLED: 'true', AUTH_RATE_LIMIT_SECRET: ' '.repeat(64) },
    {
      AUTH_DEMO_ENABLED: 'true',
      AUTH_RATE_LIMIT_SECRET: 'x'.repeat(32),
      DATABASE_URL: 'postgresql://localhost/vega',
    },
  ])
    assert.throws(() => loadConfig({ ...valid, ...patch }));
  assert.equal(
    loadConfig({
      ...valid,
      AUTH_DEMO_ENABLED: 'true',
      AUTH_RATE_LIMIT_SECRET: 'x'.repeat(32),
    }).auth.enabled,
    true,
  );
  assert.equal(normalizeSource('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeSource('::1'), '::1');
  assert.equal(tokenDigest('a').length, 64);
  assert.equal(isAuthPath('/API/V1/AUTH/login?irrelevant=true'), true);
  assert.equal(isAuthPath('/api/v1/me/'), true);
});

test('bounded KDF admits one running plus two queued operations and releases the slot after failures', async () => {
  const limiter = new BoundedKdf();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const order = [];
  const first = limiter.run(async () => {
    order.push(1);
    await held;
    return 1;
  });
  const second = limiter.run(async () => {
    order.push(2);
    throw new Error('Expected test failure');
  });
  const secondRejected = assert.rejects(second, /Expected test failure/);
  const third = limiter.run(async () => {
    order.push(3);
    return 3;
  });
  await assert.rejects(
    limiter.run(async () => 4),
    KdfBusyError,
  );
  assert.deepEqual(order, [1]);
  release();
  assert.equal(await first, 1);
  await secondRejected;
  assert.equal(await third, 3);
  assert.equal(await limiter.run(async () => 5), 5);
  assert.deepEqual(order, [1, 2, 3]);
});

test('actual scrypt uses fixed memory parameters, random salt and constant-length comparison without trimming password', async () => {
  const hasher = new PasswordHasher();
  const password = '  demo password preserving spaces  ';
  const hash = await hasher.hash(password);
  assert.notEqual(await hasher.hash(password), hash);
  assert.match(
    hash,
    /^scrypt\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/,
  );
  assert.equal(await hasher.verify(password, hash), true);
  assert.equal(await hasher.verify(password.trim(), hash), false);
  assert.equal(await hasher.verify(password, DUMMY_PASSWORD_HASH), false);
  assert.equal(
    await hasher.verify(password, 'invalid-encoded-password-hash'),
    false,
  );
});

test('offline staff provisioning requires enabled isolated demo auth and valid environment credentials', () => {
  const environment = {
    ...valid,
    AUTH_DEMO_ENABLED: 'true',
    AUTH_RATE_LIMIT_SECRET: 'x'.repeat(32),
    ADMIN_PHONE: '8 (999) 123-45-67',
    ADMIN_PASSWORD: 'Demo password for a staff account',
  };
  assert.equal(
    validateManagerProvision(environment).credentials.phone,
    '+79991234567',
  );
  for (const patch of [
    { AUTH_DEMO_ENABLED: 'false' },
    { ADMIN_PHONE: undefined },
    { ADMIN_PASSWORD: undefined },
    { ADMIN_PASSWORD: 'short' },
    { DATABASE_URL: 'postgresql://localhost/vega' },
  ])
    assert.throws(() => validateManagerProvision({ ...environment, ...patch }));
  assert.equal(isAuthPath('/API/V1/ADMIN/products'), true);
});

test('manager authorization reads the current database user role and revocation on every request', async () => {
  let role = 'manager';
  let revokedAt = null;
  let reads = 0;
  const service = new AuthService(
    {
      prisma: {
        async $queryRaw() {
          return [{ now: new Date() }];
        },
        authSession: {
          async findUnique() {
            reads += 1;
            return {
              expiresAt: new Date(Date.now() + 60000),
              revokedAt,
              user: {
                id: '11111111-1111-4111-8111-111111111111',
                phone: '+79991234567',
                role,
                phoneVerified: false,
              },
            };
          },
        },
      },
    },
    loadConfig({
      ...valid,
      AUTH_DEMO_ENABLED: 'true',
      AUTH_RATE_LIMIT_SECRET: 'x'.repeat(32),
    }),
  );
  assert.equal(
    (await service.requireManager('demo-test-token')).role,
    'manager',
  );
  role = 'customer';
  await assert.rejects(
    service.requireManager('demo-test-token'),
    (error) => error.getStatus() === 403,
  );
  role = 'manager';
  revokedAt = new Date();
  await assert.rejects(
    service.requireManager('demo-test-token'),
    (error) => error.getStatus() === 401,
  );
  assert.equal(reads, 3);
});
