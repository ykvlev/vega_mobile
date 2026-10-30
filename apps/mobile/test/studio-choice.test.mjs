// Actual hook TypeScript with minimal deterministic React/storage doubles.
// Covers I/O races, not React rendering or native device storage behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const contracts = require('@vega/contracts');
const red = { color: 'carmine', finish: 'satin' };
const blue = { color: 'cobalt', finish: 'matte' };
const record = (choice) => JSON.stringify({ version: 1, choice });
const plain = (value) => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function tick() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
  await yieldImmediate();
}
function harness(storage = {}) {
  const slots = [];
  let cursor = 0;
  let effect;
  let cleanup;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [
        slots[index],
        (next) => {
          slots[index] = next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback) {
      cursor++;
      return callback;
    },
    useEffect(callback) {
      cursor++;
      effect = callback;
    },
  };
  const double = {
    getItem: async () => null,
    setItem: async () => {},
    ...storage,
  };
  const compiled = ts.transpileModule(
    readFileSync(new URL('../src/studio-choice.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports = {};
  const mockedRequire = (name) => {
    if (name === 'react') return hooks;
    if (name === '@vega/contracts') return contracts;
    if (name === '@react-native-async-storage/async-storage')
      return { __esModule: true, default: double };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInNewContext(`(function(require,exports){${compiled}\n})`, {
    JSON,
    Promise,
    Error,
  })(mockedRequire, exports);
  function value() {
    cursor = 0;
    return exports.useStudioChoice();
  }
  return {
    value,
    mount() {
      value();
      cleanup = effect();
    },
    replay() {
      cleanup();
      value();
      cleanup = effect();
    },
    unmount() {
      cleanup();
    },
  };
}

test('public studio choice persists and restores after a fresh hook mount', async () => {
  let saved = null;
  const storage = {
    getItem: async () => saved,
    setItem: async (key, raw) => {
      assert.equal(key, 'vega.public-studio-choice.v1');
      saved = raw;
    },
  };
  const first = harness(storage);
  first.mount();
  await tick();
  assert.equal(first.value().ready, true);
  assert.equal(await first.value().save(red), true);
  assert.deepEqual(plain(first.value().choice), red);
  assert.deepEqual(JSON.parse(saved), { version: 1, choice: red });
  first.unmount();
  const next = harness(storage);
  next.mount();
  await tick();
  assert.deepEqual(plain(next.value().choice), red);
  assert.equal(next.value().error, null);
  next.unmount();
});

test('invalid, oversized or commercially enriched records fall back without destructive writes', async () => {
  for (const raw of [
    '',
    'not json',
    ' '.repeat(257),
    JSON.stringify({ version: 2, choice: red }),
    JSON.stringify({ version: 1, choice: red, token: 'forbidden' }),
    record({ ...red, skuId: 'forbidden' }),
    record({ color: 'arbitrary-url', finish: 'satin' }),
  ]) {
    let writes = 0;
    const app = harness({
      getItem: async () => raw,
      setItem: async () => {
        writes++;
      },
    });
    app.mount();
    await tick();
    assert.equal(app.value().ready, true);
    assert.deepEqual(
      plain(app.value().choice),
      contracts.DEFAULT_STUDIO_CHOICE,
    );
    assert.ok(app.value().error);
    assert.equal(writes, 0);
    assert.equal(
      await app.value().save({ color: 'bad', finish: 'satin' }),
      false,
    );
    assert.equal(writes, 0);
    app.unmount();
  }
});

test('late restoration cannot replace a newer choice selected during the read', async () => {
  const read = deferred();
  let saved;
  const app = harness({
    getItem: () => read.promise,
    setItem: async (_key, raw) => {
      saved = raw;
    },
  });
  app.mount();
  await tick();
  const saving = app.value().save(blue);
  assert.deepEqual(plain(app.value().choice), blue);
  read.resolve(record(red));
  assert.equal(await saving, true);
  await tick();
  assert.deepEqual(plain(app.value().choice), blue);
  assert.deepEqual(JSON.parse(saved).choice, blue);
  app.unmount();
});

test('failed storage preserves the in-memory choice and retry saves the latest value', async () => {
  let failure = true;
  let saved;
  const app = harness({
    setItem: async (_key, raw) => {
      if (failure) throw new Error('Storage unavailable');
      saved = raw;
    },
  });
  app.mount();
  await tick();
  assert.equal(await app.value().save(red), false);
  assert.deepEqual(plain(app.value().choice), red);
  assert.match(app.value().error, /не сохранены/);
  failure = false;
  assert.equal(await app.value().retry(), true);
  assert.equal(app.value().error, null);
  assert.deepEqual(JSON.parse(saved).choice, red);
  app.unmount();
});

test('overlapping writes remain ordered and an obsolete completion cannot clear the latest failure', async () => {
  const firstWrite = deferred();
  let writes = 0;
  const persisted = [];
  const app = harness({
    setItem: async (_key, raw) => {
      if (++writes === 1) await firstWrite.promise;
      persisted.push(JSON.parse(raw).choice);
      if (writes === 2) throw new Error('Second write failed');
    },
  });
  app.mount();
  await tick();
  const first = app.value().save(red);
  await tick();
  const second = app.value().save(blue);
  await tick();
  assert.equal(writes, 1);
  firstWrite.resolve();
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.deepEqual(persisted, [red, blue]);
  assert.deepEqual(plain(app.value().choice), blue);
  assert.ok(app.value().error);
  app.unmount();
});

test('StrictMode effect replay ignores obsolete restore and stale methods do not persist after unmount', async () => {
  const firstRead = deferred();
  let reads = 0;
  let writes = 0;
  const app = harness({
    getItem: () =>
      ++reads === 1 ? firstRead.promise : Promise.resolve(record(blue)),
    setItem: async () => {
      writes++;
    },
  });
  app.mount();
  await tick();
  app.replay();
  firstRead.resolve(record(red));
  await tick();
  assert.deepEqual(plain(app.value().choice), blue);
  assert.equal(app.value().ready, true);
  const old = app.value();
  app.unmount();
  assert.equal(await old.save(red), false);
  assert.equal(writes, 0);
});

test('a failed initial read is recoverable without overwriting storage', async () => {
  let fail = true;
  const app = harness({
    getItem: async () => {
      if (fail) throw new Error('Storage unavailable');
      return record(red);
    },
  });
  app.mount();
  await tick();
  assert.equal(app.value().ready, true);
  assert.ok(app.value().error);
  fail = false;
  assert.equal(await app.value().retry(), true);
  assert.deepEqual(plain(app.value().choice), red);
  assert.equal(app.value().error, null);
  app.unmount();
});
