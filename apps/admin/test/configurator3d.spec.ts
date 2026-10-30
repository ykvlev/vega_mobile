import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const scene = (page: Page) => page.getByTestId('three-scene');
async function open(page: Page) {
  await page.goto('/configurator3d');
  await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
  await expect(scene(page).locator('canvas')).toBeVisible();
  expect(
    Number(await scene(page).getAttribute('data-triangles')),
  ).toBeGreaterThan(1000);
  const clearance = Number(
    await scene(page).getAttribute('data-ground-clearance'),
  );
  expect(clearance).toBeGreaterThanOrEqual(0);
  expect(clearance).toBeLessThan(0.04);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

test('real GLB renders, only paint changes, local resources omit credentials', async ({
  page,
}, info) => {
  const errors: string[] = [];
  const external: string[] = [];
  let modelRequests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.protocol.startsWith('http') &&
      url.origin !== 'http://127.0.0.1:3108'
    )
      external.push(url.origin);
    if (url.pathname.endsWith('/car-concept.glb')) {
      modelRequests++;
      expect(request.headers().authorization).toBeUndefined();
      expect(request.headers().cookie).toBeUndefined();
    }
  });
  await page.context().addCookies([
    {
      name: 'ambient-test-cookie',
      value: 'public-scene-must-omit',
      url: 'http://127.0.0.1:3108',
    },
  ]);
  await open(page);
  expect(modelRequests).toBe(1);
  const fixed = await scene(page).getAttribute('data-fixed-materials');
  expect(fixed).toContain('Glass:');
  expect(fixed).toContain('Rim');
  const metrics = await scene(page).evaluate((element) => ({
    renderer: 'Chromium WebGL / SwiftShader',
    devicePerformanceValidated: false,
    triangles: Number(element.getAttribute('data-triangles')),
    calls: Number(element.getAttribute('data-calls')),
    firstInteractiveMs: Number(element.getAttribute('data-load-ms')),
    groundClearance: Number(element.getAttribute('data-ground-clearance')),
    fixedMaterials: element.getAttribute('data-fixed-materials'),
  }));
  const metricsPath = info.outputPath('render-metrics.json');
  await writeFile(metricsPath, JSON.stringify(metrics, null, 2) + '\n');
  await info.attach('actual-render-metrics', {
    contentType: 'application/json',
    path: metricsPath,
  });
  await expect(scene(page)).toHaveAttribute('data-color', '33383d');
  await page.screenshot({
    path: info.outputPath('studio-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Цвет: Кармин', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-color', '9e203a');
  await page.getByRole('button', { name: 'Матовый', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-roughness', '0.8');
  await expect(scene(page)).toHaveAttribute('data-fixed-materials', fixed!);
  await page.getByRole('button', { name: 'Глянец', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-roughness', '0.16');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  // Check actual painted pixels, not just document overflow: the nose must fit.
  const screenshot = await scene(page).locator('canvas').screenshot();
  const pixels = await sharp(screenshot)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = pixels.info.width;
  let right = -1;
  let redPixels = 0;
  for (let y = 0; y < pixels.info.height; y++)
    for (let x = 0; x < pixels.info.width; x++) {
      const offset = (y * pixels.info.width + x) * 4;
      const [r, g, b] = pixels.data.subarray(offset, offset + 3);
      if (r! > g! * 1.35 && r! > b! * 1.15 && r! - g! > 20) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        redPixels++;
      }
    }
  expect(redPixels).toBeGreaterThan(1000);
  expect(left).toBeGreaterThanOrEqual(12);
  expect(right).toBeLessThan(pixels.info.width - 12);
  await page.screenshot({
    path: info.outputPath('studio-mobile-carmine.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('camera responds to presets, keyboard, zoom and pointer drag at 320px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page);
  const initial = await scene(page).getAttribute('data-camera');
  await page.getByRole('button', { name: 'Сбоку', exact: true }).click();
  await expect(scene(page)).not.toHaveAttribute('data-camera', initial!);
  const side = await scene(page).getAttribute('data-camera');
  await page.getByRole('button', { name: 'Приблизить автомобиль' }).click();
  await expect(scene(page)).not.toHaveAttribute('data-camera', side!);
  const canvas = scene(page).locator('canvas');
  await canvas.focus();
  await page.keyboard.press('Home');
  await expect(scene(page)).toHaveAttribute('data-camera', initial!);
  await page.keyboard.press('ArrowLeft');
  await expect(scene(page)).not.toHaveAttribute('data-camera', initial!);
  const before = await scene(page).getAttribute('data-camera');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(scene(page)).not.toHaveAttribute('data-camera', before!);
  await noOverflow(page);
});

test('idle rendering stops; hiding frees GPU buffers; reopen and context loss recover', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__vegaDeletedBuffers', 0);
    const original = WebGL2RenderingContext.prototype.deleteBuffer;
    WebGL2RenderingContext.prototype.deleteBuffer = function (buffer) {
      Reflect.set(
        window,
        '__vegaDeletedBuffers',
        Number(Reflect.get(window, '__vegaDeletedBuffers')) + 1,
      );
      return original.call(this, buffer);
    };
  });
  await open(page);
  // Observe an actual quiet interval; no application RAF/renderer is mocked.
  await page.waitForTimeout(400);
  const frames = await scene(page).getAttribute('data-frames');
  await page.waitForTimeout(300);
  await expect(scene(page)).toHaveAttribute('data-frames', frames!);
  await page.getByRole('button', { name: 'Автовращение', exact: true }).click();
  await expect
    .poll(async () => Number(await scene(page).getAttribute('data-frames')))
    .toBeGreaterThan(Number(frames) + 2);
  await page.getByRole('button', { name: 'Остановить вращение' }).click();
  const deleted = await page.evaluate(() =>
    Number(Reflect.get(window, '__vegaDeletedBuffers')),
  );
  await page.getByRole('button', { name: 'Скрыть 3D' }).click();
  await expect(scene(page).locator('canvas')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Number(Reflect.get(window, '__vegaDeletedBuffers')),
    ),
  ).toBeGreaterThan(deleted);
  await page.getByRole('button', { name: 'Вернуть 3D' }).click();
  await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
  await scene(page)
    .locator('canvas')
    .evaluate((element) => {
      const gl = (element as HTMLCanvasElement).getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension)
        throw new Error('Context loss extension is required for this check');
      extension.loseContext();
    });
  await expect(scene(page)).toHaveAttribute('data-phase', 'failed');
  await expect(scene(page).locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
});

test('failed download leaves a usable fallback and a real retry', async ({
  page,
}, info) => {
  await page.route('**/3d/car-concept/car-concept.glb*', (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto('/configurator3d');
  await expect(scene(page)).toHaveAttribute('data-phase', 'failed');
  await expect(
    page.getByRole('link', { name: /ПЕРЕЙТИ К ПЛЁНКАМ/ }),
  ).toHaveAttribute('href', '/catalog-lab');
  await page.screenshot({
    path: info.outputPath('studio-fallback.png'),
    fullPage: true,
  });
  await page.unroute('**/3d/car-concept/car-concept.glb*');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
});

test('WebGL absence keeps the catalog link and static image', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith('webgl')) return null;
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
  await page.goto('/configurator3d');
  await expect(scene(page)).toHaveAttribute('data-phase', 'failed');
  await expect(
    page.getByAltText('Автомобиль VEGA — статичная иллюстрация'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /ПЕРЕЙТИ К ПЛЁНКАМ/ }),
  ).toBeVisible();
});

test('embedded external resource URLs are rejected before GLTFLoader can request them', async ({
  page,
}) => {
  const raw = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scenes: [{ nodes: [] }],
      scene: 0,
      images: [{ uri: 'https://untrusted.invalid/texture.png' }],
    }),
  );
  const length = Math.ceil(raw.length / 4) * 4;
  const glb = Buffer.alloc(20 + length, 32);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  raw.copy(glb, 20);
  const external: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://untrusted.invalid/'))
      external.push(request.url());
  });
  await page.route('**/3d/car-concept/car-concept.glb*', (route) =>
    route.fulfill({ contentType: 'model/gltf-binary', body: glb }),
  );
  await page.goto('/configurator3d');
  await expect(scene(page)).toHaveAttribute('data-phase', 'failed');
  expect(external).toEqual([]);
});

