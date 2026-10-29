import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { Pool } = apiRequire('pg');
const schema = process.env.ADMIN_E2E_SCHEMA;
const source =
  process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const phone = process.env.ADMIN_E2E_PHONE;
const password = process.env.ADMIN_E2E_PASSWORD;
if (
  !schema ||
  !/^admin_e2e_[0-9a-f]{32}$/.test(schema) ||
  !source ||
  !/_test$/.test(new URL(source).pathname.slice(1)) ||
  !phone ||
  !password
) {
  throw new Error('Run manager browser tests through their isolated config');
}
const database = new Pool({
  connectionString: source,
  connectionTimeoutMillis: 3000,
  query_timeout: 5000,
});
const cookieName = '__Host-vega_session';

test.beforeEach(async () => {
  await database.query(`DELETE FROM "${schema}"."AuthRateLimit"`);
});
test.afterAll(async () => {
  await database.end();
});

async function login(page: Page) {
  await page.goto('/account');
  await page.getByLabel('Телефон', { exact: true }).fill(phone!);
  await page.getByLabel('Пароль', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
  ).toBeVisible();
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Каталог товаров', level: 1 }),
  ).toBeVisible();
}
async function cookie(context: BrowserContext) {
  const value = (await context.cookies()).find(
    (entry) => entry.name === cookieName,
  );
  expect(Boolean(value?.secure && value.httpOnly && value.path === '/')).toBe(
    true,
  );
  return value!;
}
async function category(page: Page, suffix: string) {
  const name = `QA категория ${suffix}`;
  const slug = `qa-${suffix}`;
  await page.goto('/admin?view=categories');
  const form = page.getByRole('form', { name: 'Новая категория' });
  await form.getByLabel('Название категории', { exact: true }).fill(name);
  await form.getByLabel('Код категории', { exact: true }).fill(slug);
  await form
    .getByRole('button', { name: 'Создать категорию', exact: true })
    .click();
  await expect(
    page.getByRole('table').getByRole('row').filter({ hasText: slug }),
  ).toContainText(name);
  const result = await database.query(
    `SELECT id FROM "${schema}"."Category" WHERE slug=$1`,
    [slug],
  );
  expect(result.rowCount).toBe(1);
  return { id: result.rows[0].id as string, name };
}
async function product(page: Page, selected: { id: string }, suffix: string) {
  const name = `QA плёнка ${suffix}`;
  const article = `QA-${suffix.toUpperCase()}`;
  await page.goto('/admin?new=product');
  const form = page.getByRole('form', { name: 'Новый товар' });
  await form.getByLabel('Название', { exact: true }).fill(name);
  await form.getByLabel('Артикул', { exact: true }).fill(article);
  await form
    .getByLabel('Категория товара', { exact: true })
    .selectOption(selected.id);
  await form.getByLabel('Длина рулона, м', { exact: true }).fill('17');
  await form.getByLabel('Ширина, мм', { exact: true }).fill('1520');
  await form
    .getByLabel('Описание', { exact: true })
    .fill('Демонстрационный материал QA');
  await form
    .getByRole('button', { name: 'Добавить характеристику', exact: true })
    .click();
  await form
    .getByLabel('Название характеристики 1', { exact: true })
    .fill('Поверхность');
  await form
    .getByLabel('Значение характеристики 1', { exact: true })
    .fill('Матовая');
  await form
    .getByRole('button', { name: 'Создать черновик', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\?edit=[0-9a-f-]+$/);
  await expect(
    page.getByRole('form', { name: 'Редактирование товара' }),
  ).toBeVisible();
  return { id: new URL(page.url()).searchParams.get('edit')!, name, article };
}
async function overflow(page: Page) {
  const size = await page.evaluate(() => ({
    width: globalThis.document.documentElement.clientWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.width + 1);
}

test('guest and real signed-in customer cannot open management controls', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Вход для сотрудников', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Войти в аккаунт' }),
  ).toBeVisible();
  await page.goto('/account?mode=register');
  await page.getByLabel('Телефон', { exact: true }).fill('+79990002002');
  await page
    .getByLabel('Пароль', { exact: true })
    .fill(`Customer-${randomBytes(24).toString('base64url')}!`);
  await page
    .getByRole('button', { name: 'Создать аккаунт', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Ваш аккаунт.', level: 1 }),
  ).toBeVisible();
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', {
      name: 'Доступ только для сотрудников',
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Создать товар', exact: true }),
  ).toHaveCount(0);
});

