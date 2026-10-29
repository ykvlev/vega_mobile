// Offline validation of the reviewed, committed asset. No rebuild or network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import sharp from 'sharp';

assert.equal(process.argv.length, 2, 'This command accepts no arguments');
const directory = new URL('../public/3d/car-concept/', import.meta.url);
const maximumBytes = 6 * 1024 * 1024;
const maximumTriangles = 150000;
const maximumTextureDimension = 1024;
const sourceCommit = '8f492390ddc7a2ae221a1369ef560589cf8c70fb';
const sourceSha256 =
  'c272098089d78c5cd9fd9f24ff50ee8acf8d932c55f2d55fc10adb6c8998966b';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function boundedFile(name, maximum) {
  const path = fileURLToPath(new URL(name, directory));
  const info = await lstat(path);
  assert.ok(
    info.isFile() && !info.isSymbolicLink() && info.size <= maximum,
    `Invalid file: ${name}`,
  );
  const bytes = await readFile(path);
  assert.ok(bytes.byteLength <= maximum, `Oversized file: ${name}`);
  return bytes;
}
const manifest = JSON.parse(
  (await boundedFile('manifest.json', 64 * 1024)).toString('utf8'),
);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.source.commit, sourceCommit);
assert.equal(manifest.source.sha256, sourceSha256);
assert.equal(
  manifest.source.url,
  `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${sourceCommit}/Models/CarConcept/glTF-Binary/CarConcept.glb`,
);
assert.equal(manifest.source.bytes, 11778688);
assert.equal(manifest.source.triangles, 213347);
assert.equal(manifest.source.images, 14);
assert.equal(manifest.optimized.file, 'car-concept.glb');
assert.match(manifest.optimized.sha256, /^[0-9a-f]{64}$/);
assert.deepEqual(manifest.budget, {
  maximumGlbBytes: maximumBytes,
  maximumTriangles,
  maximumPrimitives: 30,
  maximumTextureDimension,
  devicePerformanceValidated: false,
});
assert.deepEqual(manifest.transformations.removedLogoImages, [3, 10, 11]);
assert.deepEqual(manifest.transformations.removedLogoImageSha256, [
  '1453559c58526ec236ea7f90a72b0e49823061e6c26b571928b9ea3b91593e4d',
  '8cca97aa2b8f10e63751cda6c3d62efa58fb21fed9dcc2a2649f56a7253bc28d',
  '54297a9940353fdab05356ebd1649d967d0cf316968b15f496903ec00731b2c1',
]);
assert.equal(manifest.transformations.removedMaterialVariants, true);
assert.equal(manifest.transformations.meshCompression, false);
assert.equal(manifest.transformations.removedEmblems, 1);

const bytes = await boundedFile('car-concept.glb', maximumBytes);
assert.equal(
  bytes.byteLength,
  manifest.optimized.bytes,
  'GLB length differs from manifest',
);
assert.equal(
  sha256(bytes),
  manifest.optimized.sha256,
  'GLB checksum differs from manifest',
);
assert.ok(bytes.byteLength >= 28);
assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Invalid GLB magic');
assert.equal(bytes.readUInt32LE(4), 2, 'Invalid GLB version');
assert.equal(
  bytes.readUInt32LE(8),
  bytes.byteLength,
  'Invalid GLB total length',
);
const jsonLength = bytes.readUInt32LE(12);
assert.equal(
  bytes.readUInt32LE(16),
  0x4e4f534a,
  'The first GLB chunk must be JSON',
);
assert.ok(
  jsonLength > 0 &&
    jsonLength % 4 === 0 &&
    20 + jsonLength + 8 <= bytes.byteLength,
);
const binHeader = 20 + jsonLength;
const binLength = bytes.readUInt32LE(binHeader);
assert.equal(
  bytes.readUInt32LE(binHeader + 4),
  0x004e4942,
  'The second GLB chunk must be BIN',
);
assert.ok(binLength > 0 && binLength % 4 === 0);
assert.equal(
  binHeader + 8 + binLength,
  bytes.byteLength,
  'Unexpected/truncated GLB chunks',
);
const binary = bytes.subarray(binHeader + 8);
const gltf = JSON.parse(
  new TextDecoder('utf8', { fatal: true }).decode(
    bytes.subarray(20, binHeader),
  ),
);
assert.equal(gltf.asset.version, '2.0');
const bannedExtensions = [
  'KHR_materials_variants',
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
];
function inspectProperties(value) {
  if (Array.isArray(value)) return value.forEach(inspectProperties);
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, 'uri', 'External/data resource URIs are forbidden');
    assert.ok(
      !bannedExtensions.includes(key),
      'Removed variants/compression extension reappeared',
    );
    inspectProperties(child);
  }
}
inspectProperties(gltf);
for (const extension of [
  ...(gltf.extensionsUsed ?? []),
  ...(gltf.extensionsRequired ?? []),
])
  assert.ok(!bannedExtensions.includes(extension));
