import { expect, test, type Page } from '@playwright/test';
import { AuthResponseSchema } from '@vega/contracts';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { Pool } = apiRequire('pg');
const schema = process.env.MOBILE_E2E_SCHEMA;
const source =
  process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (
  !schema ||
  !/^mobile_e2e_[0-9a-f]{32}$/.test(schema) ||
  !source ||
  !/_test$/.test(new URL(source).pathname.slice(1))
) {
  throw new Error('Run mobile browser tests through the isolated test config');
}
const database = new Pool({
  connectionString: source,
  connectionTimeoutMillis: 3000,
  query_timeout: 5000,
});
const color = 'Демо цветная плёнка';

test.beforeEach(async () => {
  await database.query(`DELETE FROM "${schema}"."AuthRateLimit"`);
});
test.afterAll(async () => {
  await database.end();
});

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId('home-screen').evaluate((element) => {
        const images = Array.from(element.querySelectorAll('img'));
        return (
          images.length > 0 &&
          images.every((image) => image.complete && image.naturalWidth > 0)
        );
      }),
    )
    .toBe(true);
}
async function tab(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
}
async function noOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
}
async function privateStores(page: Page, secrets: string[]) {
  const stores = await page.evaluate(() =>
    JSON.stringify({
      local: localStorage,
      session: sessionStorage,
      cookie: document.cookie,
    }),
  );
  for (const secret of secrets) expect(stores.includes(secret)).toBe(false);
}