test('manager creates category and draft, filters it, edits exact dimensions and controls real guest publication', async ({
  page,
  browser,
}) => {
  await login(page);
  const selected = await category(page, 'workflow');
  const item = await product(page, selected, 'workflow');
  const draftEditor = page.getByRole('form', { name: 'Редактирование товара' });
  item.name = `${item.name} сохранённая`;
  await draftEditor.getByLabel('Название', { exact: true }).fill(item.name);
  await expect(
    page.getByRole('button', { name: 'Опубликовать', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Сначала сохраните изменения/)).toBeVisible();
  await draftEditor
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Опубликовать', exact: true }),
  ).toBeEnabled();
  const guest = await browser.newContext({ baseURL: 'http://127.0.0.1:3104' });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(`/catalog-lab?selected=${item.id}`);
    await expect(
      guestPage.getByRole('heading', { name: 'Товар не найден', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Опубликовать', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Снять с публикации', exact: true }),
    ).toBeVisible();
    await guestPage.reload();
    await expect(
      guestPage.getByRole('heading', { name: item.name, level: 2 }),
    ).toBeVisible();
    const original = await (
      await guest.request.get(
        `http://127.0.0.1:3193/api/v1/products/${item.id}`,
      )
    ).json();
    expect(original.rollLengthMm).toBe('17000');
    expect(original.characteristics).toEqual({ Поверхность: 'Матовая' });
    const editor = page.getByRole('form', { name: 'Редактирование товара' });
    await editor.getByLabel('Длина рулона, м', { exact: true }).fill('15,5');
    await editor
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(
      editor.getByLabel('Длина рулона, м', { exact: true }),
    ).toHaveValue('15.5');
    const updated = await (
      await guest.request.get(
        `http://127.0.0.1:3193/api/v1/products/${item.id}`,
      )
    ).json();
    expect(updated.rollLengthMm).toBe('15500');
    expect(updated.skuId).toBe(original.skuId);
    await page.goto('/admin');
    await page
      .getByRole('searchbox', { name: 'Поиск по названию или артикулу' })
      .fill(item.article.toLowerCase());
    await page
      .getByRole('combobox', { name: 'Категория', exact: true })
      .selectOption(selected.id);
    await page
      .getByRole('combobox', { name: 'Статус', exact: true })
      .selectOption('published');
    await page.getByRole('button', { name: 'Найти', exact: true }).click();
    await expect(
      page
        .getByRole('table')
        .getByRole('link', { name: `Редактировать ${item.name}`, exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole('link', { name: `Редактировать ${item.name}`, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Снять с публикации', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Опубликовать', exact: true }),
    ).toBeVisible();
    await guestPage.reload();
    await expect(
      guestPage.getByRole('heading', { name: 'Товар не найден', exact: true }),
    ).toBeVisible();
  } finally {
    await guest.close();
  }
});

test('two real editor tabs reject stale CAS without losing typed fields or overwriting the winning version', async ({
  page,
  context,
}) => {
  await login(page);
  const item = await product(page, await category(page, 'cas'), 'cas');
  const stale = await context.newPage();
  try {
    await stale.goto(`/admin?edit=${item.id}`);
    const staleForm = stale.getByRole('form', {
      name: 'Редактирование товара',
    });
    await staleForm
      .getByLabel('Название', { exact: true })
      .fill('Несохранённое название второго окна');
    const firstForm = page.getByRole('form', { name: 'Редактирование товара' });
    await firstForm
      .getByLabel('Название', { exact: true })
      .fill('Сохранённая версия первого окна');
    await firstForm
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(firstForm.locator('input[name="version"]')).toHaveValue('2');
    await staleForm
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(staleForm.getByRole('alert')).toHaveText(
      'Товар изменился. Обновите страницу и повторите изменения.',
    );
    await expect(staleForm.getByLabel('Название', { exact: true })).toHaveValue(
      'Несохранённое название второго окна',
    );
    const result = await database.query(
      `SELECT name, version FROM "${schema}"."Product" WHERE id=$1`,
      [item.id],
    );
    expect(result.rows[0]).toEqual({
      name: 'Сохранённая версия первого окна',
      version: 2,
    });
  } finally {
    await stale.close();
  }
});

test('invalid dimensions and injected private form fields never create a product or audit event', async ({
  page,
}) => {
  await login(page);
  const selected = await category(page, 'invalid');
  await page.goto('/admin?new=product');
  const form = page.getByRole('form', { name: 'Новый товар' });
  await form
    .getByLabel('Название', { exact: true })
    .fill('Недопустимая карточка');
  await form.getByLabel('Артикул', { exact: true }).fill('QA-INVALID');
  await form
    .getByLabel('Категория товара', { exact: true })
    .selectOption(selected.id);
  await form.getByLabel('Длина рулона, м', { exact: true }).fill('0');
  await form.getByLabel('Ширина, мм', { exact: true }).fill('1520');
  const count = async () =>
    (
      await database.query(
        `SELECT (SELECT count(*) FROM "${schema}"."Product")::int AS products,
                (SELECT count(*) FROM "${schema}"."CatalogAudit")::int AS audits`,
      )
    ).rows[0] as { products: number; audits: number };
  const before = await count();
  await form
    .getByRole('button', { name: 'Создать черновик', exact: true })
    .click();
  await expect(form.getByRole('alert')).toHaveText(
    'Проверьте название, артикул, категорию, размеры и характеристики.',
  );
  expect(await count()).toEqual(before);
  await form.getByLabel('Длина рулона, м', { exact: true }).fill('17');
  await form.evaluate((element) => {
    const input = globalThis.document.createElement('input');
    input.type = 'hidden';
    input.name = 'metadata';
    input.value = '{"price":100}';
    element.append(input);
  });
  await form
    .getByRole('button', { name: 'Создать черновик', exact: true })
    .click();
  await expect(form.getByRole('alert')).toHaveText(
    'Проверьте название, артикул, категорию, размеры и характеристики.',
  );
  expect(await count()).toEqual(before);
});

test('current role is checked for an already-open editor and a failed write cannot change persisted data', async ({
  page,
}) => {
  await login(page);
  const item = await product(page, await category(page, 'role'), 'role');
  const form = page.getByRole('form', { name: 'Редактирование товара' });
  await form
    .getByLabel('Название', { exact: true })
    .fill('Не должно сохраниться после отзыва роли');
  await database.query(
    `UPDATE "${schema}"."User" SET role='customer' WHERE phone=$1`,
    [phone],
  );
  try {
    await form
      .getByRole('button', { name: 'Сохранить изменения', exact: true })
      .click();
    await expect(form.getByRole('alert')).toHaveText(
      'Недостаточно прав для этого действия.',
    );
    expect(
      (
        await database.query(
          `SELECT name FROM "${schema}"."Product" WHERE id=$1`,
          [item.id],
        )
      ).rows[0].name,
    ).toBe(item.name);
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Доступ только для сотрудников',
        level: 1,
      }),
    ).toBeVisible();
  } finally {
    await database.query(
      `UPDATE "${schema}"."User" SET role='manager' WHERE phone=$1`,
      [phone],
    );
  }
});

