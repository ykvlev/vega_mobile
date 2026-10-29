import { expect, test, type Page } from '@playwright/test';

const clear = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Демо прозрачная плёнка',
  article: 'DEMO-CLEAR-15',
};
const color = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Демо цветная плёнка',
  article: 'DEMO-COLOR-17',
};
const colorCategory = '22222222-2222-4222-8222-222222222222';
const badge = 'Тестовый каталог · демонстрационная БД';

async function openCatalog(page: Page, query = '') {
  const response = await page.goto(`/catalog-lab${query}`);
  expect(response?.status()).toBe(200);
  // The streaming loading boundary repeats the badge. Wait for the completed
  // server-rendered frame so screenshots cannot silently capture its skeleton.
  await expect(
    page.getByText(
      'Только чтение публичного каталога. Продажи и оплата не подключены.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByText(badge, { exact: true }),
  ).toBeVisible();
  return response!;
}

function products(page: Page) {
  return page.getByRole('list', { name: 'Товары каталога' }).getByRole('link');
}

async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: globalThis.document.documentElement.clientWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
}

test('real seeded database supplies guest products and case-insensitive name/article search', async ({
  page,
}) => {
  await openCatalog(page);
  await expect(products(page)).toHaveCount(3);
  const search = page.getByRole('searchbox', { name: 'Название или артикул' });
  await search.fill('ЦВЕТНАЯ');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(products(page)).toHaveCount(1);
  await expect(products(page).first()).toHaveAccessibleName(
    `Открыть ${color.name}`,
  );
  await search.fill('demo-clear-15');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(products(page)).toHaveCount(1);
  await expect(products(page).first()).toHaveAccessibleName(
    `Открыть ${clear.name}`,
  );
  await search.fill('несохранённый текст');
  await page.getByRole('link', { name: 'Сбросить', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(products(page)).toHaveCount(3);
  await search.fill('ещё один черновик');
  await page
    .getByRole('combobox', { name: 'Категория', exact: true })
    .selectOption(colorCategory);
  await page.getByRole('link', { name: 'Сбросить', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(
    page.getByRole('combobox', { name: 'Категория', exact: true }),
  ).toHaveValue('');
});

test('category filter and cursor pagination retain only matching rows without duplicates', async ({
  page,
}) => {
  await openCatalog(page, '?limit=1');
  await page
    .getByRole('combobox', { name: 'Категория', exact: true })
    .selectOption(colorCategory);
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(products(page)).toHaveCount(1);
  await expect(products(page).first()).toHaveAccessibleName(
    `Открыть ${color.name}`,
  );
  const firstHref = await products(page).first().getAttribute('href');
  await page
    .getByRole('link', { name: 'Следующая страница →', exact: true })
    .click();
  await expect(products(page)).toHaveCount(1);
  await expect(products(page).first()).toHaveAccessibleName(
    'Открыть Демо сатиновая плёнка',
  );
  expect(await products(page).first().getAttribute('href')).not.toBe(firstHref);
  await expect(
    page.getByRole('link', { name: 'Следующая страница →', exact: true }),
  ).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('categoryId')).toBe(
    colorCategory,
  );
  await page
    .getByRole('link', { name: 'К первой странице', exact: true })
    .click();
  await expect(products(page).first()).toHaveAccessibleName(
    `Открыть ${color.name}`,
  );
  await page.getByRole('link', { name: 'Сбросить', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Категория', exact: true }),
  ).toHaveValue('');
});

test('real product detail preserves per-SKU 15m and 17m roll dimensions', async ({
  page,
}) => {
  await openCatalog(page);
  for (const product of [clear, color]) {
    await page
      .getByRole('link', { name: `Открыть ${product.name}`, exact: true })
      .click();
    const detail = page.getByRole('region', {
      name: product.name,
      exact: true,
    });
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole('heading', { name: product.name, level: 2 }),
    ).toBeVisible();
    await expect(detail).toContainText(product.article);
    await expect(
      detail
        .getByRole('definition')
        .filter({ hasText: product === clear ? /^15 м$/ : /^17 м$/ }),
    ).toHaveCount(1);
    await expect(
      detail.getByRole('definition').filter({ hasText: /^1520 мм$/ }),
    ).toHaveCount(1);
    await page
      .getByRole('link', { name: '← Вернуться к списку', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: product.name, level: 2 }),
    ).toHaveCount(0);
  }
});

test('missing product and no-results states remain safe and recoverable', async ({
  page,
}) => {
  await openCatalog(page, '?selected=99999999-9999-4999-8999-999999999999');
  await expect(
    page.getByRole('heading', { name: 'Товар не найден', exact: true }),
  ).toBeVisible();
  await expect(products(page)).toHaveCount(3);
  await openCatalog(page, '?q=no-such-demo-article');
  await expect(
    page.getByRole('heading', { name: 'Ничего не найдено', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Сбросить поиск', exact: true }).click();
  await expect(products(page)).toHaveCount(3);
});

test('invalid and duplicate parameters never reach an unsafe rendered catalog state', async ({
  page,
}) => {
  for (const query of [
    '?limit=0',
    '?selected=not-a-uuid',
    '?categoryId=bad',
    '?q=one&q=two',
    '?unknown=value',
  ]) {
    await openCatalog(page, query);
    await expect(
      page.getByRole('heading', {
        name: 'Проверьте параметры поиска',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Товары каталога' }),
    ).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(
      /postgresql:\/\/|PrismaClient|DATABASE_URL|127\.0\.0\.1:3171/,
    );
  }
});

test('guest HTML and RSC disclose no commercial payload or API origin and browsing is GET-only', async ({
  page,
}) => {
  const writes: string[] = [];
  const directApiCalls: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()))
      writes.push(request.method());
    if (
      new URL(request.url()).port === '3171' ||
      new URL(request.url()).pathname.startsWith('/api/')
    )
      directApiCalls.push(request.url());
  });
  const response = await openCatalog(page);
  const html = await response.text();
  // Read a complete real RSC response directly. Capturing speculative prefetch
  // bodies across navigation can race Chromium's canceled-resource lifecycle.
  const rscResponse = await page.request.get(
    `/catalog-lab?selected=${color.id}`,
    { headers: { RSC: '1' } },
  );
  expect(rscResponse.status()).toBe(200);
  expect(rscResponse.headers()['content-type']).toContain('text/x-component');
  const rsc = await rscResponse.text();
  await page
    .getByRole('link', { name: `Открыть ${color.name}`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: color.name, level: 2 }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: '← Вернуться к списку', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Результаты поиска', exact: true }),
  ).toBeVisible();
  const serialized = [html, rsc, await page.content()].join('\n');
  expect(serialized).not.toMatch(
    /\\?"(?:prices?|stock|inventory|availability|metadata|seedOwner)\\?"\s*:/i,
  );
  expect(serialized).not.toMatch(
    /postgresql:\/\/|DATABASE_URL|127\.0\.0\.1:3171|vega-public-catalog-v1/,
  );
  await expect(page.locator('body')).not.toContainText(/\d[\d\s]*[₽$€]/);
  await expect(
    page.getByRole('button', { name: /Заказать|Оплатить|Добавить в корзину/i }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(directApiCalls).toEqual([]);
});

test('320px catalog, filters and real detail fit viewport and render screenshots', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openCatalog(page);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('catalog-320.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: `Открыть ${color.name}`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: color.name, level: 2 }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('detail-320.png'),
    fullPage: true,
  });
});