assert.equal(gltf.buffers.length, 1);
const declaredBinaryLength = gltf.buffers[0].byteLength;
assert.ok(
  Number.isSafeInteger(declaredBinaryLength) && declaredBinaryLength > 0,
);
assert.ok(
  declaredBinaryLength <= binLength && binLength - declaredBinaryLength <= 3,
);
const integer = (value, minimum = 0) =>
  Number.isSafeInteger(value) && value >= minimum;
function viewAt(index) {
  assert.ok(
    integer(index) && index < gltf.bufferViews.length,
    'Invalid bufferView index',
  );
  return gltf.bufferViews[index];
}
for (const view of gltf.bufferViews) {
  assert.equal(view.buffer, 0);
  assert.ok(integer(view.byteOffset ?? 0) && integer(view.byteLength, 1));
  assert.ok(
    (view.byteOffset ?? 0) + view.byteLength <= declaredBinaryLength,
    'bufferView exceeds BIN',
  );
  if (view.byteStride !== undefined)
    assert.ok(
      integer(view.byteStride, 4) &&
        view.byteStride <= 252 &&
        view.byteStride % 4 === 0,
    );
}
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const elements = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
for (const accessor of gltf.accessors) {
  assert.equal(
    accessor.sparse,
    undefined,
    'Sparse accessors are outside this reviewed asset',
  );
  assert.ok(integer(accessor.count, 1));
  const size = componentBytes[accessor.componentType];
  const width = elements[accessor.type];
  assert.ok(size && width, 'Unsupported accessor format in reviewed asset');
  const view = viewAt(accessor.bufferView);
  const offset = accessor.byteOffset ?? 0;
  const stride = view.byteStride ?? size * width;
  assert.ok(integer(offset) && offset % size === 0 && stride >= size * width);
  assert.ok(
    offset + (accessor.count - 1) * stride + size * width <= view.byteLength,
    'Accessor exceeds bufferView',
  );
}
function accessorAt(index) {
  assert.ok(
    integer(index) && index < gltf.accessors.length,
    'Invalid accessor index',
  );
  return gltf.accessors[index];
}
const paintPrimitives = new Map([
  ['Paint 1 Carmine', 0],
  ['Paint 2 Carmine', 0],
]);
let triangles = 0;
let primitives = 0;
for (const mesh of gltf.meshes) {
  assert.ok(!/InteriorSteeringEmblem/i.test(mesh.name ?? ''));
  for (const primitive of mesh.primitives) {
    assert.equal(
      primitive.mode ?? 4,
      4,
      'Only triangle primitives are allowed',
    );
    assert.ok(
      integer(primitive.material) && primitive.material < gltf.materials.length,
    );
    const position = accessorAt(primitive.attributes.POSITION);
    assert.equal(position.type, 'VEC3');
    assert.equal(position.componentType, 5126);
    for (const index of Object.values(primitive.attributes))
      assert.equal(accessorAt(index).count, position.count);
    let count = position.count;
    if (primitive.indices !== undefined) {
      const indices = accessorAt(primitive.indices);
      assert.equal(indices.type, 'SCALAR');
      assert.ok([5121, 5123, 5125].includes(indices.componentType));
      count = indices.count;
      const view = viewAt(indices.bufferView);
      const size = componentBytes[indices.componentType];
      const stride = view.byteStride ?? size;
      const start = (view.byteOffset ?? 0) + (indices.byteOffset ?? 0);
      for (let index = 0; index < count; index += 1) {
        const offset = start + index * stride;
        const vertex =
          size === 1
            ? binary.readUInt8(offset)
            : size === 2
              ? binary.readUInt16LE(offset)
              : binary.readUInt32LE(offset);
        assert.ok(
          vertex < position.count,
          'Triangle index exceeds vertex count',
        );
      }
    }
    assert.equal(count % 3, 0);
    triangles += count / 3;
    primitives += 1;
    const name = gltf.materials[primitive.material].name;
    if (paintPrimitives.has(name))
      paintPrimitives.set(name, paintPrimitives.get(name) + 1);
  }
}
assert.equal(primitives, manifest.optimized.primitives);
assert.ok(primitives <= 30, 'Primitive budget exceeded');
assert.equal(manifest.transformations.flattenedStaticHierarchy, true);
assert.equal(manifest.transformations.joinedByMaterial, true);
assert.equal(manifest.transformations.primitivesAfterJoin, primitives);
for (const side of ['min', 'max']) {
  assert.equal(manifest.optimized.sceneBounds[side].length, 3);
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(Number.isFinite(manifest.optimized.sceneBounds[side][axis]));
    assert.ok(
      Math.abs(
        manifest.transformations.boundsBeforeJoin[side][axis] -
          manifest.transformations.boundsAfterJoin[side][axis],
      ) < 0.00001,
    );
  }
}
assert.equal(triangles, manifest.optimized.triangles);
assert.ok(triangles > 0 && triangles <= maximumTriangles);
for (const [name, count] of paintPrimitives)
  assert.ok(count > 0, `No body primitives for ${name}`);