test('private workspace keeps bearer out of browser payloads and rejects cross-origin replay without catalog changes', async ({
  page,
  context,
}) => {
  const directCalls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).port === '3193') directCalls.push(request.url());
  });
  await login(page);
  await page.goto('/admin?view=categories');
  const form = page.getByRole('form', { name: 'Новая категория' });
  await form
    .getByLabel('Название категории', { exact: true })
    .fill('QA категория csrf');
  await form.getByLabel('Код категории', { exact: true }).fill('qa-csrf');
  const pending = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/admin',
  );
  await form
    .getByRole('button', { name: 'Создать категорию', exact: true })
    .click();
  const action = await pending;
  await expect(
    page.getByRole('table').getByRole('row').filter({ hasText: 'qa-csrf' }),
  ).toBeVisible();
  const credential = await cookie(context);
  const before = (
    await database.query(
      `SELECT count(*)::int AS count FROM "${schema}"."CatalogAudit"`,
    )
  ).rows[0].count;
  const headers: Record<string, string> = {
    'Content-Type': action.headers()['content-type'],
    Origin: 'https://evil.example',
    Cookie: `${cookieName}=${credential.value}`,
  };
  if (action.headers()['next-action'])
    headers['next-action'] = action.headers()['next-action'];
  const rejected = await context.request.post('/admin?view=categories', {
    headers,
    data: action.postDataBuffer()!,
    maxRedirects: 0,
  });
  expect(rejected.status()).toBeGreaterThanOrEqual(400);
  expect(
    (
      await database.query(
        `SELECT count(*)::int AS count FROM "${schema}"."CatalogAudit"`,
      )
    ).rows[0].count,
  ).toBe(before);
  const response = await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Каталог товаров', level: 1 }),
  ).toBeVisible();
  expect(response?.headers()['cache-control']).toContain('no-store');
  const rsc = await context.request.get('/admin', {
    headers: { RSC: '1', Cookie: `${cookieName}=${credential.value}` },
  });
  expect(rsc.headers()['content-type']).toContain('text/x-component');
  for (const text of [
    await response!.text(),
    await rsc.text(),
    await page.content(),
  ]) {
    expect(text.includes(credential.value)).toBe(false);
    expect(text.includes(password!)).toBe(false);
    expect(text).not.toMatch(
      /passwordHash|tokenHash|AUTH_RATE_LIMIT_SECRET|127\.0\.0\.1:3193|postgresql:\/\//,
    );
  }
  const storage = await page.evaluate(() =>
    JSON.stringify([
      globalThis.localStorage,
      globalThis.sessionStorage,
      globalThis.document.cookie,
    ]),
  );
  expect(storage.includes(credential.value)).toBe(false);
  expect(directCalls).toEqual([]);
});

