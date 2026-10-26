import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { realpathSync, statSync } from 'node:fs';
import net from 'node:net';
import { basename, extname } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const password = `  Demo-${randomBytes(18).toString('base64url')}!  `;
const phone = '+79990000001';
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

function pnpmCli() {
  assert(process.env.npm_execpath, 'Run auth integration through pinned pnpm');
  const path = realpathSync(process.env.npm_execpath);
  assert(statSync(path).isFile(), 'pnpm CLI must be a regular file');
  assert(
    ['.js', '.cjs', '.mjs'].includes(extname(path).toLowerCase()) &&
      /^pnpm\.(?:js|cjs|mjs)$/i.test(basename(path)),
    'npm_execpath must identify the pnpm JavaScript CLI',
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

async function waitForLive(base, child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    assert(
      child.exitCode === null && child.signalCode === null,
      'Owned auth API exited before startup',
    );
    try {
      if (
        (
          await fetch(`${base}/health/live`, {
            signal: globalThis.AbortSignal.timeout(500),
          })
        ).status === 200
      )
        return;
    } catch {
      /* Only the owned process startup is retried. */
    }
    await delay(100);
  }
  throw new Error('Owned auth API failed its startup deadline');
}

async function request(
  base,
  path,
  { method = 'GET', token, body, headers = {}, raw } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: globalThis.AbortSignal.timeout(10000),
  });
  assert.match(
    response.headers.get('cache-control') ?? '',
    /(?:^|[, ])no-store(?:$|[, ])/i,
    'Every auth response must be no-store',
  );
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  return {
    status: response.status,
    headers: response.headers,
    body: result,
    text,
  };
}

function code(result, status, expectedCode) {
  assert.equal(result.status, status);
  assert.equal(result.body?.error?.code, expectedCode);
  assert.doesNotMatch(
    result.text,
    /passwordHash|tokenHash|AUTH_RATE_LIMIT_SECRET|postgresql:\/\//,
  );
}

function userDto(user, expectedPhone, expectedAccess = 'pending') {
  assert.deepEqual(Object.keys(user).sort(), [
    'commercialAccessStatus',
    'id',
    'phone',
    'phoneVerified',
    'role',
  ]);
  assert.match(user.id, /^[0-9a-f-]{36}$/i);
  assert.equal(user.phone, expectedPhone);
  assert.equal(user.role, 'customer');
  assert.equal(user.commercialAccessStatus, expectedAccess);
  assert.equal(user.phoneVerified, false);
}

function sessionDto(result, expectedPhone) {
  assert.deepEqual(Object.keys(result.body).sort(), ['session', 'user']);
  userDto(result.body.user, expectedPhone);
  assert.deepEqual(Object.keys(result.body.session).sort(), [
    'expiresAt',
    'token',
  ]);
  assert.match(result.body.session.token, /^[A-Za-z0-9_-]{43}$/);
  const remaining = Date.parse(result.body.session.expiresAt) - Date.now();
  assert(
    remaining > 86300000 && remaining <= 86400000,
    'Session TTL must be 24 hours',
  );
  assert(!result.text.includes(password), 'Password must never be returned');
  return result.body.session.token;
}

