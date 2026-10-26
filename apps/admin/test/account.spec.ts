import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request,
} from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { Pool } = apiRequire('pg');
const sourceUrl =
  process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl || !/_test$/.test(new URL(sourceUrl).pathname.slice(1))) {
  throw new Error('Account browser tests require an explicit *_test database');
}
const schema = process.env.ACCOUNT_E2E_SCHEMA;
if (!schema || !/^account_e2e_[0-9a-f]{32}$/.test(schema)) {
  throw new Error('Run account tests through their isolated Playwright config');
}
const database = new Pool({
  connectionString: sourceUrl,
  connectionTimeoutMillis: 3000,
  query_timeout: 5000,
});
const cookieName = '__Host-vega_session';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const credentials = (suffix: number) => ({
  phone: `+7999000${String(suffix).padStart(4, '0')}`,
  password: `  Test-${randomBytes(18).toString('base64url')}!  `,
});

test.beforeEach(async () => {
  // Fixture isolation only. Actual rate enforcement has independent real-PG tests.
  await database.query(`DELETE FROM "${schema}"."AuthRateLimit"`);
});
test.afterAll(async () => {
  await database.end();
});

async function openAccount(page: Page, mode: 'login' | 'register' = 'login') {
  const response = await page.goto(
    mode === 'register' ? '/account?mode=register' : '/account',
  );
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('form', {
      name: mode === 'register' ? 'Регистрация аккаунта' : 'Вход в аккаунт',
    }),
  ).toBeVisible();
}

async function fill(page: Page, account: ReturnType<typeof credentials>) {
  await page.getByLabel('Телефон', { exact: true }).fill(account.phone);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
}

async function submit(page: Page, mode: 'login' | 'register') {
  const action = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/account',
  );
  await page
    .getByRole('button', {
      name: mode === 'register' ? 'Создать аккаунт' : 'Войти',
      exact: true,
    })
    .click();
  return action;
}

async function register(page: Page, account: ReturnType<typeof credentials>) {
  await openAccount(page, 'register');
  await fill(page, account);
  const action = await submit(page, 'register');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ваш аккаунт.', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(account.phone, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Телефон не подтверждён', { exact: true }),
  ).toBeVisible();
  return action;
}

async function session(context: BrowserContext) {
  const cookies = (await context.cookies()).filter(
    (cookie) => cookie.name === cookieName,
  );
  expect(cookies).toHaveLength(1);
  const cookie = cookies[0];
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe('Lax');
  expect(cookie.path).toBe('/');
  expect(cookie.domain).toBe('127.0.0.1');
  expect(cookie.value.length).toBe(43);
  return cookie;
}

async function counts() {
  const result = await database.query(
    `SELECT (SELECT count(*)::int FROM "${schema}"."User") AS users, (SELECT count(*)::int FROM "${schema}"."AuthSession") AS sessions`,
  );
  return result.rows[0] as { users: number; sessions: number };
}

async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    width: globalThis.document.documentElement.clientWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.width + 1);
}