test('category outside first 100 remains editable and desktop table/editor fit 1280/1440 screenshots', async ({
  page,
  context,
}, testInfo) => {
  await login(page);
  const credential = await cookie(context);
  const authorization = { Authorization: `Bearer ${credential.value}` };
  for (let index = 0; index < 101; index += 1) {
    const created = await context.request.post(
      'http://127.0.0.1:3193/api/v1/admin/categories',
      {
        headers: authorization,
        data: { name: `Пакет QA ${index}`, slug: `bulk-qa-${index}` },
      },
    );
    expect(created.status()).toBe(201);
  }
  const first = await (
    await context.request.get(
      'http://127.0.0.1:3193/api/v1/admin/categories?limit=100',
      { headers: authorization },
    )
  ).json();
  expect(Boolean(first.nextCursor)).toBe(true);
  const second = await (
    await context.request.get(
      `http://127.0.0.1:3193/api/v1/admin/categories?limit=100&cursor=${first.nextCursor}`,
      { headers: authorization },
    )
  ).json();
  expect(second.items.length).toBeGreaterThan(0);
  const outside = second.items[0];
  const created = await context.request.post(
    'http://127.0.0.1:3193/api/v1/admin/products',
    {
      headers: authorization,
      data: {
        article: 'QA-CATEGORY-101',
        name: 'QA плёнка категории за первой страницей',
        categoryId: outside.id,
        rollLengthMm: '17000',
        widthMm: '1520',
      },
    },
  );
  expect(created.status()).toBe(201);
  const item = await created.json();
  await page.goto(`/admin?edit=${item.id}`);
  const form = page.getByRole('form', { name: 'Редактирование товара' });
  await expect(
    form.getByLabel('Категория товара', { exact: true }),
  ).toHaveValue(outside.id);
  await form
    .getByLabel('Название', { exact: true })
    .fill('QA категория сохранена после изменения');
  await form
    .getByRole('button', { name: 'Сохранить изменения', exact: true })
    .click();
  await expect(form.locator('input[name="version"]')).toHaveValue('2');
  expect(
    (
      await database.query(
        `SELECT "categoryId" FROM "${schema}"."Product" WHERE id=$1`,
        [item.id],
      )
    ).rows[0].categoryId,
  ).toBe(outside.id);
  await overflow(page);
  await page.evaluate(() => globalThis.window.scrollTo(0, 0));
  await expect
    .poll(() => page.evaluate(() => globalThis.window.scrollY))
    .toBe(0);
  await page.screenshot({
    path: testInfo.outputPath('editor-1440.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await overflow(page);
  await page.goto('/admin');
  await expect(page.getByRole('table')).toBeVisible();
  await overflow(page);
  await page.screenshot({
    path: testInfo.outputPath('catalog-1280.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await overflow(page);
  await page.screenshot({
    path: testInfo.outputPath('catalog-1440.png'),
    fullPage: true,
  });
});
