// Actual policy TypeScript. This tests URL/message policy, not native OS isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const code = ts.transpileModule(
  readFileSync(new URL('../src/studio-policy.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exports = {};
vm.runInNewContext(`(function(exports){${code}\n})`, { URL })(exports);
const { studioUrl, studioPhase, allowsStudioNavigation } = exports;
const input = {
  configured: 'https://studio.vega.example',
  platform: 'ios',
  development: false,
  apiOrigin: 'https://api.vega.example',
};
const entry = 'https://studio.vega.example/configurator3d/embed';

test('studio has one fixed path on a separate canonical origin', () => {
  assert.equal(studioUrl(input), entry);
  for (const configured of [
    undefined,
    '',
    'not a URL',
    'https://user:pass@studio.vega.example',
    'https://studio.vega.example/configurator3d',
    'https://studio.vega.example?color=red',
    'https://studio.vega.example#secret',
    'javascript:alert(1)',
    'file:///studio',
    `https://${'x'.repeat(2048)}.example`,
  ]) {
    assert.equal(studioUrl({ ...input, configured }), null);
  }
  assert.equal(studioUrl({ ...input, configured: input.apiOrigin }), null);
  assert.equal(studioUrl({ ...input, appOrigin: input.configured }), null);
});

test('native release cannot use HTTP; development/web only allow loopback', () => {
  for (const platform of ['ios', 'android']) {
    for (const configured of [
      'http://localhost:3108',
      'http://127.0.0.1:3108',
      'http://[::1]:3108',
    ]) {
      assert.equal(studioUrl({ ...input, platform, configured }), null);
      assert.ok(
        studioUrl({ ...input, platform, configured, development: true }),
      );
    }
  }
  assert.equal(
    studioUrl({
      ...input,
      platform: 'web',
      configured: 'http://127.0.0.1:3108',
    }),
    'http://127.0.0.1:3108/configurator3d/embed',
  );
  for (const platform of ['web', 'ios', 'android']) {
    for (const configured of [
      'http://192.168.1.9:3108',
      'http://studio.vega.example',
      'ftp://studio.vega.example',
    ]) {
      assert.equal(
        studioUrl({ ...input, platform, configured, development: true }),
        null,
      );
    }
  }
});

test('navigation rejects redirects, alternative routes, hashes, schemes and lookalike hosts', () => {
  assert.equal(allowsStudioNavigation(entry, entry), true);
  for (const target of [
    'about:blank',
    'javascript:alert(1)',
    'tel:+79990000000',
    'https://studio.vega.example/',
    `${entry}?next=other`,
    `${entry}#fragment`,
    `${entry}/`,
    'https://studio.vega.example.attacker.test/configurator3d/embed',
    'https://studio.vega.example@attacker.test/configurator3d/embed',
  ]) {
    assert.equal(allowsStudioNavigation(target, entry), false);
  }
});

test('bridge accepts only the public versioned phase envelope', () => {
  for (const phase of ['loading', 'ready', 'failed', 'paused']) {
    const envelope = { version: 1, type: 'vega-studio', phase };
    assert.equal(studioPhase(envelope), phase);
    assert.equal(studioPhase(JSON.stringify(envelope)), phase);
  }
  for (const payload of [
    null,
    undefined,
    [],
    {},
    1,
    'ready',
    'not JSON',
    { version: 2, type: 'vega-studio', phase: 'ready' },
    { version: 1, type: 'other', phase: 'ready' },
    { version: 1, type: 'vega-studio', phase: true },
    { version: 1, type: 'vega-studio', phase: 'unknown' },
    { version: 1, type: 'vega-studio', phase: 'ready', token: 'forbidden' },
    ' '.repeat(257),
    '{"version":1,"type":"vega-studio","phase":"ready",',
  ]) {
    assert.equal(studioPhase(payload), null);
  }
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(studioPhase(cyclic), null);
});