test('real registration sets a Secure HttpOnly host cookie on loopback, persists and keeps token out of HTML/RSC/storage', async ({
  page,
  context,
}) => {
  const account = credentials(1011);
  const directApiCalls: string[] = [];
  const actionBodies: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).port === '3181')
      directApiCalls.push(request.url());
  });
  // Buffer the real server response before handing it to Chromium: a Next
  // redirect can discard its CDP body before response.text() finishes.
  // Preserve status, headers and bytes; never replace the application response.
  await page.route(
    (url) => url.pathname === '/account',
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch({ maxRedirects: 0 });
      const body = await response.body();
      if (response.headers()['content-type']?.includes('text/x-component'))
        actionBodies.push(body.toString('utf8'));
      await route.fulfill({ response, body });
    },
  );
  await register(page, account);
  const cookie = await session(context);
  expect(actionBodies.length).toBeGreaterThan(0);
  const response = await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
  ).toBeVisible();
  expect(response?.headers()['cache-control']).toContain('no-store');
  const html = await response!.text();
  const rscResponse = await context.request.get('/account', {
    headers: { RSC: '1', Cookie: `${cookieName}=${cookie.value}` },
  });
  expect(rscResponse.headers()['content-type']).toContain('text/x-component');
  const rsc = await rscResponse.text();
  expect(rsc.includes(account.phone)).toBe(true);
  for (const serialized of [html, rsc, await page.content(), ...actionBodies]) {
    expect(serialized.includes(cookie.value)).toBe(false);
    expect(serialized.includes(account.password)).toBe(false);
    expect(serialized).not.toMatch(
      /passwordHash|tokenHash|AUTH_RATE_LIMIT_SECRET|127\.0\.0\.1:3181|postgresql:\/\//,
    );
  }
  const state = await page.evaluate(() => ({
    cookie: globalThis.document.cookie,
    local: JSON.stringify(globalThis.localStorage),
    session: JSON.stringify(globalThis.sessionStorage),
  }));
  expect(state.cookie.includes(cookieName)).toBe(false);
  expect(JSON.stringify(state).includes(cookie.value)).toBe(false);
  expect(JSON.stringify(state).includes(account.password)).toBe(false);
  expect(state.local).toBe('{}');
  expect(state.session).toBe('{}');
  expect(directApiCalls).toEqual([]);
});

test('logout revokes the real API token, browser back cannot restore profile and wrong/correct login behave safely', async ({
  page,
  context,
}) => {
  const account = credentials(1012);
  await register(page, account);
  const previous = await session(context);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(
    page.getByRole('form', { name: 'Вход в аккаунт' }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((cookie) => cookie.name === cookieName),
  ).toBe(false);
  const revoked = await context.request.get('http://127.0.0.1:3181/api/v1/me', {
    headers: { Authorization: `Bearer ${previous.value}` },
  });
  expect(revoked.status()).toBe(401);
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
  ).toHaveCount(0);
  await openAccount(page);
  await fill(page, { ...account, password: account.password.trim() });
  await submit(page, 'login');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Не удалось войти. Проверьте телефон и пароль.',
  );
  expect(
    (await context.cookies()).some((cookie) => cookie.name === cookieName),
  ).toBe(false);
  await fill(page, account);
  await submit(page, 'login');
  await expect(
    page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
  ).toBeVisible();
  const current = await session(context);
  expect(hash(current.value) === hash(previous.value)).toBe(false);
});

