import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { basename, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const apiRequire = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { Pool } = apiRequire('pg');
const port = 3201;
const schema =
  process.env.MEDIA_E2E_SCHEMA ??
  `media_e2e_${randomUUID().replaceAll('-', '')}`;
assert(/^media_e2e_[0-9a-f]{32}$/.test(schema), 'Invalid media test schema');
const rateLimitSecret = randomBytes(48).toString('base64url');
let activeChild;
let stopping = false;
let phase = 'configuration';
let requestStop;
const stopped = new Promise((resolve) => {
  requestStop = resolve;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    requestStop();
    activeChild?.kill('SIGTERM');
  });
}

function pnpmCli() {
  assert(
    process.env.npm_execpath,
    'Run media tests through the pinned pnpm script',
  );
  const path = realpathSync(process.env.npm_execpath);
  assert(statSync(path).isFile(), 'pnpm CLI must be a regular file');
  assert(
    ['.js', '.cjs', '.mjs'].includes(extname(path)) &&
      /^pnpm\.(?:js|cjs|mjs)$/i.test(basename(path)),
    'npm_execpath must identify the pnpm JavaScript CLI',
  );
  return path;
}

async function stopChild(child) {
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

async function assertPortFree(checkedPort = port) {
  const server = net.createServer();
  const error = new Promise((_, reject) => server.once('error', reject));
  server.listen(checkedPort, '127.0.0.1');
  await Promise.race([once(server, 'listening'), error]);
  await new Promise((resolve) => server.close(resolve));
}

async function migrate(environment) {
  activeChild = spawn(
    process.execPath,
    [pnpmCli(), '--filter', '@vega/api', 'db:migrate'],
    {
      cwd: root,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // Prisma output is not relayed: connection details never enter test artifacts.
  activeChild.stdout.resume();
  activeChild.stderr.resume();
  const timer = setTimeout(() => activeChild?.kill('SIGKILL'), 30000);
  try {
    const [code] = await once(activeChild, 'exit');
    assert.equal(
      code,
      0,
      'Media E2E migration failed; no browser test was accepted',
    );
  } finally {
    clearTimeout(timer);
    await stopChild(activeChild);
    activeChild = undefined;
  }
}

async function waitForReady(child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !stopping) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Media E2E API exited before readiness');
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/ready`, {
        signal: globalThis.AbortSignal.timeout(1000),
      });
      if (response.status === 200) {
        const body = await response.json();
        assert.equal(body.mode, 'demo');
        assert.equal(body.commerceEnabled, false);
        return;
      }
    } catch {
      /* Retry only while the owned process is starting. */
    }
    await delay(100);
  }
  throw new Error('Media E2E API readiness deadline exceeded');
}

async function main() {
  const sourceUrl =
    process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  assert(sourceUrl, 'An explicit test DATABASE_URL is required');
  const url = new URL(sourceUrl);
  assert(
    ['postgres:', 'postgresql:'].includes(url.protocol),
    'PostgreSQL is required',
  );
  assert(
    /_test$/.test(decodeURIComponent(url.pathname.slice(1))),
    'Refusing a database not named *_test',
  );
  phase = 'port';
  await assertPortFree();
  const pool = new Pool({
    connectionString: sourceUrl,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });
  let schemaCreated = false;
  try {
    phase = 'schema';
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    if (stopping) return;
    url.searchParams.set('schema', schema);
    const environment = {
      ...process.env,
      DATABASE_URL: url.href,
      APP_MODE: 'demo',
      COMMERCE_ENABLED: 'false',
      NODE_ENV: 'test',
      AUTH_DEMO_ENABLED: 'true',
      AUTH_RATE_LIMIT_SECRET: rateLimitSecret,
      PORT: String(port),
      PUBLIC_MEDIA_ORIGIN: `http://127.0.0.1:${port}`,
    };
    phase = 'migration';
    await migrate(environment);
    if (stopping) return;
    phase = 'manager-provision';
    const { provisionDemoManager } = apiRequire('./dist/admin-provision.js');
    assert(
      process.env.MEDIA_E2E_PHONE && process.env.MEDIA_E2E_PASSWORD,
      'Explicit manager test credentials are required',
    );
    await provisionDemoManager({
      ...environment,
      ADMIN_PHONE: process.env.MEDIA_E2E_PHONE,
      ADMIN_PASSWORD: process.env.MEDIA_E2E_PASSWORD,
    });
    if (stopping) return;
    phase = 'api-start';
    activeChild = spawn(process.execPath, ['apps/api/dist/main.js'], {
      cwd: root,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChild.stdout.resume();
    activeChild.stderr.resume();
    const exited = once(activeChild, 'exit').then(
      () => 'exit',
      () => 'error',
    );
    await waitForReady(activeChild);
    console.log(
      `Media E2E API ready on 127.0.0.1:${port}; isolated test schema`,
    );
    const outcome = await Promise.race([stopped.then(() => 'stop'), exited]);
    if (outcome !== 'stop' && !stopping) {
      throw new Error('Media E2E API unexpectedly exited');
    }
  } finally {
    stopping = true;
    await stopChild(activeChild);
    try {
      if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]{2,32}$/.test(error.code)
      ? error.code
      : 'UNSPECIFIED';
  console.error(
    `Media E2E API setup or lifecycle failed at ${phase} (${code}); connection and credential details suppressed`,
  );
  process.exitCode = 1;
});
