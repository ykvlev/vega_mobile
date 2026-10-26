import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../dist/sale-rules.js';

const { SaleInventorySchema, evaluateSaleAvailability } = rules;
const sku = '11111111-1111-4111-8111-111111111111';
const anotherSku = '22222222-2222-4222-8222-222222222222';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const snapshot = (rolls = [1, 1], family = 'color') => ({
  skuId: sku,
  family,
  freshness: 'fresh',
  includedWarehouseIds: [a, b],
  warehouses: [a, b].map((warehouseId, index) => ({
    warehouseId,
    skuId: sku,
    wholeRolls: rolls[index],
    readyPieces: [{ lengthMetres: index === 0 ? 1 : 18, count: 1 }],
  })),
});

test('Color and Color Ultima use the same-SKU warehouse total and forbid all pieces at zero, one or two rolls', () => {
  for (const family of ['color', 'color_ultima']) {
    for (const rolls of [
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ]) {
      const result = evaluateSaleAvailability(
        'approved',
        snapshot(rolls, family),
      );
      assert.equal(result.state, 'available');
      assert.equal(
        result.wholeRollAvailable,
        rolls.some((count) => count > 0),
      );
      assert.equal(result.cutPiecesPermitted, false);
      assert.equal(
        result.readyPieceOptions.some((piece) => piece.available),
        false,
      );
    }
    const result = evaluateSaleAvailability(
      'approved',
      snapshot([1, 2], family),
    );
    assert.equal(result.cutPiecesPermitted, true);
    assert.deepEqual(
      result.readyPieceOptions.filter((piece) => piece.available),
      [
        { lengthMetres: 1, available: true },
        { lengthMetres: 18, available: true },
      ],
    );
  }
});

test('unrelated families retain existing pieces with no whole rolls and metre options never infer a missing exact piece', () => {
  const input = snapshot([0, 0], 'other');
  input.warehouses[1].readyPieces[0].count = 0;
  const result = evaluateSaleAvailability('approved', input);
  assert.equal(result.wholeRollAvailable, false);
  assert.equal(result.cutPiecesPermitted, true);
  assert.deepEqual(
    result.readyPieceOptions.map((piece) => piece.lengthMetres),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    result.readyPieceOptions.filter((piece) => piece.available),
    [{ lengthMetres: 1, available: true }],
  );
  // Whole rolls do not silently create 2..17-m ready pieces.
  const withRolls = evaluateSaleAvailability('approved', snapshot([10, 10]));
  assert.equal(
    withRolls.readyPieceOptions.find((piece) => piece.lengthMetres === 2)
      .available,
    false,
  );
});

test('unapproved callers receive an identical hidden shape regardless of stock, freshness or invalid payload', () => {
  for (const approval of [undefined, 'pending', 'rejected', 'revoked']) {
    for (const inventory of [
      undefined,
      null,
      {},
      snapshot([0, 0]),
      snapshot([500, 500]),
      { ...snapshot(), freshness: 'stale' },
    ]) {
      assert.deepEqual(evaluateSaleAvailability(approval, inventory), {
        state: 'hidden',
      });
    }
  }
});

test('stale, missing, duplicate, foreign-SKU and excluded-warehouse inventory fails closed', () => {
  const wrongSku = snapshot();
  wrongSku.warehouses[1].skuId = anotherSku;
  const missingWarehouse = snapshot();
  missingWarehouse.warehouses.pop();
  const excludedWarehouse = snapshot();
  excludedWarehouse.includedWarehouseIds = [a];
  const duplicateWarehouse = snapshot();
  duplicateWarehouse.warehouses[1].warehouseId = a;
  for (const inventory of [
    undefined,
    null,
    {},
    { ...snapshot(), freshness: 'stale' },
    { ...snapshot(), freshness: 'unavailable' },
    wrongSku,
    missingWarehouse,
    excludedWarehouse,
    duplicateWarehouse,
    { ...snapshot(), includedWarehouseIds: [a, a] },
  ]) {
    assert.deepEqual(evaluateSaleAvailability('approved', inventory), {
      state: 'unavailable',
    });
  }
});

test('metres and counts are strict integers, exact lengths are unique and sums cannot overflow', () => {
  for (const badLength of [0, 19, 1.5, '1', -1]) {
    const input = snapshot();
    input.warehouses[0].readyPieces[0].lengthMetres = badLength;
    assert.equal(SaleInventorySchema.safeParse(input).success, false);
  }
  for (const badCount of [
    -1,
    0.5,
    '1',
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
  ]) {
    const input = snapshot();
    input.warehouses[0].wholeRolls = badCount;
    assert.equal(SaleInventorySchema.safeParse(input).success, false);
    input.warehouses[0].wholeRolls = 1;
    input.warehouses[0].readyPieces[0].count = badCount;
    assert.equal(SaleInventorySchema.safeParse(input).success, false);
  }
  const duplicateLength = snapshot();
  duplicateLength.warehouses[0].readyPieces.push({ lengthMetres: 1, count: 3 });
  assert.equal(SaleInventorySchema.safeParse(duplicateLength).success, false);
  assert.equal(
    SaleInventorySchema.safeParse(snapshot([Number.MAX_SAFE_INTEGER, 1]))
      .success,
    false,
  );
  assert.equal(
    SaleInventorySchema.safeParse({ ...snapshot(), totalMetres: 1000 }).success,
    false,
  );
});
