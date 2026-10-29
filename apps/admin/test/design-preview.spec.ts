import { expect, test, type Page } from '@playwright/test';

const prototypeBadge = 'Дизайн-прототип · демонстрационные товары';
const firstProduct = 'VEGA Color · Graphite';

async function openPreview(page: Page) {
  const response = await page.goto('/');
  await expect(page).toHaveURL(/\/design-preview$/);
  expect(response?.status()).toBe(200);
  await expect(page.getByText(prototypeBadge, { exact: true })).toBeVisible();
  const hero = page.getByRole('img', {
    name: 'Авторская визуальная концепция автомобиля в графитовом цвете',
    exact: true,
  });
  await expect(hero).toBeVisible();
  await expect(hero).toHaveJSProperty('complete', true);
  await expect
    .poll(() =>
      hero.evaluate(
        (image) =>
          image instanceof globalThis.HTMLImageElement &&
          image.naturalWidth > 0,
      ),
    )
    .toBe(true);
}

async function openCatalog(page: Page) {
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Каталог', exact: true })
    .click();
  await expect(
    page.getByRole('searchbox', { name: 'Поиск по названию или артикулу' }),
  ).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: globalThis.document.documentElement.clientWidth,
    content: globalThis.document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('catalog search, categories and detail operate on demonstration products', async ({
  page,
}) => {
  await openPreview(page);
  await openCatalog(page);
  const search = page.getByRole('searchbox', {
    name: 'Поиск по названию или артикулу',
  });
  await search.fill('Graphite');
  await expect(
    page.getByRole('button', { name: `Открыть ${firstProduct}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Открыть VEGA/ })).toHaveCount(
    1,
  );
  await search.fill('несуществующий-артикул-qa');
  await expect(page.getByRole('button', { name: /^Открыть VEGA/ })).toHaveCount(
    0,
  );
  await search.clear();
  await page.getByRole('button', { name: 'Ultima', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Ultima', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const ultimaProducts = page.getByRole('button', { name: /^Открыть VEGA/ });
  expect(await ultimaProducts.count()).toBeGreaterThan(0);
  for (const product of await ultimaProducts.all()) {
    await expect(product).toHaveAccessibleName(/Ultima/i);
  }
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await page
    .getByRole('button', { name: `Открыть ${firstProduct}`, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: firstProduct, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Рулон 17 м', { exact: true })).toBeVisible();
  await expect(page.getByText('Ширина 1520 мм', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Назад в каталог', exact: true })
    .click();
  await expect(search).toBeVisible();
  await page
    .getByRole('button', { name: 'Открыть VEGA · Clear', exact: true })
    .click();
  await expect(page.getByText('Рулон 15 м', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Рулоны', exact: true }).click();
  await page
    .getByRole('button', { name: 'Добавить в подбор', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: /Корзина/ })
    .click();
  await expect(
    page.getByRole('article', { name: 'VEGA · Clear, рулоны' }),
  ).toContainText('Целый рулон 15 м');
});

test('local selection preserves meters and rolls of the same film without commerce calls', async ({
  page,
}) => {
  const writeRequests: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writeRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  await openPreview(page);
  await openCatalog(page);
  await page
    .getByRole('button', { name: `Открыть ${firstProduct}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Метры', exact: true }).click();
  const lengths = page.getByRole('group', {
    name: 'Длина отреза',
    exact: true,
  });
  await expect(lengths.getByRole('button')).toHaveCount(18);
  await lengths.getByRole('button', { name: '5 м', exact: true }).click();
  await expect(
    lengths.getByRole('button', { name: '5 м', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByRole('button', { name: 'Добавить в подбор', exact: true })
    .click();
  await expect(
    page.getByText('Добавлено в подбор', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Рулоны', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Количество рулонов' }).fill('1');
  await page
    .getByRole('button', { name: 'Добавить в подбор', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: /Корзина/ })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ваш подбор' }),
  ).toBeVisible();
  const removeButtons = page.getByRole('button', { name: /^Удалить / });
  await expect(removeButtons).toHaveCount(2);
  const meters = page.getByRole('article', { name: `${firstProduct}, метры` });
  const rolls = page.getByRole('article', { name: `${firstProduct}, рулоны` });
  await expect(meters).toContainText('5 м');
  await expect(rolls).toContainText('1 рул.');
  await meters.getByRole('button', { name: /^Удалить / }).focus();
  await page.keyboard.press('Enter');
  await expect(removeButtons).toHaveCount(1);
  await expect(rolls).toContainText('1 рул.');
  await expect(rolls.getByRole('button', { name: /^Удалить / })).toBeFocused();
  await expect(page.getByRole('status')).toContainText('Удалено из подбора:');
  await page.keyboard.press('Enter');
  await expect(removeButtons).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Открыть каталог', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('button', { name: /Оформить|Оплатить/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /Оформить|Оплатить/i }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Открыть каталог', exact: true })
    .click();
  await page
    .getByRole('button', { name: `Открыть ${firstProduct}`, exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Добавить в подбор', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: /Корзина/ })
    .click();
  await expect(removeButtons).toHaveCount(1);
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: /Корзина/ })
    .click();
  await expect(page.getByRole('button', { name: /^Удалить / })).toHaveCount(0);
  expect(writeRequests).toEqual([]);
});

test('guest preview discloses no commercial values and has no private API traffic', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      apiRequests.push(request.url());
    }
  });
  await openPreview(page);
  await openCatalog(page);
  await page
    .getByRole('button', { name: `Открыть ${firstProduct}`, exact: true })
    .click();
  await expect(page.locator('body')).not.toContainText(/\d[\d\s]*[₽$€]/);
  await expect(page.locator('body')).not.toContainText(
    /(?:В наличии|Осталось|Остаток)\s*:?\s*\d/i,
  );
  expect(apiRequests).toEqual([]);
});

test('keyboard profile link opens the connected account screen', async ({
  page,
}) => {
  await openPreview(page);
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Профиль', exact: true })
    .click();
  const login = page.getByRole('link', { name: 'Войти', exact: true });
  await expect(login).toHaveAttribute('href', '/account');
  await login.focus();
  // A navigation focus callback must not steal focus on the next paint.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(login).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole('textbox', { name: 'Телефон', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
});

test('320 px viewport remains within the screen across the main flow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openPreview(page);
  await expectNoOverflow(page);
  await openCatalog(page);
  await expectNoOverflow(page);
  await page
    .getByRole('button', { name: `Открыть ${firstProduct}`, exact: true })
    .click();
  await expectNoOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('meter-options-320.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Добавить в подбор', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: /Корзина/ })
    .click();
  await expectNoOverflow(page);
  await page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Профиль', exact: true })
    .click();
  await expectNoOverflow(page);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`capture rendered home and catalog at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openPreview(page);
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath('home.png'),
      fullPage: true,
    });
    await page.screenshot({ path: testInfo.outputPath('home-viewport.png') });
    await openCatalog(page);
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath('catalog.png'),
      fullPage: true,
    });
    await page.screenshot({
      path: testInfo.outputPath('catalog-viewport.png'),
    });
  });
}
