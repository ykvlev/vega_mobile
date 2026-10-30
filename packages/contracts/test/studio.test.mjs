import { test } from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../dist/index.js';
const {
  StudioChoiceSchema,
  StudioChoiceMessageSchema,
  STUDIO_COLOR_IDS,
  STUDIO_FINISH_IDS,
} = contracts;

test('all supported demo combinations round-trip as public choices', () => {
  for (const color of STUDIO_COLOR_IDS)
    for (const finish of STUDIO_FINISH_IDS) {
      const choice = { color, finish };
      assert.deepEqual(StudioChoiceSchema.parse(choice), choice);
      assert.deepEqual(
        StudioChoiceMessageSchema.parse({
          version: 1,
          type: 'vega-studio-choice',
          choice,
        }).choice,
        choice,
      );
    }
});

test('studio rejects unknown, repeated, executable and commercial values', () => {
  for (const choice of [
    {},
    null,
    [],
    { color: 'carmine' },
    { color: 'custom', finish: 'gloss' },
    { color: 'carmine', finish: 'custom' },
    { color: ['carmine', 'forest'], finish: 'gloss' },
    { color: '#ff0000', finish: 'gloss' },
    { color: 'carmine', finish: 'gloss', sku: 'fake' },
    {
      color: 'carmine',
      finish: 'gloss',
      url: 'https://other.invalid/model.glb',
    },
    { color: 'javascript:alert(1)', finish: 'gloss' },
  ])
    assert.equal(StudioChoiceSchema.safeParse(choice).success, false);
  const valid = {
    version: 1,
    type: 'vega-studio-choice',
    choice: { color: 'carmine', finish: 'satin' },
  };
  for (const payload of [
    { ...valid, version: 2 },
    { ...valid, type: 'command' },
    { ...valid, token: 'forbidden' },
    { ...valid, choice: { ...valid.choice, script: 'alert(1)' } },
  ])
    assert.equal(StudioChoiceMessageSchema.safeParse(payload).success, false);
});
