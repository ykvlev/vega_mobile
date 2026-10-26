import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { basename, extname } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const require = createRequire(import.meta.url);
const password = `QA-${randomBytes(24).toString('base64url')}!`;
const managerPhone = '+79990000021';
const customerPhone = '+79990000022';

function pnpmCli() {
  assert(process.env.npm_execpath, 'Run admin integration through pinned pnpm');
  const path = realpathSync(process.env.npm_execpath);
  assert(statSync(path).isFile());
  assert(
    ['.js', '.cjs', '.mjs'].includes(extname(path)) &&
      /^pnpm\.(?:js|cjs|mjs)$/i.test(basename(path)),
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
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
async function request(base, path, { method = 'GET', token, body, raw } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined || raw !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: globalThis.AbortSignal.timeout(10000),
  });
  if (
    path.toLowerCase().startsWith('/api/v1/admin') ||
    path.startsWith('/api/v1/auth')
  ) {
    assert.match(
      response.headers.get('cache-control') ?? '',
      /no-store/i,
      'Private admin/auth responses must be no-store',
    );
  }
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    text,
  };
}
function error(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.body?.error?.code, code);
  assert.doesNotMatch(
    result.text,
    /passwordHash|tokenHash|postgresql:\/\/|PrismaClient|AUTH_RATE_LIMIT_SECRET/,
  );
}

