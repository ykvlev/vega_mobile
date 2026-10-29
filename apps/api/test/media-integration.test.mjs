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
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const password = `QA-${randomBytes(24).toString('base64url')}!`;
const managerPhone = '+79990000021';
const customerPhone = '+79990000022';

function pnpmCli() {
  assert(process.env.npm_execpath, 'Run media integration through pinned pnpm');
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
  'real PostgreSQL sanitized images, ACL, CAS and publication',
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
    const schema = `media_it_${randomUUID().replaceAll('-', '')}`;
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
        'Product media migrations must apply against PostgreSQL',
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
          PUBLIC_MEDIA_ORIGIN: base,
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

      const jpeg = await sharp({
        create: {
          width: 2400,
          height: 100,
          channels: 3,
          background: '#226677',
        },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const png = await sharp({
        create: { width: 80, height: 60, channels: 4, background: '#884422' },
      })
        .png()
        .toBuffer();
      const upload = async (
        bytes,
        {
          token = managerToken,
          version = product.version,
          type = 'image/jpeg',
          id = product.id,
        } = {},
      ) => {
        const form = new globalThis.FormData();
        form.set('version', String(version));
        form.set('file', new globalThis.Blob([bytes], { type }), 'fixture.jpg');
        const response = await fetch(
          `${base}/api/v1/admin/products/${id}/images`,
          {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: form,
          },
        );
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        const text = await response.text();
        assert.doesNotMatch(
          text,
          /passwordHash|tokenHash|postgresql:\/\/|PrismaClient/,
        );
        return { status: response.status, body: JSON.parse(text), text };
      };
      await t.test(
        'valid upload transforms real JPEG, strips metadata, stores bytes and protects draft',
        async () => {
          const login = await request(base, '/api/v1/auth/login', {
            method: 'POST',
            body: { phone: managerPhone, password },
          });
          assert.equal(login.status, 200);
          managerToken = login.body.session.token;
          const signup = await request(base, '/api/v1/auth/register', {
            method: 'POST',
            body: { phone: customerPhone, password },
          });
          assert.equal(signup.status, 201);
          customerToken = signup.body.session.token;
          const cat = await request(base, '/api/v1/admin/categories', {
            method: 'POST',
            token: managerToken,
            body: { name: 'Media QA', slug: 'media-qa' },
          });
          assert.equal(cat.status, 201);
          category = cat.body;
          const created = await request(base, '/api/v1/admin/products', {
            method: 'POST',
            token: managerToken,
            body: {
              name: 'Media fixture',
              article: 'MEDIA-QA',
              categoryId: category.id,
              rollLengthMm: '17000',
              widthMm: '1520',
            },
          });
          assert.equal(created.status, 201);
          product = created.body;
          const before = await auditCount();
          const result = await upload(jpeg);
          assert.equal(result.status, 201);
          product = result.body;
          assert.equal(product.images.length, 1);
          assert.equal(product.version, 2);
          assert.equal(await auditCount(), before + 1);
          const audit = (
            await admin.query(
              `SELECT "actorId", action, version FROM "${schema}"."CatalogAudit" WHERE "entityId"=$1 ORDER BY version DESC LIMIT 1`,
              [product.id],
            )
          ).rows[0];
          assert.equal(audit.action, 'image_add');
          assert.equal(audit.version, product.version);
          const image = product.images[0];
          assert.equal(image.position, 0);
          assert(image.width <= 2048 && image.height <= 2048);
          assert(image.sizeBytes <= 1048576);
          assert.equal(new URL(image.url).origin, base);
          const mediaPath = new URL(image.url).pathname;
          for (const token of [undefined, customerToken])
            assert.equal(
              (
                await fetch(base + mediaPath, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                })
              ).status,
              404,
            );
          const response = await fetch(base + mediaPath, {
            headers: { Authorization: `Bearer ${managerToken}` },
          });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('content-type'), 'image/webp');
          assert.equal(
            response.headers.get('x-content-type-options'),
            'nosniff',
          );
          assert.match(response.headers.get('cache-control'), /no-store/);
          const bytes = Buffer.from(await response.arrayBuffer());
          const metadata = await sharp(bytes).metadata();
          assert.equal(metadata.format, 'webp');
          assert.equal(metadata.exif, undefined);
          assert.equal(metadata.icc, undefined);
          assert.equal(metadata.orientation, undefined);
          const row = (
            await admin.query(
              `SELECT data,"sizeBytes" FROM "${schema}"."ProductImage" WHERE id=$1`,
              [image.id],
            )
          ).rows[0];
          assert.deepEqual(row.data, bytes);
          assert.equal(row.sizeBytes, bytes.length);
        },
      );
      await t.test(
        'ACL precedes decode and invalid uploads leave version, bytes and audit unchanged',
        async () => {
          const before = await auditCount();
          const version = product.version;
          assert.equal(
            (await upload(Buffer.from('bad'), { token: null })).status,
            401,
          );
          assert.equal(
            (await upload(Buffer.from('bad'), { token: customerToken })).status,
            403,
          );
          const hugeDimensions = await sharp({
            create: {
              width: 4100,
              height: 4100,
              channels: 3,
              background: 'red',
            },
          })
            .png()
            .toBuffer();
          const animated = await sharp(
            Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]),
            { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } },
          )
            .webp({ loop: 0, delay: [100, 100] })
            .toBuffer();
          assert.equal(
            (await sharp(animated, { animated: true }).metadata()).pages,
            2,
          );
          for (const [bytes, type, status] of [
            [Buffer.from('<svg/>'), 'image/svg+xml', 400],
            [animated, 'image/webp', 400],
            [jpeg.subarray(0, 30), 'image/jpeg', 400],
            [png, 'text/plain', 400],
            [hugeDimensions, 'image/png', 400],
            [Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg', 413],
          ]) {
            assert.equal((await upload(bytes, { type })).status, status);
          }
          assert.equal(await auditCount(), before);
          const current = await request(
            base,
            `/api/v1/admin/products/${product.id}`,
            { token: managerToken },
          );
          assert.equal(current.body.version, version);
          assert.equal(current.body.images.length, 1);
        },
      );
      await t.test(
        'image CAS, exact ordering, maximum eight and failed mutation audit',
        async () => {
          const stale = product.version;
          const result = await upload(png, { type: 'image/png' });
          assert.equal(result.status, 201);
          product = result.body;
          let before = await auditCount();
          assert.equal(
            (await upload(png, { version: stale, type: 'image/png' })).status,
            409,
          );
          assert.equal(await auditCount(), before);
          const other = await request(base, '/api/v1/admin/products', {
            method: 'POST',
            token: managerToken,
            body: {
              name: 'Other image owner',
              article: 'MEDIA-OTHER',
              categoryId: category.id,
              rollLengthMm: '15000',
              widthMm: '1520',
            },
          });
          assert.equal(other.status, 201);
          before = await auditCount();
          const foreignDelete = await request(
            base,
            `/api/v1/admin/products/${other.body.id}/images/${product.images[0].id}`,
            {
              method: 'DELETE',
              token: managerToken,
              body: { version: other.body.version },
            },
          );
          assert.equal(foreignDelete.status, 404);
          assert.equal(await auditCount(), before);
          const reversed = product.images.map((i) => i.id).reverse();
          const ordered = await request(
            base,
            `/api/v1/admin/products/${product.id}/images/order`,
            {
              method: 'PATCH',
              token: managerToken,
              body: { version: product.version, imageIds: reversed },
            },
          );
          assert.equal(ordered.status, 200);
          product = ordered.body;
          assert.deepEqual(
            product.images.map((i) => i.id),
            reversed,
          );
          before = await auditCount();
          error(
            await request(
              base,
              `/api/v1/admin/products/${product.id}/images/order`,
              {
                method: 'PATCH',
                token: managerToken,
                body: {
                  version: product.version,
                  imageIds: [reversed[0], reversed[0]],
                },
              },
            ),
            400,
            'VALIDATION_FAILED',
          );
          assert.equal(await auditCount(), before);
          before = await auditCount();
          const concurrentVersion = product.version;
          const concurrent = await Promise.all([
            upload(png, { type: 'image/png', version: concurrentVersion }),
            upload(png, { type: 'image/png', version: concurrentVersion }),
          ]);
          assert.deepEqual(
            concurrent.map((result) => result.status).sort(),
            [201, 409],
          );
          product = concurrent.find((result) => result.status === 201).body;
          assert.equal(await auditCount(), before + 1);
          while (product.images.length < 8) {
            const added = await upload(png, { type: 'image/png' });
            assert.equal(added.status, 201);
            product = added.body;
          }
          before = await auditCount();
          assert.equal((await upload(png, { type: 'image/png' })).status, 409);
          assert.equal(await auditCount(), before);
        },
      );
      await t.test(
        'publication gates real bytes, unpublish hides and deletion removes bytes',
        async () => {
          let updated = await request(
            base,
            `/api/v1/admin/products/${product.id}`,
            {
              method: 'PATCH',
              token: managerToken,
              body: { version: product.version, isPublished: true },
            },
          );
          assert.equal(updated.status, 200);
          product = updated.body;
          const image = product.images[0];
          assert.equal((await fetch(image.url)).status, 200);
          const published = await request(
            base,
            `/api/v1/products/${product.id}`,
          );
          assert.equal(published.status, 200);
          assert.equal(published.body.media[0], image.url);
          updated = await request(
            base,
            `/api/v1/admin/products/${product.id}`,
            {
              method: 'PATCH',
              token: managerToken,
              body: { version: product.version, isPublished: false },
            },
          );
          assert.equal(updated.status, 200);
          product = updated.body;
          assert.equal((await fetch(image.url)).status, 404);
          const removed = await request(
            base,
            `/api/v1/admin/products/${product.id}/images/${image.id}`,
            {
              method: 'DELETE',
              token: managerToken,
              body: { version: product.version },
            },
          );
          assert.equal(removed.status, 200);
          product = removed.body;
          assert.equal(product.images.length, 7);
          assert.equal(
            (
              await fetch(image.url, {
                headers: { Authorization: `Bearer ${managerToken}` },
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await admin.query(
                `SELECT id FROM "${schema}"."ProductImage" WHERE id=$1`,
                [image.id],
              )
            ).rowCount,
            0,
          );
          const logout = await request(base, '/api/v1/auth/logout', {
            method: 'POST',
            token: managerToken,
          });
          assert.equal(logout.status, 204);
          const revoked = await fetch(product.images[0].url, {
            headers: { Authorization: `Bearer ${managerToken}` },
          });
          assert.equal(revoked.status, 404);
          assert.match(revoked.headers.get('cache-control') ?? '', /no-store/);
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