for (const node of gltf.nodes) {
  assert.ok(!/InteriorSteeringEmblem/i.test(node.name ?? ''));
  if (node.mesh !== undefined)
    assert.ok(integer(node.mesh) && node.mesh < gltf.meshes.length);
  for (const child of node.children ?? [])
    assert.ok(integer(child) && child < gltf.nodes.length);
}
const license = gltf.materials.find((material) => material.name === 'License');
const tireside = gltf.materials.find(
  (material) => material.name === 'Tireside',
);
assert.ok(license && tireside);
assert.equal(
  license.pbrMetallicRoughness.baseColorTexture,
  undefined,
  'Plate logo slot must be removed',
);
assert.equal(
  tireside.pbrMetallicRoughness.baseColorTexture,
  undefined,
  'Tire logo slot must be removed',
);
assert.equal(
  tireside.normalTexture,
  undefined,
  'Tire logo normal slot must be removed',
);
assert.equal(gltf.images.length, manifest.optimized.images.length);
let decodedRgbaBytes = 0;
for (const [index, image] of gltf.images.entries()) {
  const record = manifest.optimized.images[index];
  assert.equal(record.index, index);
  assert.equal(image.mimeType, 'image/webp');
  const view = viewAt(image.bufferView);
  const data = binary.subarray(
    view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength,
  );
  const hash = sha256(data);
  assert.equal(
    hash,
    record.sha256,
    `Image ${index} checksum differs from manifest`,
  );
  assert.equal(data.byteLength, record.bytes);
  assert.ok(
    !manifest.transformations.removedLogoImageSha256.includes(hash),
    'Removed logo bytes survived',
  );
  const metadata = await sharp(data, {
    limitInputPixels: maximumTextureDimension ** 2,
  }).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, record.width);
  assert.equal(metadata.height, record.height);
  assert.ok(
    integer(metadata.width, 1) && metadata.width <= maximumTextureDimension,
  );
  assert.ok(
    integer(metadata.height, 1) && metadata.height <= maximumTextureDimension,
  );
  decodedRgbaBytes += metadata.width * metadata.height * 4;
}
assert.equal(
  decodedRgbaBytes,
  manifest.optimized.decodedRgbaTextureBytesWithoutMipmaps,
);
console.log(
  JSON.stringify(
    {
      status: 'ok',
      bytes: bytes.byteLength,
      triangles,
      primitives,
      bodyPrimitives: Object.fromEntries(paintPrimitives),
      images: gltf.images.length,
      decodedRgbaBytesWithoutMipmaps: decodedRgbaBytes,
      sha256: manifest.optimized.sha256,
      externalResourceUris: 0,
      devicePerformanceValidated: false,
    },
    null,
    2,
  ),
);