test(
  'real manager provisioning, current-role ACL, draft publication, CAS and audit',
  { timeout: 90000 },
  async (t) => {
    const sourceUrl =
      process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    assert(sourceUrl, 'An explicit test DATABASE_URL is required');
    const source = new URL(sourceUrl);
    assert(['postgres:', 'postgresql:'].includes(source.protocol));
    assert(
      /_test$/.test(source.pathname.slice(1)),
      'Refusing a non-test database',
    );
    const schema = `admin_it_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({
      connectionString: sourceUrl,
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
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
    let schemaCreated = false;
    let managerToken;
    let customerToken;
    let managerId;
    let category;
    let product;
    const auditCount = async () =>
      (
        await admin.query(
          `SELECT count(*)::int AS count FROM "${schema}"."CatalogAudit"`,
        )
      ).rows[0].count;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      schemaCreated = true;
      const directUrl = new URL(sourceUrl);
      directUrl.searchParams.set('schema', schema);
      const migrated = spawnSync(
        process.execPath,
        [pnpmCli(), 'exec', 'prisma', 'migrate', 'deploy'],
        {
          cwd: new URL('..', import.meta.url),
          env: { ...process.env, DATABASE_URL: directUrl.href },
          encoding: 'utf8',
          timeout: 30000,
        },
      );
      assert.equal(
        migrated.status,
        0,
        'Manager/catalog migrations must apply against PostgreSQL',
      );
      proxy.listen(0, '127.0.0.1');
      await once(proxy, 'listening');
      const proxyUrl = new URL(directUrl);
      proxyUrl.hostname = '127.0.0.1';
      proxyUrl.port = String(proxy.address().port);
      const environment = {
        ...process.env,
        APP_MODE: 'demo',
        COMMERCE_ENABLED: 'false',
        NODE_ENV: 'test',
        AUTH_DEMO_ENABLED: 'true',
        AUTH_RATE_LIMIT_SECRET: randomBytes(48).toString('base64url'),
        DB_TIMEOUT_MS: '500',
      };
      const { provisionDemoManager } = require('../dist/admin-provision.js');
      const provision = {
        ...environment,
        DATABASE_URL: directUrl.href,
        ADMIN_PHONE: managerPhone,
        ADMIN_PASSWORD: password,
      };
      await provisionDemoManager(provision);
      const port = await freePort();
      const base = `http://127.0.0.1:${port}`;
      child = spawn(process.execPath, ['dist/main.js'], {
        cwd: new URL('..', import.meta.url),
        env: {
          ...environment,
          DATABASE_URL: proxyUrl.href,
          PORT: String(port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.resume();
      child.stderr.resume();
      const deadline = Date.now() + 15000;
      let live = false;
      while (Date.now() < deadline && child.exitCode === null) {
        try {
          if (
            (
              await fetch(`${base}/health/live`, {
                signal: globalThis.AbortSignal.timeout(500),
              })
            ).status === 200
          ) {
            live = true;
            break;
          }
        } catch {
          /* Owned startup only. */
        }
        await delay(100);
      }
      assert(live, 'Owned manager API must become live');

      await t.test(
        'offline provisioning never promotes or overwrites an existing account; public signup cannot inject a role',
        async () => {
          await assert.rejects(provisionDemoManager(provision));
          const login = await request(base, '/api/v1/auth/login', {
            method: 'POST',
            body: { phone: managerPhone, password },
          });
          assert.equal(login.status, 200);
          assert.equal(login.body.user.role, 'manager');
          managerToken = login.body.session.token;
          managerId = login.body.user.id;
          const signup = await request(base, '/api/v1/auth/register', {
            method: 'POST',
            body: { phone: customerPhone, password },
          });
          assert.equal(signup.status, 201);
          assert.equal(signup.body.user.role, 'customer');
          customerToken = signup.body.session.token;
          const before = (
            await admin.query(
              `SELECT "passwordHash", role FROM "${schema}"."User" WHERE phone=$1`,
              [customerPhone],
            )
          ).rows[0];
          await assert.rejects(
            provisionDemoManager({ ...provision, ADMIN_PHONE: customerPhone }),
          );
          const after = (
            await admin.query(
              `SELECT "passwordHash", role FROM "${schema}"."User" WHERE phone=$1`,
              [customerPhone],
            )
          ).rows[0];
          assert.deepEqual(after, before);
          error(
            await request(base, '/api/v1/auth/register', {
              method: 'POST',
              body: { phone: '+79990000023', password, role: 'manager' },
            }),
            400,
            'VALIDATION_FAILED',
          );
          assert.equal(
            (
              await admin.query(
                `SELECT count(*)::int AS count FROM "${schema}"."User" WHERE role='manager'`,
              )
            ).rows[0].count,
            1,
          );
        },
      );

      await t.test(
        'guest is 401 and a signed-in customer is 403 for every catalog-management operation',
        async () => {
          for (const operation of [
            { path: '/api/v1/admin/categories' },
            { path: '/api/v1/admin/products' },
            {
              path: '/api/v1/admin/products/99999999-9999-4999-8999-999999999999',
            },
            {
              path: '/api/v1/admin/categories',
              method: 'POST',
              body: { name: 'Denied', slug: 'denied' },
            },
            { path: '/api/v1/admin/products', method: 'POST', body: {} },
            {
              path: '/api/v1/admin/products/99999999-9999-4999-8999-999999999999',
              method: 'PATCH',
              body: { version: 1, name: 'Denied' },
            },
          ]) {
            error(
              await request(base, operation.path, operation),
              401,
              'AUTH_REQUIRED',
            );
            error(
              await request(base, operation.path, {
                ...operation,
                token: customerToken,
              }),
              403,
              'FORBIDDEN',
            );
          }
          assert.equal(await auditCount(), 0);
        },
      );

      await t.test(
        'manager creates a category and unpublished SKU while invalid FK/private fields cannot create data or audit',
        async () => {
          const createdCategory = await request(
            base,
            '/api/v1/admin/categories',
            {
              method: 'POST',
              token: managerToken,
              body: { name: 'QA: цветные плёнки', slug: 'qa-color' },
            },
          );
          assert.equal(createdCategory.status, 201);
          category = createdCategory.body;
          const data = {
            article: 'QA-FILM-17',
            name: 'QA плёнка 17 метров',
            description: 'Демонстрационный товар QA',
            categoryId: category.id,
            rollLengthMm: '17000',
            widthMm: '1520',
            characteristics: { finish: 'Матовая', warranty: '2 года' },
          };
          const before = await auditCount();
          for (const patch of [
            { categoryId: randomUUID() },
            { price: '100' },
            { stock: 3 },
            { metadata: { secret: 'must-not-leak' } },
            { skuId: randomUUID() },
          ]) {
            error(
              await request(base, '/api/v1/admin/products', {
                method: 'POST',
                token: managerToken,
                body: { ...data, ...patch },
              }),
              400,
              'VALIDATION_FAILED',
            );
          }
          assert.equal(await auditCount(), before);
          const created = await request(base, '/api/v1/admin/products', {
            method: 'POST',
            token: managerToken,
            body: data,
          });
          assert.equal(created.status, 201);
          product = created.body;
          assert.equal(product.isPublished, false);
          assert.equal(product.version, 1);
          assert.equal(product.rollLengthMm, '17000');
          assert.deepEqual(product.characteristics, data.characteristics);
          assert.doesNotMatch(
            created.text,
            /"(?:price|stock|metadata|passwordHash|tokenHash)"/,
          );
        },
      );

      await t.test(
        'draft is private, publish makes only allowlisted SKU dimensions and public characteristics visible',
        async () => {
          assert.equal(
            (await request(base, '/api/v1/products')).body.items.length,
            0,
          );
          error(
            await request(base, `/api/v1/products/${product.id}`),
            404,
            'NOT_FOUND',
          );
          const drafts = await request(
            base,
            '/api/v1/admin/products?status=draft',
            { token: managerToken },
          );
          assert.equal(drafts.status, 200);
          assert.equal(drafts.body.items.length, 1);
          const published = await request(
            base,
            `/api/v1/admin/products/${product.id}`,
            {
              method: 'PATCH',
              token: managerToken,
              body: { version: product.version, isPublished: true },
            },
          );
          assert.equal(published.status, 200);
          product = published.body;
          assert.equal(product.version, 2);
          const visible = await request(base, `/api/v1/products/${product.id}`);
          assert.equal(visible.status, 200);
          assert.equal(visible.body.skuId, product.skuId);
          assert.equal(visible.body.rollLengthMm, '17000');
          assert.equal(visible.body.widthMm, '1520');
          assert.deepEqual(visible.body.characteristics, {
            finish: 'Матовая',
            warranty: '2 года',
          });
          assert.deepEqual(Object.keys(visible.body).sort(), [
            'article',
            'categoryId',
            'characteristics',
            'description',
            'id',
            'media',
            'name',
            'rollLengthMm',
            'skuId',
            'widthMm',
          ]);
          assert.equal(
            (await request(base, '/api/v1/products')).body.items.length,
            1,
          );
        },
      );

      await t.test(
        'versioned edits preserve SKU, reject stale CAS and produce exactly one audited event per successful write',
        async () => {
          const skuId = product.skuId;
          const edited = await request(
            base,
            `/api/v1/admin/products/${product.id}`,
            {
              method: 'PATCH',
              token: managerToken,
              body: {
                version: product.version,
                name: 'QA обновлённая плёнка',
                rollLengthMm: '15000',
                characteristics: { finish: 'Глянцевая' },
              },
            },
          );
          assert.equal(edited.status, 200);
          product = edited.body;
          assert.equal(product.version, 3);
          assert.equal(product.skuId, skuId);
          const before = await auditCount();
          error(
            await request(base, `/api/v1/admin/products/${product.id}`, {
              method: 'PATCH',
              token: managerToken,
              body: { version: 2, name: 'Stale edit must not apply' },
            }),
            409,
            'VERSION_CONFLICT',
          );
          error(
            await request(base, `/api/v1/admin/products/${product.id}`, {
              method: 'PATCH',
              token: managerToken,
              body: { version: 3, metadata: { price: 10 } },
            }),
            400,
            'VALIDATION_FAILED',
          );
          assert.equal(await auditCount(), before);
          const visible = await request(base, `/api/v1/products/${product.id}`);
          assert.equal(visible.body.name, product.name);
          assert.equal(visible.body.rollLengthMm, '15000');
          const competing = await Promise.all(
            ['Concurrent A', 'Concurrent B'].map((description) =>
              request(base, `/api/v1/admin/products/${product.id}`, {
                method: 'PATCH',
                token: managerToken,
                body: { version: product.version, description },
              }),
            ),
          );
          assert.equal(
            competing.filter((result) => result.status === 200).length,
            1,
          );
          assert.equal(
            competing.filter((result) => result.status === 409).length,
            1,
          );
          error(
            competing.find((result) => result.status === 409),
            409,
            'VERSION_CONFLICT',
          );
          product = competing.find((result) => result.status === 200).body;
          assert.equal(product.version, 4);
          const audit = await admin.query(
            `SELECT "actorId", action, version FROM "${schema}"."CatalogAudit" WHERE "entityId"=$1 ORDER BY version`,
            [product.id],
          );
          assert.deepEqual(
            audit.rows.map((row) => [row.action, row.version]),
            [
              ['create', 1],
              ['publish', 2],
              ['update', 3],
              ['update', 4],
            ],
          );
          assert(audit.rows.every((row) => row.actorId === managerId));
        },
      );

      await t.test(
        'admin parser accepts a valid Cyrillic DTO above 8KiB but rejects above 64KiB while auth keeps its smaller limit',
        async () => {
          const data = {
            article: 'QA-CYRILLIC-LARGE',
            name: 'Большое описание QA',
            categoryId: category.id,
            rollLengthMm: '17000',
            widthMm: '1520',
            description: 'Ж'.repeat(4000),
            characteristics: Object.fromEntries(
              Array.from({ length: 20 }, (_, index) => [
                `C${index}`,
                'Ю'.repeat(256),
              ]),
            ),
          };
          assert(Buffer.byteLength(JSON.stringify(data), 'utf8') > 8192);
          const accepted = await request(base, '/api/v1/admin/products', {
            method: 'POST',
            token: managerToken,
            body: data,
          });
          assert.equal(accepted.status, 201);
          assert.equal(accepted.body.description.length, 4000);
          const before = await auditCount();
          error(
            await request(base, '/API/V1/ADMIN/products', {
              method: 'POST',
              token: managerToken,
              raw: JSON.stringify({ description: 'x'.repeat(66000) }),
            }),
            413,
            'PAYLOAD_TOO_LARGE',
          );
          error(
            await request(base, '/api/v1/auth/login', {
              method: 'POST',
              body: { phone: customerPhone, password: 'x'.repeat(9000) },
            }),
            413,
            'PAYLOAD_TOO_LARGE',
          );
          assert.equal(await auditCount(), before);
        },
      );

      await t.test(
        'unpublishing hides the SKU immediately and current database role controls every request',
        async () => {
          const unpublished = await request(
            base,
            `/api/v1/admin/products/${product.id}`,
            {
              method: 'PATCH',
              token: managerToken,
              body: { version: product.version, isPublished: false },
            },
          );
          assert.equal(unpublished.status, 200);
          product = unpublished.body;
          assert.equal(product.version, 5);
          assert.equal(
            (await request(base, '/api/v1/products')).body.items.length,
            0,
          );
          error(
            await request(base, `/api/v1/products/${product.id}`),
            404,
            'NOT_FOUND',
          );
          await admin.query(
            `UPDATE "${schema}"."User" SET role='customer' WHERE id=$1`,
            [managerId],
          );
          const before = await auditCount();
          for (const operation of [
            { path: '/api/v1/admin/products' },
            { path: '/api/v1/admin/categories' },
            {
              path: `/api/v1/admin/products/${product.id}`,
              method: 'PATCH',
              body: { version: product.version, isPublished: true },
            },
          ]) {
            error(
              await request(base, operation.path, {
                ...operation,
                token: managerToken,
              }),
              403,
              'FORBIDDEN',
            );
          }
          assert.equal(await auditCount(), before);
          await admin.query(
            `UPDATE "${schema}"."User" SET role='manager' WHERE id=$1`,
            [managerId],
          );
          assert.equal(
            (
              await request(base, '/api/v1/admin/products', {
                token: managerToken,
              })
            ).status,
            200,
          );
        },
      );

      await t.test(
        'real database outage returns a safe private 503 without leaking connection or internal state',
        async () => {
          for (const socket of sockets) socket.destroy();
          await new Promise((resolve) => proxy.close(resolve));
          const began = Date.now();
          const failed = await request(base, '/api/v1/admin/products', {
            token: managerToken,
          });
          assert.equal(failed.status, 503);
          assert(
            ['AUTH_UNAVAILABLE', 'ADMIN_UNAVAILABLE'].includes(
              failed.body.error.code,
            ),
          );
          assert.doesNotMatch(
            failed.text,
            /postgresql:\/\/|passwordHash|tokenHash|Prisma|SELECT|AuthSession/,
          );
          assert(Date.now() - began < 3000);
          assert.equal((await fetch(`${base}/health/live`)).status, 200);
        },
      );
    } finally {
      await stop(child);
      for (const socket of sockets) socket.destroy();
      if (proxy.listening) await new Promise((resolve) => proxy.close(resolve));
      try {
        if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    }
  },
);
