import { test } from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../dist/index.js';

const {
  ImageUploadFieldsSchema,
  ImageDeleteSchema,
  ImageOrderSchema,
  ProductImageSchema,
} = contracts;
const id = '11111111-1111-4111-8111-111111111111';
test('image mutations distinguish multipart string version from exact JSON integer versions', () => {
  assert.deepEqual(ImageUploadFieldsSchema.parse({ version: '2' }), {
    version: 2,
  });
  for (const value of [
    { version: ['1', '2'] },
    { version: 1 },
    { version: '1', path: '/tmp/input' },
    { version: '0' },
  ]) {
    assert.equal(ImageUploadFieldsSchema.safeParse(value).success, false);
  }
  assert.equal(ImageDeleteSchema.safeParse({ version: '2' }).success, false);
  assert.equal(
    ImageDeleteSchema.safeParse({ version: 2, productId: id }).success,
    false,
  );
});
test('image order and metadata have explicit count, uniqueness and size bounds without binary content', () => {
  assert.equal(
    ImageOrderSchema.safeParse({ version: 1, imageIds: [id, id] }).success,
    false,
  );
  assert.equal(
    ImageOrderSchema.safeParse({ version: 1, imageIds: [] }).success,
    true,
  );
  const image = {
    id,
    url: `http://127.0.0.1:3001/api/v1/media/${id}`,
    width: 100,
    height: 200,
    sizeBytes: 1000,
    position: 0,
  };
  assert.deepEqual(ProductImageSchema.parse(image), image);
  for (const extra of [
    { position: 8 },
    { width: 2049 },
    { sizeBytes: 1048577 },
    { data: 'private binary' },
  ]) {
    assert.equal(
      ProductImageSchema.safeParse({ ...image, ...extra }).success,
      false,
    );
  }
});
