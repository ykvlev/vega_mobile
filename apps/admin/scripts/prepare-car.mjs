// Rebuild the single allowlisted 3D asset. No arbitrary URLs, paths or CLI inputs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setGlobalProxyFromEnv } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join as joinMeshes,
  prune,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { format } from 'prettier';

assert.equal(process.argv.length, 2, 'This command accepts no arguments');
// Node 24 uses the execution environment's existing proxy without logging it.
setGlobalProxyFromEnv();
const commit = '8f492390ddc7a2ae221a1369ef560589cf8c70fb';
const sourceSha256 =
  'c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b';
const sourceRoot = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${commit}/`;
const sourceUrl = `${sourceRoot}Models/CarConcept/glTF-Binary/CarConcept.glb`;
const maximumSourceBytes = 20 * 1024 * 1024;
const output = fileURLToPath(
  new URL('../public/3d/car-concept/', import.meta.url),
);
const cacheDirectory = join(tmpdir(), 'vega-3d-source');
const cacheFile = join(cacheDirectory, 'CarConcept.glb');
const digest = (data) => createHash('sha256').update(data).digest('hex');

async function download(url, limit) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(60000),
  });
  assert.ok(response.ok, `Allowlisted source returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      assert.ok(length <= limit, 'Source exceeds the download limit');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

function glbJson(data) {
  assert.equal(data.readUInt32LE(0), 0x46546c67, 'Not a GLB');
  assert.equal(data.readUInt32LE(4), 2, 'GLB version must be 2');
  assert.equal(data.readUInt32LE(8), data.byteLength, 'Invalid GLB size');
  assert.equal(data.readUInt32LE(16), 0x4e4f534a, 'Missing JSON chunk');
  return JSON.parse(
    data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'),
  );
}
function triangleCount(json) {
  return json.meshes.reduce(
    (sum, mesh) =>
      sum +
      mesh.primitives.reduce((count, primitive) => {
        assert.equal(
          primitive.mode ?? 4,
          4,
          'Only triangle primitives are supported',
        );
        return (
          count +
          json.accessors[primitive.indices ?? primitive.attributes.POSITION]
            .count /
            3
        );
      }, 0),
    0,
  );
}
function noExternalResources(json) {
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])])
    assert.equal(resource.uri, undefined, 'All GLB resources must be embedded');
}

await mkdir(output, { recursive: true });
await mkdir(cacheDirectory, { recursive: true });
let source;
try {
  const info = await lstat(cacheFile);
  assert.ok(
    info.isFile() && !info.isSymbolicLink() && info.size <= maximumSourceBytes,
  );
  source = await readFile(cacheFile);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  source = await download(sourceUrl, maximumSourceBytes);
  assert.equal(digest(source), sourceSha256, 'Source GLB checksum mismatch');
  const temporary = `${cacheFile}.download`;
  await writeFile(temporary, source, { flag: 'wx' });
  await rename(temporary, cacheFile);
}
assert.equal(digest(source), sourceSha256, 'Source GLB checksum mismatch');
const before = glbJson(source);
noExternalResources(before);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let document = await io.readBinary(source);
let root = document.getRoot();
const materials = root.listMaterials();
const license = materials.find((material) => material.getName() === 'License');
const tireside = materials.find(
  (material) => material.getName() === 'Tireside',
);
assert.ok(license && tireside, 'Reviewed logo-bearing materials are required');
const removedTextures = [
  license.getBaseColorTexture(),
  tireside.getBaseColorTexture(),
  tireside.getNormalTexture(),
];
assert.ok(removedTextures.every(Boolean));
const removedImageHashes = removedTextures.map((texture) =>
  digest(texture.getImage()),
);
assert.equal(new Set(removedImageHashes).size, 3);
for (const [offset, imageIndex] of [3, 10, 11].entries()) {
  const bufferView = before.bufferViews[before.images[imageIndex].bufferView];
  const binaryStart = 20 + source.readUInt32LE(12) + 8;
  const bytes = source.subarray(
    binaryStart + (bufferView.byteOffset ?? 0),
    binaryStart + (bufferView.byteOffset ?? 0) + bufferView.byteLength,
  );
  assert.equal(
    digest(bytes),
    removedImageHashes[offset],
    'Logo image mapping changed upstream',
  );
}
license.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
tireside
  .setBaseColorTexture(null)
  .setNormalTexture(null)
  .setBaseColorFactor([0.025, 0.025, 0.025, 1])
  .setRoughnessFactor(0.85)
  .setMetallicFactor(0);