test('real API catalog search/filter/detail and public local selection survive reload', async ({
  page,
}, info) => {
  const commercialPayloads: boolean[] = [];
  // Buffer the real public API bytes before forwarding them to Chromium.
  // Otherwise an aborted SPA fetch can lose its CDP response body before this
  // privacy assertion reads it. Never replace or ignore a server response.
  await page.route(
    (url) =>
      /^\/api\/v1\/(?:products(?:\/[^/]+)?|categories)$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch({ maxRedirects: 0 });
      const body = await response.body();
      if (response.ok()) {
        commercialPayloads.push(
          /"(?:prices?|stock|inventory|availability)"\s*:/.test(
            body.toString('utf8'),
          ),
        );
      }
      await route.fulfill({ response, body });
    },
  );
  await open(page);
  await page.screenshot({ path: info.outputPath('mobile-home-390.png') });
  await tab(page, 'Каталог');
  const catalog = page.getByTestId('catalog-screen');
  await expect(
    catalog.getByRole('button', { name: /^Открыть Демо/ }),
  ).toHaveCount(3);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('mobile-catalog-390.png') });
  await page
    .getByLabel('Поиск по названию или артикулу', { exact: true })
    .fill('ЦВЕТНАЯ');
  await tab(page, 'Найти');
  await expect(
    catalog.getByRole('button', { name: /^Открыть Демо/ }),
  ).toHaveCount(1);
  await expect(
    catalog.getByRole('button', { name: `Открыть ${color}`, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Поиск по названию или артикулу', { exact: true })
    .fill('');
  await tab(page, 'Найти');
  await expect(
    catalog.getByRole('button', { name: /^Открыть Демо/ }),
  ).toHaveCount(3);
  await tab(page, 'Демо: цветные плёнки');
  await expect(
    catalog.getByRole('button', { name: /^Открыть Демо/ }),
  ).toHaveCount(2);
  await tab(page, `Открыть ${color}`);
  const detail = page.getByTestId('product-detail');
  await expect(detail).toContainText('17 м');
  await expect(detail).toContainText('1520');
  await tab(page, '5 м');
  await page.screenshot({
    path: info.outputPath('mobile-detail-390.png'),
    fullPage: true,
  });
  await tab(page, 'Добавить в подбор');
  await tab(page, 'Подбор');
  await expect(page.getByTestId('selection-screen')).toContainText(color);
  await expect(page.getByTestId('selection-screen')).toContainText('5 м');
  await page.reload();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await tab(page, 'Подбор');
  await expect(page.getByTestId('selection-screen')).toContainText(color);
  await expect(page.getByTestId('selection-screen')).toContainText('5 м');
  expect(commercialPayloads.length).toBeGreaterThan(0);
  expect(commercialPayloads.some(Boolean)).toBe(false);
  await noOverflow(page);
});

test('real registration is pending, logout revokes API session and web stores never persist credentials', async ({
  page,
}, info) => {
  const phone = '+79990003101';
  const password = `Mobile-${randomBytes(24).toString('base64url')}!`;
  await open(page);
  await tab(page, 'Аккаунт');
  await expect(page.getByLabel('Телефон', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('mobile-login-390.png') });
  await tab(page, 'Зарегистрироваться');
  await page.screenshot({ path: info.outputPath('mobile-register-390.png') });
  await page.getByLabel('Телефон', { exact: true }).fill(phone);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  let registration:
    | { status: number; result: ReturnType<typeof AuthResponseSchema.parse> }
    | undefined;
  // Retain the actual API bytes before the successful login unmounts its form.
  // Reading a Chromium response body afterwards can race with fetch cleanup.
  await page.route('**/api/v1/auth/register', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const body = await response.body();
    registration = {
      status: response.status(),
      result: AuthResponseSchema.parse(JSON.parse(body.toString('utf8'))),
    };
    await route.fulfill({ response, body });
  });
  await tab(page, 'Создать аккаунт');
  await expect.poll(() => registration?.status).toBe(201);
  const result = registration!.result;
  const token = result.session.token as string;
  expect(result.user.commercialAccessStatus).toBe('pending');
  await expect(page.getByTestId('account-screen')).toContainText(
    'Ожидает одобрения менеджером',
  );
  await expect(page.getByTestId('account-screen')).toContainText(phone);
  await privateStores(page, [phone, password, token]);
  expect((await page.content()).includes(token)).toBe(false);
  expect((await page.content()).includes(password)).toBe(false);
  await page.screenshot({
    path: info.outputPath('mobile-profile-390.png'),
    fullPage: true,
  });
  await database.query(
    `UPDATE "${schema}"."User" SET "commercialAccessStatus"='approved' WHERE id=$1`,
    [result.user.id],
  );
  await tab(page, 'Обновить статус');
  await expect(page.getByTestId('account-screen')).toContainText(
    'Одобрен менеджером',
  );
  await database.query(
    `UPDATE "${schema}"."User" SET "commercialAccessStatus"='revoked' WHERE id=$1`,
    [result.user.id],
  );
  await tab(page, 'Обновить статус');
  await expect(page.getByTestId('account-screen')).toContainText(
    'Доступ отозван',
  );
  await tab(page, 'Выйти');
  await expect(page.getByLabel('Телефон', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Телефон', { exact: true })).toHaveValue('');
  const revoked = await page.request.get('/api/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(revoked.status()).toBe(401);
  await page.getByLabel('Телефон', { exact: true }).fill(phone);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await tab(page, 'Войти');
  await expect(page.getByTestId('account-screen')).toContainText(
    'Доступ отозван',
  );
  await privateStores(page, [phone, password, token]);
  await page.reload();
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await tab(page, 'Аккаунт');
  // A browser export intentionally keeps tokens in memory. Native SecureStore
  // restoration requires separate device validation, not a localStorage fallback.
  await expect(page.getByLabel('Телефон', { exact: true })).toBeVisible();
  await privateStores(page, [phone, password, token]);
});

test('network failure stays recoverable and customer screens fit 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page);
  await noOverflow(page);
  await page.route('**/api/v1/products*', (route) =>
    route.abort('internetdisconnected'),
  );
  await tab(page, 'Каталог');
  await expect(page.getByTestId('catalog-screen')).not.toContainText(color);
  await expect(
    page.getByRole('button', { name: 'Повторить', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v1/products*');
  await tab(page, 'Повторить');
  await expect(
    page.getByRole('button', { name: `Открыть ${color}`, exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await tab(page, `Открыть ${color}`);
  await noOverflow(page);
  await tab(page, 'Аккаунт');
  await expect(page.getByLabel('Телефон', { exact: true })).toBeVisible();
  await noOverflow(page);
});
