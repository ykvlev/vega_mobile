// Deterministic lifecycle regression harness: transpiles the actual providers.
// It replays effect cleanup/remount and delayed I/O with minimal hook doubles.
// It is not a React renderer, SecureStore device test, or replacement for E2E.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { setImmediate as yieldImmediate } from 'node:timers/promises';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const contracts = require('@vega/contracts');
const product = {
  id: 'f32689ce-6a38-4e74-a798-f79bba0e5bd7',
  skuId: '852433ab-76f5-4f20-81da-459d1bdf8265',
  article: 'QA-LIFECYCLE',
  name: 'QA film',
  categoryId: 'a7af3149-4794-451b-b388-4fb0ff4c659a',
  media: [],
  description: 'Demo',
  characteristics: {},
  rollLengthMm: '18000',
  widthMm: '1520',
};
const user = {
  id: product.id,
  phone: '+79990003001',
  role: 'customer',
  commercialAccessStatus: 'pending',
  phoneVerified: false,
};
function saved() {
  return {
    token: 'A'.repeat(43),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
}
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
class ApiError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}
function harness(file, { api = {}, secure = {}, storage = {} } = {}) {
  const slots = [];
  let cursor = 0;
  let effect;
  let cleanup;
  const hooks = {
    createContext: () => ({ Provider: 'provider' }),
    useContext: () => null,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (next) => {
          slots[index] = typeof next === 'function' ? next(slots[index]) : next;
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
  const storageDouble = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    ...storage,
  };
  const native = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
    ...secure,
  };
  const apiDouble = {
    ApiError,
    getMe: async () => user,
    login: async () => ({ user, session: saved() }),
    register: async () => ({ user, session: saved() }),
    logout: async () => {},
    ...api,
  };
  const exports = {};
  const module = { exports };
  const source = readFileSync(
    new URL(`../src/${file}.tsx`, import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const mockedRequire = (name) => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime')
      return {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
      };
    if (name === 'react-native')
      return {
        Platform: { OS: 'ios' },
        AppState: { addEventListener: () => ({ remove() {} }) },
      };
    if (name === 'expo-secure-store') return native;
    if (name === '@react-native-async-storage/async-storage')
      return { __esModule: true, default: storageDouble };
    if (name === '@vega/contracts') return contracts;
    if (name === './api') return apiDouble;
    throw new Error(`Unexpected provider dependency: ${name}`);
  };
  const run = vm.runInNewContext(
    `(function(require,module,exports){${compiled}\n})`,
    {
      AbortController: globalThis.AbortController,
      Date,
      JSON,
      Promise,
      Set,
      Error,
    },
  );
  run(mockedRequire, module, exports);
  const Component =
    module.exports[
      file === 'session' ? 'SessionProvider' : 'SelectionProvider'
    ];
  function value() {
    cursor = 0;
    return Component({ children: null }).props.value;
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

test('session cleanup/remount ignores obsolete storage read and late finally', async () => {
  const oldRead = deferred();
  const currentMe = deferred();
  const session = saved();
  const currentSession = { ...session, token: 'B'.repeat(43) };
  let requestedToken;
  let requestedSignal;
  let reads = 0;
  let deletes = 0;
  let meCalls = 0;
  const app = harness('session', {
    secure: {
      getItemAsync: () =>
        ++reads === 1
          ? oldRead.promise
          : Promise.resolve(JSON.stringify(currentSession)),
      deleteItemAsync: async () => {
        deletes++;
      },
    },
    api: {
      getMe: (token, signal) => {
        requestedToken = token;
        requestedSignal = signal;
        meCalls++;
        return currentMe.promise;
      },
    },
  });
  app.mount();
  await tick();
  app.replay();
  oldRead.resolve(JSON.stringify(session));
  await tick();
  assert.equal(meCalls, 1);
  assert.equal(requestedToken, currentSession.token);
  assert.equal(requestedSignal.aborted, false);
  assert.equal(
    app.value().pending,
    true,
    'obsolete finally cannot unlock current request',
  );
  assert.equal(app.value().state, 'restoring');
  currentMe.resolve(user);
  await tick();
  assert.equal(app.value().state, 'authenticated');
  assert.equal(app.value().pending, false);
  assert.equal(deletes, 0);
  app.unmount();
});

test('late expired-session response cannot delete a remounted current session', async () => {
  const oldMe = deferred();
  const currentMe = deferred();
  let calls = 0;
  let deletes = 0;
  const app = harness('session', {
    secure: {
      getItemAsync: async () => JSON.stringify(saved()),
      deleteItemAsync: async () => {
        deletes++;
      },
    },
    api: { getMe: () => (++calls === 1 ? oldMe.promise : currentMe.promise) },
  });
  app.mount();
  await tick();
  app.replay();
  await tick();
  oldMe.reject(new ApiError('expired'));
  await tick();
  assert.equal(deletes, 0);
  assert.equal(app.value().pending, true);
  currentMe.resolve(user);
  await tick();
  assert.equal(app.value().state, 'authenticated');
  app.unmount();
});

test('a completed secure save is serialized before remount restore and is not revoked', async () => {
  const write = deferred();
  let stored = null;
  let reads = 0;
  let revoked = 0;
  const session = saved();
  const app = harness('session', {
    secure: {
      getItemAsync: async () => {
        reads++;
        return stored;
      },
      setItemAsync: async (_key, raw) => {
        await write.promise;
        stored = raw;
      },
      deleteItemAsync: async () => {
        stored = null;
      },
    },
    api: {
      login: async () => ({ user, session }),
      logout: async () => {
        revoked++;
      },
    },
  });
  app.mount();
  await tick();
  const login = app
    .value()
    .login({ phone: user.phone, password: 'not-persisted-password' });
  await tick();
  app.replay();
  await tick();
  assert.equal(reads, 1, 'new restore waits for the secure write');
  write.resolve();
  await login;
  await tick();
  assert.equal(reads, 2);
  assert.equal(app.value().state, 'authenticated');
  assert.equal(revoked, 0);
  assert.equal(JSON.parse(stored).token, session.token);
  assert.equal(stored.includes('not-persisted-password'), false);
  app.unmount();
});

test('logout after failed restore still revokes persisted bearer and retains it on network failure', async () => {
  let stored = JSON.stringify(saved());
  let deletes = 0;
  let revokedToken;
  const app = harness('session', {
    secure: {
      getItemAsync: async () => stored,
      deleteItemAsync: async () => {
        stored = null;
        deletes++;
      },
    },
    api: {
      getMe: async () => {
        throw new ApiError('network');
      },
      logout: async (token) => {
        revokedToken = token;
        throw new ApiError('network');
      },
    },
  });
  app.mount();
  await tick();
  assert.equal(app.value().state, 'unavailable');
  await app.value().logout();
  assert.equal(revokedToken, JSON.parse(stored).token);
  assert.equal(deletes, 0);
  assert.equal(app.value().state, 'unavailable');
  assert.match(app.value().error, /Не удалось завершить выход/);
  app.unmount();
});

test('obsolete selection read cannot mark new initialization ready or remove valid data', async () => {
  const oldRead = deferred();
  const newRead = deferred();
  let reads = 0;
  let removes = 0;
  const app = harness('selection', {
    storage: {
      getItem: () => (++reads === 1 ? oldRead.promise : newRead.promise),
      removeItem: async () => {
        removes++;
      },
    },
  });
  app.mount();
  await tick();
  app.replay();
  oldRead.reject(new Error('old failure'));
  await tick();
  assert.equal(app.value().ready, false);
  assert.equal(removes, 0);
  newRead.resolve(
    JSON.stringify({
      version: 1,
      items: [{ product, unit: 'meter', quantity: 3 }],
    }),
  );
  await tick();
  assert.equal(app.value().ready, true);
  assert.equal(app.value().items[0].quantity, 3);
  app.unmount();
});

test('obsolete queued selection mutation cannot overwrite remount snapshot', async () => {
  const write = deferred();
  let stored = null;
  let writes = 0;
  const app = harness('selection', {
    storage: {
      getItem: async () => stored,
      setItem: async (_key, raw) => {
        writes++;
        await write.promise;
        stored = raw;
      },
    },
  });
  app.mount();
  await tick();
  const first = app.value().put(product, 'meter', 5);
  const staleQueued = app.value().put(product, 'meter', 9);
  await tick();
  app.replay();
  write.resolve();
  await Promise.all([first, staleQueued]);
  await tick();
  assert.equal(writes, 1);
  assert.equal(app.value().items[0].quantity, 5);
  assert.equal(JSON.parse(stored).items[0].quantity, 5);
  app.unmount();
});

test('selection limit counts UTF-8 bytes and rejects private fields before persistence', async () => {
  let writes = 0;
  const app = harness('selection', {
    storage: {
      setItem: async () => {
        writes++;
      },
    },
  });
  app.mount();
  await tick();
  await app
    .value()
    .put({ ...product, description: 'Я'.repeat(150000) }, 'meter', 1);
  assert.equal(writes, 0);
  await app.value().put({ ...product, price: 'private-value' }, 'meter', 1);
  assert.equal(writes, 0);
  assert.equal(app.value().items.length, 0);
  app.unmount();
});

test('selection disk failure returns false without claiming a saved item', async () => {
  let writes = 0;
  const app = harness('selection', {
    storage: {
      setItem: async () => {
        writes++;
        throw new Error('disk failure');
      },
    },
  });
  app.mount();
  await tick();
  const result = await app.value().put(product, 'meter', 3);
  assert.equal(result, false);
  assert.equal(writes, 1);
  assert.equal(app.value().items.length, 0);
  assert.match(app.value().error, /Не удалось сохранить подбор/);
  app.unmount();
});