for (const texture of removedTextures) texture.dispose();
let removedEmblems = 0;
for (const node of root.listNodes()) {
  if (
    node.getName() === 'InteriorSteeringEmblem' ||
    node.getMesh()?.getName() === 'InteriorSteeringEmblem'
  ) {
    node.dispose();
    removedEmblems += 1;
  }
}
assert.ok(removedEmblems > 0, 'Reviewed steering emblem node must be removed');
for (const extension of root.listExtensionsUsed())
  if (extension.extensionName === 'KHR_materials_variants') extension.dispose();
await MeshoptSimplifier.ready;
await document.transform(
  weld(),
  simplify({
    simplifier: MeshoptSimplifier,
    ratio: 0.4,
    error: 0.001,
    lockBorder: true,
  }),
  dedup(),
  prune(),
);
function primitiveCount() {
  return root
    .listMeshes()
    .reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0);
}
const materialNamesBeforeJoin = root
  .listMaterials()
  .map((material) => material.getName());
const boundsBeforeJoin = getBounds(root.getDefaultScene());
const primitivesBeforeJoin = primitiveCount();
await document.transform(flatten(), joinMeshes({ keepNamed: false }), prune());
const primitivesAfterJoin = primitiveCount();
const boundsAfterJoin = getBounds(root.getDefaultScene());
assert.deepEqual(
  root.listMaterials().map((material) => material.getName()),
  materialNamesBeforeJoin,
);
for (const side of ['min', 'max'])
  for (let axis = 0; axis < 3; axis += 1)
    assert.ok(
      Math.abs(boundsBeforeJoin[side][axis] - boundsAfterJoin[side][axis]) <
        0.00001,
      'Joining changed the model bounds',
    );
