import { expect, test, type Page } from '@playwright/test';

const entry = 'http://127.0.0.1:3108/configurator3d/embed';
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await page
    .getByRole('button', { name: 'Открыть 3D-студию', exact: true })
    .click();
  await expect(page.getByTestId('studio-screen')).toBeVisible();
}

test('mobile entry loads real isolated WebGL, material controls and returns to app', async ({
  page,
}, info) => {
  const requests: Promise<{ url: string; headers: Record<string, string> }>[] =
    [];
  page.on('request', (request) => {
    if (request.url().startsWith('http://127.0.0.1:3108/'))
      requests.push(
        request
          .allHeaders()
          .then((headers) => ({ url: request.url(), headers })),
      );
  });
  await page
    .context()
    .addCookies([
      { name: 'private-app-cookie', value: 'must-not-cross', url: entry },
    ]);
  await page.goto('/');
  await expect(page.getByTestId('home-screen')).toBeVisible();
  expect(requests).toHaveLength(0); // GPU/download only after explicit opening.
  await page
    .getByRole('button', { name: 'Открыть 3D-студию', exact: true })
    .click();
  const iframe = page.locator('iframe');
  await expect(iframe).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-same-origin',
  );
  await expect(iframe).toHaveAttribute('credentialless', '');
  const frame = page.frameLocator('iframe');
  const scene = frame.getByTestId('three-scene');
  await expect(scene).toHaveAttribute('data-phase', 'ready');
  await expect(
    page.getByText('Загружаем 3D-студию', { exact: true }),
  ).toHaveCount(0);
  await expect(scene.locator('canvas')).toBeVisible();
  await frame
    .getByRole('button', { name: 'Цвет: Кармин', exact: true })
    .click();
  await expect(scene).toHaveAttribute('data-color', '9e203a');
  await frame.getByRole('button', { name: 'Сатин', exact: true }).click();
  await expect(scene).toHaveAttribute('data-roughness', '0.42');
  expect(await frame.locator('a:not([href^="#"])').count()).toBe(0);
  const captured = await Promise.all(requests);
  for (const request of captured) {
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.referer ?? '').not.toContain('3106');
  }
  expect(
    captured.some((request) => request.url.includes('car-concept.glb')),
  ).toBe(true);
  const studioFrame = page
    .frames()
    .find((child) => child.url().startsWith(entry))!;
  await studioFrame.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('mobile-studio-390.png') });
  await page
    .getByRole('button', { name: 'Закрыть 3D-студию', exact: true })
    .click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByTestId('home-screen')).toBeVisible();
  await open(page);
  await page
    .getByRole('button', { name: 'В каталог из 3D', exact: true })
    .click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByTestId('catalog-screen')).toBeVisible();
});

test('failed model unmounts scene and retry creates working renderer', async ({
  page,
}) => {
  await page.route('**/car-concept.glb*', (route) =>
    route.fulfill({ status: 503 }),
  );
  await open(page);
  await expect(page.getByRole('alert')).toContainText('3D сейчас недоступно');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'В каталог из 3D', exact: true }),
  ).toBeEnabled();
  await page.unroute('**/car-concept.glb*');
  await page
    .getByRole('button', { name: 'Повторить загрузку 3D', exact: true })
    .click();
  await expect(
    page.frameLocator('iframe').getByTestId('three-scene'),
  ).toHaveAttribute('data-phase', 'ready');
  await expect(
    page.getByText('Загружаем 3D-студию', { exact: true }),
  ).toHaveCount(0);
});

test('unresponsive document cannot fake ready; timeout removes it and keeps catalog', async ({
  page,
}) => {
  await page.clock.install();
  await page.route(
    (url) => url.href.startsWith(entry),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Document without the studio lifecycle</body></html>',
      }),
  );
  await open(page);
  await expect(page.locator('iframe')).toBeVisible();
  await page.evaluate(() => {
    // A sibling/parent window with even the correct payload is not the iframe.
    window.postMessage(
      { version: 1, type: 'vega-studio', phase: 'ready' },
      '*',
    );
  });
  await expect(
    page.getByText('Загружаем 3D-студию', { exact: true }),
  ).toBeVisible();
  const child = page.frames().find((frame) => frame.url().startsWith(entry))!;
  await child.evaluate(() => {
    window.parent.postMessage(
      { version: 2, type: 'vega-studio', phase: 'ready' },
      '*',
    );
    window.parent.postMessage(
      { version: 1, type: 'vega-studio', phase: 'ready', token: 'forbidden' },
      '*',
    );
  });
  await expect(
    page.getByText('Загружаем 3D-студию', { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.getByRole('alert')).toContainText('3D сейчас недоступно');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'В каталог из 3D', exact: true })
    .click();
  await expect(page.getByTestId('catalog-screen')).toBeVisible();
});

