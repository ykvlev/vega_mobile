import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const apiRequire = createRequire(resolve(__dirname, '../../api/package.json'));
const { Pool } = apiRequire('pg');
const sharp = apiRequire('sharp');
const schema = process.env.MEDIA_E2E_SCHEMA;
const source =
  process.env.API_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const phone = process.env.MEDIA_E2E_PHONE;
const password = process.env.MEDIA_E2E_PASSWORD;
if (
  !schema ||
  !/^media_e2e_[0-9a-f]{32}$/.test(schema) ||
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

async function imageFile(color: string) {
  return {
    name: `${color}.png`,
    mimeType: 'image/png',
    buffer:
      color === 'hero'
        ? await readFile(
            resolve(
              __dirname,
              '../public/design-preview/vega-concept-hero.png',
            ),
          )
        : await sharp({
            create: { width: 160, height: 100, channels: 3, background: color },
          })
            .png()
            .toBuffer(),
  };
}
async function upload(page: Page, color: string, count: number) {
  await expect(
    page.getByLabel('Добавить фотографию', { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Добавить фотографию', { exact: true })
    .setInputFiles(await imageFile(color));
  await page
    .getByRole('button', { name: 'Загрузить фото', exact: true })
    .click();
  await expect(
    page.getByRole('list', { name: 'Фотографии товара' }).getByRole('listitem'),
  ).toHaveCount(count);
  await expect
    .poll(async () =>
      page
        .getByRole('img', { name: /— фото / })
        .first()
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
}
test('real uploaded draft image survives reload, remains private and publishes through same-origin proxy', async ({
  page,
  browser,
}, testInfo) => {
  await login(page);
  const cat = await category(page, 'media-main');
  const item = await product(page, cat, 'media-main');
  const token = (await cookie(page.context())).value;
  const requests: string[] = [];
  const bearerRequests: boolean[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
    bearerRequests.push(Boolean(request.headers()['authorization']));
  });
  await upload(page, 'hero', 1);
  await page.reload();
  const images = page.getByRole('img', { name: /— фото / });
  await expect(images).toHaveCount(1);
  const src = await images.first().getAttribute('src');
  expect(src).toMatch(/^\/media\/[0-9a-f-]+$/);
  const guest = await browser.newContext();
  try {
    expect(
      (await guest.request.get(`http://127.0.0.1:3105${src}`)).status(),
    ).toBe(404);
    await page
      .getByRole('button', { name: 'Опубликовать', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Снять с публикации', exact: true }),
    ).toBeVisible();
    const response = await guest.request.get(`http://127.0.0.1:3105${src}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    await page.goto(`/catalog-lab?selected=${item.id}`);
    await expect(
      page.getByRole('img', { name: `${item.name} — фото 1`, exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        page
          .getByRole('img', { name: `${item.name} — фото 1`, exact: true })
          .evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath('media-public-390.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const html = await page.content();
    expect(html.includes(token)).toBe(false);
    expect(html.includes(password!)).toBe(false);
    expect(html.includes('127.0.0.1:3201')).toBe(false);
    expect(
      requests.some((url) => url.startsWith('http://127.0.0.1:3201')),
    ).toBe(false);
    await page.goto(`/admin?edit=${item.id}`);
    const adminHtml = await page.content();
    expect(adminHtml.includes(token)).toBe(false);
    expect(adminHtml.includes('127.0.0.1:3201')).toBe(false);
    const rsc = await page
      .context()
      .request.get(`/admin?edit=${item.id}`, { headers: { RSC: '1' } });
    const rscText = await rsc.text();
    expect(rscText.includes(token)).toBe(false);
    expect(rscText.includes('127.0.0.1:3201')).toBe(false);
    expect(bearerRequests.some(Boolean)).toBe(false);
    const stores = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      cookie: document.cookie,
    }));
    expect(JSON.stringify(stores).includes(token)).toBe(false);
    await expect
      .poll(async () =>
        page
          .getByRole('img', { name: /— фото / })
          .evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await overflow(page);
    await page.screenshot({
      path: testInfo.outputPath('media-editor-1440.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Снять с публикации', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Опубликовать', exact: true }),
    ).toBeVisible();
    expect(
      (await guest.request.get(`http://127.0.0.1:3105${src}`)).status(),
    ).toBe(404);
  } finally {
    await guest.close();
  }
});
test('real photos reorder and remove, invalid file keeps images and dirty editor blocks mutation', async ({
  page,
}) => {
  await login(page);
  const cat = await category(page, 'media-order');
  const item = await product(page, cat, 'media-order');
  await upload(page, 'blue', 1);
  await upload(page, 'green', 2);
  const before = (
    await database.query(
      `SELECT id FROM "${schema}"."ProductImage" WHERE "productId"=$1 ORDER BY position`,
      [item.id],
    )
  ).rows.map((row: { id: string }) => row.id);
  await page
    .getByRole('button', { name: 'Переместить фото 2 выше', exact: true })
    .click();
  await expect
    .poll(async () =>
      (
        await database.query(
          `SELECT id FROM "${schema}"."ProductImage" WHERE "productId"=$1 ORDER BY position`,
          [item.id],
        )
      ).rows.map((row: { id: string }) => row.id),
    )
    .toEqual([...before].reverse());
  const editor = page.getByRole('form', { name: 'Редактирование товара' });
  await editor
    .getByLabel('Название', { exact: true })
    .fill('Несохранённое имя');
  await expect(
    page.getByRole('button', { name: 'Загрузить фото', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Удалить фото 1', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByLabel('Добавить фотографию', { exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Добавить фотографию', { exact: true }).setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await page
    .getByRole('button', { name: 'Загрузить фото', exact: true })
    .click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Фотографии товара' }).getByRole('listitem'),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Удалить фото 1', exact: true })
    .click();
  await expect(
    page.getByRole('list', { name: 'Фотографии товара' }).getByRole('listitem'),
  ).toHaveCount(1);
});
test('upload gateway rejects forged origin without image or audit mutation', async ({
  page,
}) => {
  await login(page);
  const cat = await category(page, 'media-csrf');
  const item = await product(page, cat, 'media-csrf');
  const before = await database.query(
    `SELECT count(*)::int AS n FROM "${schema}"."CatalogAudit"`,
  );
  const response = await page.context().request.post('/admin/images/upload', {
    headers: { Origin: 'https://evil.example' },
    multipart: {
      productId: item.id,
      version: '1',
      file: await imageFile('yellow'),
    },
  });
  expect(response.status()).toBe(403);
  expect(
    (
      await database.query(
        `SELECT count(*)::int AS n FROM "${schema}"."ProductImage" WHERE "productId"=$1`,
        [item.id],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await database.query(
        `SELECT count(*)::int AS n FROM "${schema}"."CatalogAudit"`,
      )
    ).rows[0].n,
  ).toBe(before.rows[0].n);
});