test(
  'real PostgreSQL demo auth lifecycle, privacy, cross-process limits and outage',
  { timeout: 120000 },
  async (t) => {
    const sourceUrl =
      process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    assert(
      sourceUrl,
      'An explicit test DATABASE_URL is required; auth DB tests cannot skip',
    );
    const source = new URL(sourceUrl);
    assert(['postgres:', 'postgresql:'].includes(source.protocol));
    assert(
      /_test$/.test(decodeURIComponent(source.pathname.slice(1))),
      'Refusing a database not named *_test',
    );
    const schema = `auth_it_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({
      connectionString: sourceUrl,
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
    });
    const children = new Set();
    const sockets = new Set();
    const secret = randomBytes(48).toString('base64url');
    let schemaCreated = false;
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
    const resetRates = () =>
      admin.query(`DELETE FROM "${schema}"."AuthRateLimit"`);
    async function avoidRateWindowBoundary(seconds) {
      const { rows } = await admin.query('SELECT clock_timestamp() AS now');
      const now = new Date(rows[0].now).getTime();
      assert(Number.isFinite(now), 'Rate test requires a valid database clock');
      const windowMs = seconds * 1000;
      const remainingMs = windowMs - (now % windowMs);
      // Exercise a single genuine fixed window without overriding application time.
      // The wait is at most five seconds, including the boundary margin.
      if (remainingMs < 4950) await delay(remainingMs + 50);
    }
    let environment;
    async function startApi(extra = {}) {
      const port = await freePort();
      const child = spawn(process.execPath, ['dist/main.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...environment, ...extra, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.add(child);
      child.stdout.resume();
      child.stderr.resume();
      const base = `http://127.0.0.1:${port}`;
      await waitForLive(base, child);
      return { child, base };
    }
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      schemaCreated = true;
      const migrationUrl = new URL(sourceUrl);
      migrationUrl.searchParams.set('schema', schema);
      const migration = spawnSync(
        process.execPath,
        [pnpmCli(), 'exec', 'prisma', 'migrate', 'deploy'],
        {
          cwd: new URL('..', import.meta.url),
          env: { ...process.env, DATABASE_URL: migrationUrl.href },
          encoding: 'utf8',
          timeout: 30000,
        },
      );
      assert.equal(
        migration.status,
        0,
        'Auth migrations must apply against real PostgreSQL',
      );
      proxy.listen(0, '127.0.0.1');
      await once(proxy, 'listening');
      const proxyUrl = new URL(migrationUrl);
      proxyUrl.hostname = '127.0.0.1';
      proxyUrl.port = String(proxy.address().port);
      environment = {
        ...process.env,
        DATABASE_URL: proxyUrl.href,
        NODE_ENV: 'test',
        APP_MODE: 'demo',
        COMMERCE_ENABLED: 'false',
        AUTH_DEMO_ENABLED: 'true',
        AUTH_RATE_LIMIT_SECRET: secret,
        DB_TIMEOUT_MS: '500',
      };
      let first = await startApi();
      const second = await startApi();
      let initialToken;
      let loginToken;

      await t.test(
        'registration normalizes RU phone, returns an unverified customer and stores only password/session hashes',
        async () => {
          const result = await request(first.base, '/api/v1/auth/register', {
            method: 'POST',
            body: { phone: '8 (999) 000-00-01', password },
          });
          assert.equal(result.status, 201);
          initialToken = sessionDto(result, phone);
          const users = await admin.query(
            `SELECT * FROM "${schema}"."User" WHERE phone=$1`,
            [phone],
          );
          assert.equal(users.rowCount, 1);
          const stored = users.rows[0];
          assert.equal(stored.commercialAccessStatus, 'pending');
          assert.notEqual(stored.passwordHash, password);
          const fields = stored.passwordHash.split('$');
          assert.deepEqual(fields.slice(0, 4), ['scrypt', '131072', '8', '1']);
          assert.equal(Buffer.from(fields[4], 'base64url').length, 16);
          assert.equal(Buffer.from(fields[5], 'base64url').length, 64);
          const sessions = await admin.query(
            `SELECT * FROM "${schema}"."AuthSession" WHERE "userId"=$1`,
            [stored.id],
          );
          assert.equal(sessions.rowCount, 1);
          assert.equal(sessions.rows[0].tokenHash, tokenHash(initialToken));
          assert(
            !JSON.stringify(sessions.rows).includes(initialToken),
            'Raw session token must not be persisted',
          );
          const duplicate = await request(
            second.base,
            '/api/v1/auth/register',
            { method: 'POST', body: { phone: '+7 999 000-00-01', password } },
          );
          code(duplicate, 409, 'REGISTRATION_FAILED');
        },
      );

      await t.test(
        'registration rolls back user and initial session together when session insertion fails while rate budget remains spent',
        async () => {
          await resetRates();
          const faultPhone = '+79990000009';
          const sessionCountBefore = await admin.query(
            `SELECT count(*)::int AS count FROM "${schema}"."AuthSession"`,
          );
          await admin.query(
            `CREATE FUNCTION "${schema}".qa_reject_auth_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_SESSION_INSERT_FAILURE'; END; $$`,
          );
          try {
            await admin.query(
              `CREATE TRIGGER qa_reject_auth_session BEFORE INSERT ON "${schema}"."AuthSession" FOR EACH ROW EXECUTE FUNCTION "${schema}".qa_reject_auth_session()`,
            );
            const failed = await request(first.base, '/api/v1/auth/register', {
              method: 'POST',
              body: { phone: faultPhone, password },
            });
            code(failed, 503, 'AUTH_UNAVAILABLE');
            assert(!failed.text.includes('QA_SESSION_INSERT_FAILURE'));
            const users = await admin.query(
              `SELECT id FROM "${schema}"."User" WHERE phone=$1`,
              [faultPhone],
            );
            assert.equal(
              users.rowCount,
              0,
              'A failed initial session must not leave a registered user',
            );
            const sessions = await admin.query(
              `SELECT count(*)::int AS count FROM "${schema}"."AuthSession"`,
            );
            assert.equal(
              sessions.rows[0].count,
              sessionCountBefore.rows[0].count,
            );
            const rates = await admin.query(
              `SELECT scope, attempts FROM "${schema}"."AuthRateLimit" WHERE scope LIKE 'register:%'`,
            );
            assert.equal(rates.rowCount, 2);
            assert(
              rates.rows.every((row) => row.attempts === 1),
              'Rate budgets must remain committed despite registration rollback',
            );
          } finally {
            await admin.query(
              `DROP TRIGGER IF EXISTS qa_reject_auth_session ON "${schema}"."AuthSession"`,
            );
            await admin.query(
              `DROP FUNCTION "${schema}".qa_reject_auth_session()`,
            );
          }
          const retry = await request(second.base, '/api/v1/auth/register', {
            method: 'POST',
            body: { phone: faultPhone, password },
          });
          assert.equal(retry.status, 201);
          sessionDto(retry, faultPhone);
          assert.equal(
            (
              await admin.query(
                `SELECT id FROM "${schema}"."User" WHERE phone=$1`,
                [faultPhone],
              )
            ).rowCount,
            1,
          );
        },
      );

      await t.test(
        'strict invalid input and malformed/oversized JSON fail without creating users or consuming KDF/rate state',
        async () => {
          await resetRates();
          const countBefore = await admin.query(
            `SELECT count(*)::int AS count FROM "${schema}"."User"`,
          );
          for (const patch of [
            { role: 'admin' },
            { commercialAccessStatus: 'approved' },
            { managerId: '11111111-1111-4111-8111-111111111111' },
            { phoneVerified: true },
            { customerType: 'business' },
            { phone: '+18005550001' },
            { phone: '+7 abc 000-00-01' },
            { password: 'short' },
            { password: 'x'.repeat(129) },
          ]) {
            code(
              await request(first.base, '/api/v1/auth/register', {
                method: 'POST',
                body: { phone, password, ...patch },
              }),
              400,
              'VALIDATION_FAILED',
            );
          }
          code(
            await request(first.base, '/api/v1/auth/login', {
              method: 'POST',
              raw: '{',
            }),
            400,
            'VALIDATION_FAILED',
          );
          const mixedCaseMalformed = await request(
            first.base,
            '/API/V1/AUTH/login',
            {
              method: 'POST',
              raw: '{"password":"must-not-echo-malformed-body',
            },
          );
          code(mixedCaseMalformed, 400, 'VALIDATION_FAILED');
          assert(
            !mixedCaseMalformed.text.includes('must-not-echo-malformed-body'),
          );
          const oversized = await request(first.base, '/api/v1/auth/login', {
            method: 'POST',
            raw: JSON.stringify({ phone, password: 'x'.repeat(9000) }),
          });
          assert.equal(oversized.status, 413);
          assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
          const countAfter = await admin.query(
            `SELECT count(*)::int AS count FROM "${schema}"."User"`,
          );
          assert.equal(countAfter.rows[0].count, countBefore.rows[0].count);
          assert.equal(
            (
              await admin.query(
                `SELECT count(*)::int AS count FROM "${schema}"."AuthRateLimit"`,
              )
            ).rows[0].count,
            0,
          );
        },
      );

      await t.test(
        'login unknown phone and wrong password share safe 401 while valid login and me expose only the DTO',
        async () => {
          await resetRates();
          const wrong = await request(first.base, '/api/v1/auth/login', {
            method: 'POST',
            body: { phone, password: password.trim() },
          });
          const unknown = await request(second.base, '/api/v1/auth/login', {
            method: 'POST',
            body: { phone: '+79990000002', password },
          });
          code(wrong, 401, 'INVALID_CREDENTIALS');
          code(unknown, 401, 'INVALID_CREDENTIALS');
          assert.deepEqual(wrong.body.error, unknown.body.error);
          const valid = await request(second.base, '/api/v1/auth/login', {
            method: 'POST',
            body: { phone: '+7 (999) 000-00-01', password },
          });
          assert.equal(valid.status, 200);
          loginToken = sessionDto(valid, phone);
          assert(
            loginToken !== initialToken,
            'Login must issue a fresh random session',
          );
          const me = await request(first.base, '/api/v1/me', {
            token: loginToken,
          });
          assert.equal(me.status, 200);
          assert.deepEqual(Object.keys(me.body), ['user']);
          userDto(me.body.user, phone);
          code(await request(first.base, '/api/v1/me'), 401, 'AUTH_REQUIRED');
          code(
            await request(first.base, `/api/v1/me?token=${loginToken}`),
            400,
            'VALIDATION_FAILED',
          );
          code(
            await request(first.base, '/api/v1/me?access_token=not-a-session', {
              token: loginToken,
            }),
            400,
            'VALIDATION_FAILED',
          );
          code(
            await request(first.base, '/api/v1/auth/login?next=admin', {
              method: 'POST',
              body: { phone, password },
            }),
            400,
            'VALIDATION_FAILED',
          );
        },
      );

      await t.test(
        'commercial approval changes are read from the current database for an existing session, never granted by registration',
        async () => {
          for (const status of ['approved', 'rejected', 'revoked', 'pending']) {
            await admin.query(
              `UPDATE "${schema}"."User" SET "commercialAccessStatus"=$1 WHERE phone=$2`,
              [status, phone],
            );
            for (const api of [first, second]) {
              const me = await request(api.base, '/api/v1/me', {
                token: loginToken,
              });
              assert.equal(me.status, 200);
              userDto(me.body.user, phone, status);
            }
            if (status === 'approved') {
              await resetRates();
              const login = await request(second.base, '/api/v1/auth/login', {
                method: 'POST',
                body: { phone, password },
              });
              assert.equal(login.status, 200);
              userDto(login.body.user, phone, 'approved');
            }
          }
        },
      );

      await t.test(
        'persisted sessions survive process restart, DB expiry rejects them, and logout revokes across processes',
        async () => {
          await stop(first.child);
          first = await startApi();
          assert.equal(
            (await request(first.base, '/api/v1/me', { token: loginToken }))
              .status,
            200,
          );
          await admin.query(
            `UPDATE "${schema}"."AuthSession" SET "createdAt"=NOW()-INTERVAL '2 days', "expiresAt"=NOW()-INTERVAL '1 day' WHERE "tokenHash"=$1`,
            [tokenHash(initialToken)],
          );
          code(
            await request(second.base, '/api/v1/me', { token: initialToken }),
            401,
            'AUTH_REQUIRED',
          );
          assert.equal(
            (
              await request(first.base, '/api/v1/auth/logout', {
                method: 'POST',
                token: loginToken,
              })
            ).status,
            204,
          );
          code(
            await request(second.base, '/api/v1/me', { token: loginToken }),
            401,
            'AUTH_REQUIRED',
          );
          assert.equal(
            (
              await request(second.base, '/api/v1/auth/logout', {
                method: 'POST',
                token: loginToken,
              })
            ).status,
            204,
          );
          code(
            await request(second.base, '/api/v1/auth/logout', {
              method: 'POST',
              token: randomBytes(32).toString('base64url'),
            }),
            401,
            'AUTH_REQUIRED',
          );
          const persisted = await admin.query(
            `SELECT "revokedAt" FROM "${schema}"."AuthSession" WHERE "tokenHash"=$1`,
            [tokenHash(loginToken)],
          );
          assert(persisted.rows[0].revokedAt !== null);
        },
      );

      await t.test(
        'phone login budget is atomic across API processes and forwarded IP spoofing does not bypass it',
        async () => {
          await resetRates();
          await avoidRateWindowBoundary(900);
          const identity = '+79990000003';
          const results = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
              request(
                index % 2 ? first.base : second.base,
                '/api/v1/auth/login',
                {
                  method: 'POST',
                  body: { phone: identity, password },
                  headers: { 'X-Forwarded-For': `203.0.113.${index + 1}` },
                },
              ),
            ),
          );
          assert.equal(
            results.filter((result) => result.status === 429).length,
            3,
          );
          for (const result of results) {
            if (result.status === 429) {
              code(result, 429, 'RATE_LIMITED');
              assert(Number(result.headers.get('retry-after')) > 0);
            } else if (result.status === 503) code(result, 503, 'KDF_BUSY');
            else code(result, 401, 'INVALID_CREDENTIALS');
          }
          const rows = await admin.query(
            `SELECT * FROM "${schema}"."AuthRateLimit" WHERE scope='login:phone'`,
          );
          assert.equal(rows.rowCount, 1);
          assert.equal(
            rows.rows[0].keyHash,
            createHmac('sha256', secret)
              .update(`login:phone\0${identity}`)
              .digest('hex'),
          );
          assert.equal(rows.rows[0].attempts, 6);
          assert(
            !JSON.stringify(rows.rows).includes(identity),
            'Rate records must not store the plaintext phone',
          );
        },
      );

      await t.test(
        'source login budget is shared across identities and spoofed forwarding headers',
        async () => {
          await resetRates();
          await avoidRateWindowBoundary(900);
          const results = await Promise.all(
            Array.from({ length: 21 }, (_, index) =>
              request(
                index % 2 ? first.base : second.base,
                '/api/v1/auth/login',
                {
                  method: 'POST',
                  body: {
                    phone: `+7999000${String(index + 1000).padStart(4, '0')}`,
                    password,
                  },
                  headers: { 'X-Forwarded-For': `198.51.100.${index + 1}` },
                },
              ),
            ),
          );
          assert.equal(
            results.filter((result) => result.status === 429).length,
            1,
          );
          for (const result of results) {
            if (result.status === 503) code(result, 503, 'KDF_BUSY');
            else if (result.status === 429) code(result, 429, 'RATE_LIMITED');
            else code(result, 401, 'INVALID_CREDENTIALS');
          }
          const rows = await admin.query(
            `SELECT * FROM "${schema}"."AuthRateLimit" WHERE scope='login:source'`,
          );
          assert.equal(rows.rowCount, 1);
          assert.equal(rows.rows[0].attempts, 21);
          assert.equal(
            rows.rows[0].keyHash,
            createHmac('sha256', secret)
              .update(['login:source', '127.0.0.1'].join('\0'))
              .digest('hex'),
          );
        },
      );

      await t.test(
        'registration budget is also shared across processes and normalized duplicate phones',
        async () => {
          await resetRates();
          await avoidRateWindowBoundary(3600);
          const results = await Promise.all(
            Array.from({ length: 4 }, (_, index) =>
              request(
                index % 2 ? first.base : second.base,
                '/api/v1/auth/register',
                {
                  method: 'POST',
                  body: {
                    phone: index % 2 ? '8 (999) 000-00-01' : phone,
                    password,
                  },
                  headers: { 'X-Forwarded-For': `203.0.113.${index + 30}` },
                },
              ),
            ),
          );
          assert.equal(
            results.filter((result) => result.status === 429).length,
            1,
          );
          assert.equal(
            results.filter((result) => result.status === 409).length,
            3,
          );
          for (const result of results) {
            if (result.status === 429) code(result, 429, 'RATE_LIMITED');
            else code(result, 409, 'REGISTRATION_FAILED');
          }
          const rows = await admin.query(
            `SELECT * FROM "${schema}"."AuthRateLimit" WHERE scope LIKE 'register:%'`,
          );
          assert.equal(rows.rowCount, 2);
          assert.equal(
            rows.rows.find((row) => row.scope === 'register:source').attempts,
            4,
          );
          assert.equal(
            rows.rows.find((row) => row.scope === 'register:phone').attempts,
            3,
          );
        },
      );

      await t.test(
        'disabled auth remains inaccessible and real DB outage produces bounded safe 503',
        async () => {
          const disabled = await startApi({
            AUTH_DEMO_ENABLED: 'false',
            AUTH_RATE_LIMIT_SECRET: '',
          });
          assert.equal((await fetch(`${disabled.base}/api/v1/me`)).status, 404);
          await stop(disabled.child);
          for (const socket of sockets) socket.destroy();
          await new Promise((resolve) => proxy.close(resolve));
          const began = Date.now();
          code(
            await request(first.base, '/api/v1/auth/login', {
              method: 'POST',
              body: { phone, password },
            }),
            503,
            'AUTH_UNAVAILABLE',
          );
          assert(Date.now() - began < 3000, 'Database outage must be bounded');
          assert.equal((await fetch(`${first.base}/health/live`)).status, 200);
          code(
            await request(first.base, '/api/v1/auth/login', {
              method: 'POST',
              body: { phone: 'bad', password: 'short' },
            }),
            400,
            'VALIDATION_FAILED',
          );
        },
      );
    } finally {
      await Promise.allSettled([...children].map(stop));
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
