import { test } from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../dist/index.js';

const {
  ProductListQuerySchema,
  CategoryListQuerySchema,
  PublicCategorySchema,
  PublicCategoryListSchema,
  PublicProductListSchema,
} = contracts;

test('catalog query accepts bounded scalar filters with deterministic page defaults', () => {
  assert.deepEqual(ProductListQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(
    ProductListQuerySchema.parse({
      q: '  DEMO%_  ',
      limit: '2',
      categoryId: '22222222-2222-4222-8222-222222222222',
    }),
    {
      q: 'DEMO%_',
      limit: 2,
      categoryId: '22222222-2222-4222-8222-222222222222',
    },
  );
  assert.equal(
    ProductListQuerySchema.safeParse({ q: 'x'.repeat(128) }).success,
    true,
  );
});

test('catalog query rejects commercial, unknown, repeated and malformed parameters', () => {
  for (const value of [
    { price: '1' },
    { stock: '1' },
    { sort: 'price' },
    { include: 'stock' },
    { q: ['one', 'two'] },
    { limit: ['1', '2'] },
    { cursor: ['x'] },
    { categoryId: ['x'] },
    { q: { nested: 'value' } },
    { q: 'x'.repeat(129) },
    { q: '  ' },
    { limit: '0' },
    { limit: '101' },
    { limit: '1.5' },
    { limit: 2 },
    { categoryId: 'not-a-uuid' },
    { cursor: 'not-a-uuid' },
  ])
    assert.equal(ProductListQuerySchema.safeParse(value).success, false);
  assert.equal(
    CategoryListQuerySchema.safeParse({ q: 'unsupported' }).success,
    false,
  );
});

test('category and list output contracts reject unapproved commercial fields', () => {
  const category = {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'demo',
    name: 'Демо',
  };
  assert.deepEqual(
    PublicCategoryListSchema.parse({ items: [category], nextCursor: null })
      .items,
    [category],
  );
  assert.equal(
    PublicCategorySchema.safeParse({ ...category, stock: 1 }).success,
    false,
  );
  assert.equal(
    PublicProductListSchema.safeParse({ items: [], nextCursor: null, price: 1 })
      .success,
    false,
  );
});
