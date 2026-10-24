import { test } from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../dist/index.js';
const { PublicProductSchema, toPublicProduct } = contracts;

const product = {
  id: '0252bc21-8aa1-484e-82d0-2fe512dbf166',
  skuId: '52f5b2c5-f77f-462c-81ef-91d0ce6c34a8',
  article: 'DEMO-17',
  name: 'Тестовая плёнка',
  categoryId: '82c85912-0801-489b-8e27-adca22ca93ce',
  media: [],
  description: 'Только тест',
  characteristics: { finish: 'gloss' },
  rollLengthMm: '17000',
  widthMm: '1520',
};

test('guest projection removes current and future commercial fields without changing roll length', () => {
  const result = toPublicProduct({
    ...product,
    price: '10000',
    stock: 7,
    availability: true,
    futurePrivateField: 'secret',
  });
  assert.deepEqual(result, product);
  assert.equal(result.rollLengthMm, '17000');
  assert.equal(
    PublicProductSchema.safeParse({ ...product, stock: 7 }).success,
    false,
  );
});

test('transport rejects fractional, negative and numeric lengths', () => {
  for (const rollLengthMm of ['15.5', '-1', '0', '1e3', 15000]) {
    assert.equal(
      PublicProductSchema.safeParse({ ...product, rollLengthMm }).success,
      false,
    );
  }
});