test('choice survives catalog return and app reload; reset is persisted without reloading live renderer', async ({
  page,
}) => {
  test.setTimeout(120000);
  const key = 'vega.public-studio-choice.v1';
  let documents = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.url().startsWith(entry))
      documents++;
  });
  await open(page);
  const frame = page.frameLocator('iframe');
  const scene = frame.getByTestId('three-scene');
  await expect(scene).toHaveAttribute('data-phase', 'ready');
  await frame
    .getByRole('button', { name: 'Цвет: Кармин', exact: true })
    .click();
  await frame.getByRole('button', { name: 'Матовый', exact: true }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .toBe(
      JSON.stringify({
        version: 1,
        choice: { color: 'carmine', finish: 'matte' },
      }),
    );
  expect(documents).toBe(1); // Saving state does not replace the active scene.
  await page
    .getByRole('button', { name: 'В каталог из 3D', exact: true })
    .click();
  await expect(page.getByTestId('catalog-screen')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Поиск по названию или артикулу' })
    .fill('Тестовый запрос');
  await page
    .getByRole('button', { name: 'Открыть 3D-студию', exact: true })
    .click();
  await expect(scene).toHaveAttribute('data-phase', 'ready');
  await expect(scene).toHaveAttribute('data-color', '9e203a');
  await expect(scene).toHaveAttribute('data-roughness', '0.8');
  await page
    .getByRole('button', { name: 'Закрыть 3D-студию', exact: true })
    .click();
  await expect(page.getByTestId('catalog-screen')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Поиск по названию или артикулу' }),
  ).toHaveValue('Тестовый запрос');
  await open(page); // A full document reload, not just a React screen remount.
  await expect(scene).toHaveAttribute('data-phase', 'ready');
  await expect(scene).toHaveAttribute('data-color', '9e203a');
  await expect(scene).toHaveAttribute('data-roughness', '0.8');
  await frame
    .getByRole('button', { name: 'Сбросить выбор', exact: true })
    .click();
  await expect(scene).toHaveAttribute('data-color', '33383d');
  await expect(scene).toHaveAttribute('data-roughness', '0.16');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
    .toBe(
      JSON.stringify({
        version: 1,
        choice: { color: 'graphite', finish: 'gloss' },
      }),
    );
  await open(page);
  await expect(scene).toHaveAttribute('data-phase', 'ready');
  await expect(scene).toHaveAttribute('data-color', '33383d');
  await expect(scene).toHaveAttribute('data-roughness', '0.16');
});

test('failed local write leaves live scene working and retry persists its latest choice', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const host = window as Window & { denyStudioWrite?: boolean };
    host.denyStudioWrite = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (host.denyStudioWrite && key === 'vega.public-studio-choice.v1')
        throw new Error('Test storage unavailable');
      original.call(this, key, value);
    };
  });
  await open(page);
  const frame = page.frameLocator('iframe');
  const scene = frame.getByTestId('three-scene');
  await expect(scene).toHaveAttribute('data-phase', 'ready');
  await frame
    .getByRole('button', { name: 'Цвет: Лесной', exact: true })
    .click();
  await expect(scene).toHaveAttribute('data-color', '324e46');
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось восстановить или сохранить',
  );
  await expect(scene.locator('canvas')).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { denyStudioWrite?: boolean }).denyStudioWrite = false;
  });
  await page
    .getByRole('button', { name: 'Повторить сохранение выбора', exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('vega.public-studio-choice.v1')),
    )
    .toBe(
      JSON.stringify({
        version: 1,
        choice: { color: 'forest', finish: 'gloss' },
      }),
    );
});
