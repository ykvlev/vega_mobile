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