assert.ok(
  primitivesAfterJoin <= 30,
  'Static batching exceeds the primitive budget',
);
await document.transform(
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [1024, 1024],
    lossless: true,
    effort: 60,
  }),
  dedup(),
  prune(),
);
// A serialization round-trip detaches extension-owned unused resources before
// final pruning; no image is recompressed during this canonicalization.
document = await io.readBinary(await io.writeBinary(document));
await document.transform(prune());
root = document.getRoot();
const images = [];
for (const [index, texture] of root.listTextures().entries()) {
  const metadata = await sharp(texture.getImage()).metadata();
  assert.ok(metadata.width <= 1024 && metadata.height <= 1024);
  assert.equal(metadata.format, 'webp');
  const hash = digest(texture.getImage());
  assert.ok(!removedImageHashes.includes(hash), 'Removed logo image survived');
  images.push({
    index,
    name: texture.getName(),
    width: metadata.width,
    height: metadata.height,
    bytes: texture.getImage().byteLength,
    sha256: hash,
  });
}
const optimized = Buffer.from(await io.writeBinary(document));
const after = glbJson(optimized);
noExternalResources(after);
assert.ok(
  !(after.extensionsUsed ?? []).some((name) =>
    [
      'KHR_materials_variants',
      'KHR_draco_mesh_compression',
      'EXT_meshopt_compression',
    ].includes(name),
  ),
);
assert.ok(!after.nodes.some((node) => node.name === 'InteriorSteeringEmblem'));
assert.ok(!after.meshes.some((mesh) => mesh.name === 'InteriorSteeringEmblem'));
const optimizedLicense = after.materials.find(
  (material) => material.name === 'License',
);
const optimizedTireside = after.materials.find(
  (material) => material.name === 'Tireside',
);
assert.equal(optimizedLicense.pbrMetallicRoughness.baseColorTexture, undefined);
assert.equal(
  optimizedTireside.pbrMetallicRoughness.baseColorTexture,
  undefined,
);
assert.equal(optimizedTireside.normalTexture, undefined);
const triangles = triangleCount(after);
assert.ok(
  optimized.length <= 6 * 1024 * 1024,
  'Optimized GLB exceeds prototype budget',
);
assert.ok(triangles <= 150000, 'Optimized geometry exceeds prototype budget');
await writeFile(join(output, 'car-concept.glb'), optimized);
const manifest = {
  schemaVersion: 1,
  source: {
    url: sourceUrl,
    commit,
    sha256: sourceSha256,
    bytes: source.length,
    triangles: triangleCount(before),
    images: before.images.length,
  },
  optimized: {
    file: 'car-concept.glb',
    sha256: digest(optimized),
    bytes: optimized.length,
    triangles,
    primitives: primitiveCount(),
    sceneBounds: getBounds(root.getDefaultScene()),
    decodedRgbaTextureBytesWithoutMipmaps: images.reduce(
      (sum, image) => sum + image.width * image.height * 4,
      0,
    ),
    images,
  },
  transformations: {
    simplificationRatio: 0.4,
    maximumRelativeError: 0.001,
    lockBorder: true,
    maximumTextureSize: 1024,
    textureFormat: 'webp-lossless',
    meshCompression: false,
    removedMaterialVariants: true,
    removedEmblems,
    flattenedStaticHierarchy: true,
    joinedByMaterial: true,
    primitivesBeforeJoin,
    primitivesAfterJoin,
    boundsBeforeJoin,
    boundsAfterJoin,
    removedLogoImages: [3, 10, 11],
    removedLogoImageSha256: removedImageHashes,
  },
  toolchain: {
    '@gltf-transform/core': '4.5.1',
    '@gltf-transform/functions': '4.5.1',
    '@gltf-transform/extensions': '4.5.1',
    meshoptimizer: '1.3.0',
    sharp: '0.35.5',
    prettier: '3.9.10',
  },
  budget: {
    maximumGlbBytes: 6 * 1024 * 1024,
    maximumTriangles: 150000,
    maximumPrimitives: 30,
    maximumTextureDimension: 1024,
    devicePerformanceValidated: false,
  },
};
await writeFile(
  join(output, 'manifest.json'),
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
const licenses = [
  ['Models/CarConcept/LICENSE.md', 'SOURCE-LICENSE.md'],
  ['LICENSES/CC-BY-4.0.txt', 'CC-BY-4.0.txt'],
  ['LICENSES/LicenseRef-LegalMark-Khronos.txt', 'SOURCE-TRADEMARK-NOTICE.txt'],
];
for (const [path, target] of licenses) {
  const bytes = await download(sourceRoot + path, 64 * 1024);
  await writeFile(
    join(output, target),
    target.endsWith('.md')
      ? await format(bytes.toString('utf8'), { parser: 'markdown' })
      : bytes,
  );
}
await writeFile(
  join(output, 'ATTRIBUTION.md'),
  await format(
    `# Car Concept — атрибуция 3D-модели

Модель и текстуры: **© 2024 Darmstadt Graphics Group GmbH, Eric Chadwick**.
Лицензия: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/),
[полный текст](CC-BY-4.0.txt).

Источник: [Khronos glTF Sample Assets / CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/${commit}/Models/CarConcept),
закреплённый commit **${commit}**.
[Исходный файл лицензии](SOURCE-LICENSE.md) и
[уведомление о марках исходного ассета](SOURCE-TRADEMARK-NOTICE.txt) сохранены.
Относительные ссылки исходного SOURCE-LICENSE.md относятся к исходному репозиторию.

Изменения VEGA: упрощение геометрии с сохранением границ, уменьшение текстур
до 1024 px и перевод в lossless WebP, удаление неиспользуемых ресурсов и вариантов
материалов. Статическая иерархия сведена в группы по материалам (flatten/join):
108 примитивов → 23 при сохранении материалов и габаритов; отдельная анимация
дверей после этой оптимизации не поддерживается. Удалены три текстуры с логотипами: License base color и Tireside
base color/normal (source images 3, 10, 11), а также InteriorSteeringEmblem.
Материал номера оставлен однотонным для собственного номера VEGA в сцене.
Параметры, размеры, SHA-256 и результат преобразования записаны в manifest.json.

Логотипы и товарные знаки исходного ассета исключены из CC-BY-лицензии.
Уведомление Khronos сохранено для происхождения; VEGA не заявляет связи,
сертификации или одобрения со стороны Khronos/DGG.

Это концептуальный автомобиль для инженерного прототипа, не реальная модель
автомобиля заказчика и не подтверждённый физический образец цвета плёнки.

Воспроизведение из корня проекта: node apps/admin/scripts/prepare-car.mjs.
Инструменты закреплены в package.json/pnpm-lock.yaml; произвольные модели, URL
или внешние ресурсы команда не принимает. Тесты устройств, FPS, нагрев и память
ещё не подтверждены.
`,
    { parser: 'markdown' },
  ),
);
console.log(
  JSON.stringify(
    {
      sourceBytes: source.length,
      optimizedBytes: optimized.length,
      sourceTriangles: triangleCount(before),
      optimizedTriangles: triangles,
      textures: images.length,
      optimizedSha256: digest(optimized),
    },
    null,
    2,
  ),
);