test('invalid credentials and extra/duplicate/file form fields create no user or session', async ({
  page,
  context,
}) => {
  const before = await counts();
  const account = credentials(1013);
  for (const variant of [
    'invalid',
    'invalid-phone',
    'role',
    'duplicate',
    'file',
  ]) {
    await openAccount(page, 'register');
    await fill(
      page,
      variant === 'invalid'
        ? { phone: 'invalid', password: 'short' }
        : variant === 'invalid-phone'
          ? { phone: 'invalid', password: account.password }
          : account,
    );
    const form = page.getByRole('form', { name: 'Регистрация аккаунта' });
    await form.evaluate((element, kind) => {
      const formElement = element as HTMLFormElement;
      formElement.noValidate = true;
      if (kind !== 'invalid' && kind !== 'invalid-phone') {
        const input = globalThis.document.createElement('input');
        input.type = kind === 'file' ? 'file' : 'hidden';
        input.name =
          kind === 'role'
            ? 'role'
            : kind === 'duplicate'
              ? 'phone'
              : 'attachment';
        if (kind !== 'file')
          input.value = kind === 'role' ? 'admin' : '+79990001013';
        formElement.append(input);
      }
    }, variant);
    if (variant === 'file')
      await form.locator('input[name="attachment"]').setInputFiles({
        name: 'fixture.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('synthetic test fixture'),
      });
    await submit(page, 'register');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Проверьте данные формы.',
    );
    if (variant === 'invalid-phone') {
      await expect(page.getByLabel('Телефон', { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute(
        'aria-invalid',
        'false',
      );
    }
    expect(
      (await context.cookies()).some((cookie) => cookie.name === cookieName),
    ).toBe(false);
  }
  expect(await counts()).toEqual(before);
  const rates = await database.query(
    `SELECT count(*)::int AS count FROM "${schema}"."AuthRateLimit"`,
  );
  expect(rates.rows[0].count).toBe(0);
});

test('replaying a real action with missing/cross-site/forwarded origin cannot create sessions or change cookie', async ({
  page,
  context,
}) => {
  const action: Request = await register(page, credentials(1014));
  const cookie = await session(context);
  const before = await counts();
  const original = action.headers();
  const data = action.postDataBuffer();
  expect(data !== null).toBe(true);
  const invalidOrigins: Array<Record<string, string>> = [
    { Origin: 'https://evil.example' },
    {},
    {
      Origin: 'https://evil.example',
      'X-Forwarded-Host': 'evil.example',
      'Sec-Fetch-Site': 'cross-site',
    },
  ];
  for (const originHeaders of invalidOrigins) {
    const headers: Record<string, string> = {
      'Content-Type': original['content-type'],
      Cookie: `${cookieName}=${cookie.value}`,
      ...originHeaders,
    };
    for (const key of ['next-action', 'next-router-state-tree'])
      if (original[key]) headers[key] = original[key];
    const response = await context.request.post('/account?mode=register', {
      headers,
      data: data!,
      maxRedirects: 0,
    });
    const body = await response.text();
    expect(
      response.status() >= 400 ||
        body.includes('Не удалось проверить источник запроса.'),
    ).toBe(true);
    expect(body.includes(cookie.value)).toBe(false);
    expect(await counts()).toEqual(before);
    expect(hash((await session(context)).value) === hash(cookie.value)).toBe(
      true,
    );
  }
});

test('actual unavailable API gives safe login errors without exposing infrastructure or setting a cookie', async ({
  page,
  context,
}) => {
  await page.goto('http://127.0.0.1:3103/account');
  await fill(page, credentials(1015));
  await submit(page, 'login');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Сервис входа временно недоступен. Повторите попытку позже.',
  );
  expect(
    (await context.cookies()).some((cookie) => cookie.name === cookieName),
  ).toBe(false);
  await expect(page.locator('body')).not.toContainText(
    /3182|AUTH_API_URL|ECONNREFUSED|fetch failed|postgresql:\/\//,
  );
});

test('API outage does not pretend logout succeeded; cookie survives retry and is revoked after recovery', async ({
  page,
  context,
}) => {
  const account = credentials(1016);
  await register(page, account);
  const cookie = await session(context);
  await page.goto('http://127.0.0.1:3103/account');
  await expect(
    page.getByRole('heading', {
      name: 'Не удалось проверить сеанс.',
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByText(account.phone, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Не удалось завершить выход. Повторите попытку.',
  );
  expect(hash((await session(context)).value) === hash(cookie.value)).toBe(
    true,
  );
  await page.goto('http://127.0.0.1:3102/account');
  await expect(
    page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(
    page.getByRole('form', { name: 'Вход в аккаунт' }),
  ).toBeVisible();
  const revoked = await context.request.get('http://127.0.0.1:3181/api/v1/me', {
    headers: { Authorization: `Bearer ${cookie.value}` },
  });
  expect(revoked.status()).toBe(401);
});

test('320px and 390px login, registration and profile fit the viewport and produce rendered screenshots', async ({
  page,
}, testInfo) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
    await openAccount(page);
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`login-${width}.png`),
      fullPage: true,
    });
    await openAccount(page, 'register');
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`register-${width}.png`),
      fullPage: true,
    });
    await fill(page, credentials(width === 320 ? 1017 : 1018));
    await submit(page, 'register');
    await expect(
      page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`profile-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(
      page.getByRole('form', { name: 'Вход в аккаунт' }),
    ).toBeVisible();
  }
});
