import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { realpathSync, statSync } from 'node:fs';
import net from 'node:net';
import { createRequire } from 'node:module';
import { basename, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const require = createRequire(import.meta.url);
const {
  seedDemoCatalog,
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
} = require('../dist/demo-seed.js');

function pnpmCliPath() {
  const configuredPath = process.env.npm_execpath;
  assert.ok(
    configuredPath,
    'Run integration tests through the pinned pnpm script',
  );
  const path = realpathSync(configuredPath);
  assert.ok(
    statSync(path).isFile(),
    'pnpm CLI must be an existing regular file',
  );
  assert.ok(
    ['.js', '.cjs', '.mjs'].includes(extname(path).toLowerCase()) &&
      /^pnpm\.(?:js|cjs|mjs)$/i.test(basename(path)),
    'npm_execpath must point to the pnpm JavaScript CLI, not a shell or .cmd shim',
  );
  return path;
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForLive(base, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error('API exited before readiness test');
    try {
      const response = await fetch(`${base}/health/live`, {
        signal: globalThis.AbortSignal.timeout(500),
      });
      if (response.status === 200) return;
    } catch {
      /* Listener may not be ready during process startup. */
    }
    await delay(100);
  }
  throw new Error('API did not become live within the test deadline');
}

test(
  'real migrations, guest catalog, database outage and fail-closed startup',
  { timeout: 60000 },
  async (t) => {
    const sourceUrl =
      process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    assert.ok(
      sourceUrl,
      'An explicitly configured integration DATABASE_URL is required; no skipped DB tests',
    );
    const source = new URL(sourceUrl);
    const schema = `api_it_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({
      connectionString: sourceUrl,
      connectionTimeoutMillis: 3000,
    });
    const sockets = new Set();
    const proxy = net.createServer((client) => {
      const upstream = net.connect(
        Number(source.port || 5432),
        source.hostname,
      );
      sockets.add(client);
      sockets.add(upstream);
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
        sockets.delete(client);
        sockets.delete(upstream);
      };
      client.on('error', close);
      upstream.on('error', close);
      client.on('close', close);
      upstream.on('close', close);
    });
    let child;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const migrationUrl = new URL(sourceUrl);
      migrationUrl.searchParams.set('schema', schema);
      const result = spawnSync(
        process.execPath,
        [pnpmCliPath(), 'exec', 'prisma', 'migrate', 'deploy'],
        {
          cwd: new URL('..', import.meta.url),
          env: { ...process.env, DATABASE_URL: migrationUrl.href },
          encoding: 'utf8',
          timeout: 30000,
        },
      );
      assert.equal(
        result.status,
        0,
        'Initial SQL migration must deploy successfully against PostgreSQL',
      );
      const categoryId = randomUUID();
      const id = randomUUID();
      const skuId = randomUUID();
      await admin.query(
        `INSERT INTO "${schema}"."Category" (id, slug, name) VALUES ($1, $2, $3)`,
        [categoryId, 'test-film', 'Тест'],
      );
      await admin.query(
        `INSERT INTO "${schema}"."Product"
      (id, "skuId", article, name, "categoryId", "rollLengthMm", "widthMm", metadata, "updatedAt")
      VALUES ($1,$2,$3,$4,$5,17000,1520,$6,NOW())`,
        [
          id,
          skuId,
          'TEST-17',
          'Демонстрационная плёнка',
          categoryId,
          JSON.stringify({
            price: 123456,
            stock: 7,
            unknownPrivateField: 'never-public',
            nested: { secret: 'hidden' },
          }),
        ],
      );

      await t.test(
        'film dimensions reject null, zero and negative lengths at database boundary',
        async () => {
          for (const [rollLength, width, expectedCode] of [
            [null, 1520, '23502'],
            [0, 1520, '23514'],
            [-1, 1520, '23514'],
            [17000, null, '23502'],
            [17000, 0, '23514'],
          ]) {
            await assert.rejects(
              admin.query(
                `INSERT INTO "${schema}"."Product"
          (id, "skuId", article, name, "categoryId", "rollLengthMm", "widthMm", "updatedAt")
          VALUES ($1,$2,$3,'Invalid test film',$4,$5,$6,NOW())`,
                [
                  randomUUID(),
                  randomUUID(),
                  randomUUID(),
                  categoryId,
                  rollLength,
                  width,
                ],
              ),
              (error) => error.code === expectedCode,
            );
          }
        },
      );

      proxy.listen(0, '127.0.0.1');
      await once(proxy, 'listening');
      const proxyUrl = new URL(migrationUrl);
      proxyUrl.hostname = '127.0.0.1';
      proxyUrl.port = String(proxy.address().port);
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      const environment = {
        ...process.env,
        NODE_ENV: 'test',
        APP_MODE: 'demo',
        COMMERCE_ENABLED: 'false',
        DATABASE_URL: proxyUrl.href,
        PORT: String(port),
        DB_TIMEOUT_MS: '500',
      };
      child = spawn(process.execPath, ['dist/main.js'], {
        cwd: new URL('..', import.meta.url),
        env: environment,
        stdio: 'pipe',
      });
      // Drain logs without exposing environment/connection credentials in test output.
      child.stdout.resume();
      child.stderr.resume();
      await waitForLive(base, child);

      await t.test(
        'readiness queries the migrated database and guest DTO strips unknown/private JSON',
        async () => {
          assert.equal((await fetch(`${base}/health/ready`)).status, 200);
          const response = await fetch(`${base}/api/v1/products`);
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.items.length, 1);
          assert.equal(body.items[0].id, id);
          assert.equal(body.items[0].skuId, skuId);
          assert.equal(body.items[0].rollLengthMm, '17000');
          assert.equal(body.items[0].name, 'Демонстрационная плёнка');
          assert.equal(body.nextCursor, null);
          assert.doesNotMatch(
            JSON.stringify(body),
            /price|stock|metadata|never-public|unknownPrivateField|hidden/,
          );
          assert.equal(
            (await fetch(`${base}/api/v1/products?limit=1000`)).status,
            400,
          );
          assert.equal(
            (await fetch(`${base}/api/v1/products?cursor=not-a-uuid`)).status,
            400,
          );
          assert.equal(
            (await fetch(`${base}/api/v1/orders`, { method: 'POST' })).status,
            404,
          );
        },
      );

      await t.test(
        'demo seed is repeatable, isolated and refuses to overwrite unowned identities',
        async () => {
          const seedEnvironment = {
            ...environment,
            DATABASE_URL: migrationUrl.href,
          };
          await seedDemoCatalog(seedEnvironment);
          await seedDemoCatalog(seedEnvironment);
          const count = await admin.query(
            `SELECT COUNT(*) AS count FROM "${schema}"."Product"`,
          );
          assert.equal(Number(count.rows[0].count), 4);
          const owned = await admin.query(
            `SELECT metadata FROM "${schema}"."Product" WHERE id=$1`,
            [DEMO_PRODUCTS[0].id],
          );
          assert.deepEqual(Object.keys(owned.rows[0].metadata), ['seedOwner']);
          await admin.query(
            `UPDATE "${schema}"."Product" SET metadata='{}', name='Preserve user change' WHERE id=$1`,
            [DEMO_PRODUCTS[0].id],
          );
          await assert.rejects(
            seedDemoCatalog(seedEnvironment),
            /identity collision/,
          );
          const preserved = await admin.query(
            `SELECT name FROM "${schema}"."Product" WHERE id=$1`,
            [DEMO_PRODUCTS[0].id],
          );
          assert.equal(preserved.rows[0].name, 'Preserve user change');
        },
      );

      await t.test(
        'categories, detail, literal search and filtered pagination use real database rows',
        async () => {
          const get = async (path) => {
            const response = await fetch(`${base}/api/v1${path}`);
            assert.equal(
              response.status,
              200,
              `Expected successful catalog request: ${path}`,
            );
            const body = await response.json();
            assert.doesNotMatch(
              JSON.stringify(body),
              /"price"|"stock"|"metadata"|never-public|unknownPrivateField|"seedOwner"/,
            );
            return body;
          };
          const categories = await get('/categories?limit=100');
          assert.equal(categories.items.length, 3);
          assert.ok(
            categories.items.some(
              (category) => category.id === DEMO_CATEGORIES[1].id,
            ),
          );
          const categoryPage1 = await get('/categories?limit=1');
          const categoryPage2 = await get(
            `/categories?limit=1&cursor=${categoryPage1.nextCursor}`,
          );
          assert.notEqual(categoryPage1.items[0].id, categoryPage2.items[0].id);
          const detail = await get(`/products/${id}`);
          assert.equal(detail.skuId, skuId);
          assert.deepEqual(detail.media, []);
          assert.deepEqual(detail.characteristics, {});
          const missing = await fetch(
            `${base}/api/v1/products/${randomUUID()}`,
          );
          assert.equal(missing.status, 404);
          assert.equal((await missing.json()).error.code, 'NOT_FOUND');
          assert.equal(
            (await fetch(`${base}/api/v1/products/not-a-uuid`)).status,
            400,
          );
          assert.equal((await get('/products?q=test-17')).items[0].id, id);
          assert.equal(
            (await get(`/products?q=${encodeURIComponent('дЕмО цВеТнАя')}`))
              .items[0].id,
            DEMO_PRODUCTS[1].id,
          );
          assert.equal(
            (await get(`/products?categoryId=${DEMO_CATEGORIES[1].id}`)).items
              .length,
            2,
          );
          assert.equal(
            (
              await get(
                `/products?categoryId=${DEMO_CATEGORIES[1].id}&q=demo-color-17`,
              )
            ).items[0].id,
            DEMO_PRODUCTS[1].id,
          );
          assert.equal(
            (await get('/products?q=no-such-material')).items.length,
            0,
          );
          const literalId = randomUUID();
          await admin.query(
            `INSERT INTO "${schema}"."Product"
          (id,"skuId",article,name,"categoryId","rollLengthMm","widthMm","updatedAt")
          VALUES ($1,$2,$3,'Literal special test',$4,15000,1520,NOW())`,
            [literalId, randomUUID(), 'LITERAL%_\\CODE', categoryId],
          );
          for (const q of ['%', '_', '\\', 'literal%_\\code']) {
            const result = await get(`/products?q=${encodeURIComponent(q)}`);
            assert.deepEqual(
              result.items.map((item) => item.id),
              [literalId],
            );
          }
          const seen = [];
          let cursor;
          do {
            const result = await get(
              `/products?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
            );
            seen.push(...result.items.map((item) => item.id));
            cursor = result.nextCursor;
            assert.ok(
              seen.length <= 5,
              'Pagination must terminate without duplicates',
            );
          } while (cursor);
          assert.equal(seen.length, 5);
          assert.equal(new Set(seen).size, 5);
          assert.deepEqual(seen, [...seen].sort());
        },
      );

      await t.test(
        'unknown, commercial and repeated HTTP parameters return safe 400',
        async () => {
          for (const path of [
            '/products?price=1',
            '/products?stock=1',
            '/products?sort=price',
            '/products?limit=1&limit=2',
            '/products?q=one&q=two',
            '/products?categoryId=bad',
            '/products?categoryId=one&categoryId=two',
            '/products?q[x]=nested',
            `/products?q=${'x'.repeat(129)}`,
            '/categories?stock=1',
            '/categories?limit=1&limit=2',
            `/products/${id}?include=stock`,
          ]) {
            const response = await fetch(`${base}/api/v1${path}`);
            assert.equal(
              response.status,
              400,
              `Reject malformed/private filter: ${path}`,
            );
            const body = await response.json();
            assert.equal(body.error.code, 'VALIDATION_FAILED');
            assert.doesNotMatch(
              JSON.stringify(body),
              /never-public|unknownPrivateField/,
            );
          }
        },
      );

      await t.test(
        'actual database transport failure returns bounded 503 while liveness remains healthy',
        async () => {
          for (const socket of sockets) socket.destroy();
          await new Promise((resolve) => proxy.close(resolve));
          const started = Date.now();
          const response = await fetch(`${base}/health/ready`, {
            signal: globalThis.AbortSignal.timeout(3000),
          });
          assert.equal(response.status, 503);
          assert.equal(
            (await response.json()).error.code,
            'DATABASE_UNAVAILABLE',
          );
          assert.ok(
            Date.now() - started < 2500,
            'Database timeout must bound readiness',
          );
          assert.equal((await fetch(`${base}/health/live`)).status, 200);
        },
      );

      await t.test(
        'unsafe configuration exits nonzero without starting a listener',
        async () => {
          for (const patch of [
            { COMMERCE_ENABLED: 'true' },
            { NODE_ENV: 'production' },
            { APP_MODE: '' },
          ]) {
            const result = spawnSync(process.execPath, ['dist/main.js'], {
              cwd: new URL('..', import.meta.url),
              env: { ...environment, ...patch },
              encoding: 'utf8',
              timeout: 5000,
            });
            assert.equal(result.status, 1);
            assert.match(result.stderr, /API startup failed/);
            assert.doesNotMatch(
              result.stdout + result.stderr,
              /never-public|postgresql:\/\//,
            );
          }
        },
      );
    } finally {
      if (child) await stop(child);
      for (const socket of sockets) socket.destroy();
      if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
