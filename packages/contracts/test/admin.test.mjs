import { test } from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../dist/index.js';

const {
  AdminProductCreateSchema,
  AdminProductPatchSchema,
  AdminProductListQuerySchema,
  AdminCategoryCreateSchema,
  EditableCharacteristicsSchema,
  AuthUserSchema,
} = contracts;
const input = {
  name: 'Демо плёнка',
  article: 'DEMO-ADMIN',
  categoryId: '11111111-1111-4111-8111-111111111111',
  rollLengthMm: '17000',
  widthMm: '1520',
};

test('staff product input defaults to a draft and exact integer strings, never writable ids or commerce fields', () => {
  const parsed = AdminProductCreateSchema.parse(input);
  assert.equal(parsed.isPublished, false);
  assert.equal(parsed.description, '');
  assert.deepEqual(parsed.characteristics, {});
  for (const extra of [
    { id: input.categoryId },
    { skuId: input.categoryId },
    { price: 100 },
    { stock: 5 },
    { version: 99 },
  ]) {
    assert.equal(
      AdminProductCreateSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
  }
  for (const rollLengthMm of ['0', '-1', '15.5', '2147483648', 15000, '1e3']) {
    assert.equal(
      AdminProductCreateSchema.safeParse({ ...input, rollLengthMm }).success,
      false,
    );
  }
  assert.equal(
    AdminProductCreateSchema.safeParse({ ...input, name: 'x'.repeat(161) })
      .success,
    false,
  );
  assert.equal(
    AdminProductCreateSchema.safeParse({ ...input, description: '\0' }).success,
    false,
  );
});

test('CAS updates require a version and at least one writable field; publication is an explicit operation', () => {
  assert.deepEqual(
    AdminProductPatchSchema.parse({ version: 1, isPublished: true }),
    { version: 1, isPublished: true },
  );
  for (const value of [
    { name: 'Missing version' },
    { version: 1 },
    { version: 0, name: 'Invalid' },
    { version: '1', isPublished: false },
    { version: 1, metadata: {} },
  ]) {
    assert.equal(AdminProductPatchSchema.safeParse(value).success, false);
  }
  assert.equal(
    AdminProductListQuerySchema.parse({ status: 'draft' }).status,
    'draft',
  );
  assert.equal(
    AdminProductListQuerySchema.safeParse({ status: ['draft', 'published'] })
      .success,
    false,
  );
});

test('explicit public characteristics are bounded and cannot use internal/commerce keys', () => {
  assert.deepEqual(EditableCharacteristicsSchema.parse({ finish: 'Сатин' }), {
    finish: 'Сатин',
  });
  for (const value of [
    { price: 'hidden' },
    { metadata: 'private' },
    JSON.parse('{"__proto__":"unsafe"}'),
    { finish: 3 },
    { finish: 'x'.repeat(257) },
    Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`key${index}`, 'value']),
    ),
  ]) {
    assert.equal(EditableCharacteristicsSchema.safeParse(value).success, false);
  }
  assert.equal(
    AdminCategoryCreateSchema.safeParse({
      name: 'Категория',
      slug: 'safe-demo',
    }).success,
    true,
  );
  assert.equal(
    AdminCategoryCreateSchema.safeParse({
      name: 'Категория',
      slug: '../unsafe',
    }).success,
    false,
  );
  assert.equal(
    AuthUserSchema.safeParse({
      id: input.categoryId,
      phone: '+79991234567',
      role: 'manager',
      phoneVerified: false,
    }).success,
    true,
  );
});