test('embedded scene is self-contained and emits only the public lifecycle', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const messages: unknown[] = [];
    Object.assign(window, {
      __studioMessages: messages,
      ReactNativeWebView: {
        postMessage(value: string) {
          messages.push(JSON.parse(value));
        },
      },
    });
  });
  const response = await page.goto('/configurator3d/embed');
  expect(response?.headers()['content-security-policy']).toContain(
    "connect-src 'self'",
  );
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
  // No route to auth/catalog or external navigation inside the scene. The
  // document's common skip link is an in-page anchor, not a navigation escape.
  expect(await page.locator('a:not([href^="#"])').count()).toBe(0);
  await expect(page.getByText('Car Concept:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Цвет: Кармин', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-color', '9e203a');
  const messages = await page.evaluate(
    () =>
      (window as Window & { __studioMessages?: unknown[] }).__studioMessages,
  );
  expect(messages).toEqual([
    { version: 1, type: 'vega-studio', phase: 'loading' },
    { version: 1, type: 'vega-studio', phase: 'ready' },
  ]);
  await page.getByRole('button', { name: 'Скрыть 3D', exact: true }).click();
  await expect(scene(page).locator('canvas')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & { __studioMessages?: unknown[] }
        ).__studioMessages?.at(-1),
      ),
    )
    .toEqual({ version: 1, type: 'vega-studio', phase: 'paused' });
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow(page);
});
