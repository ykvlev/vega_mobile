import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

// Resolve the dependencies actually consumed by the mobile Expo installation.
// No module hooks or substitute schemas: a missing scoped override must fail.
const mobileRequire = createRequire(
  new URL('../apps/mobile/package.json', import.meta.url),
);
const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
const cliPackagePath = expoRequire.resolve('@expo/cli/package.json');
const cliRequire = createRequire(cliPackagePath);
const cliRoot = dirname(cliPackagePath);
const serverPath = join(cliRoot, 'build/src/start/server');
const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire(
  join(serverPath, 'DevToolsPlugin.schema.js'),
);
const { createMCPDevToolsExtensionSchema } = cliRequire(
  join(serverPath, 'createMCPDevToolsExtensionSchema.js'),
);
const { DevToolsPluginCliExtensionResults } = cliRequire(
  join(serverPath, 'DevToolsPluginCliExtensionResults.js'),
);

const plugin = {
  packageName: 'vega-compat-probe',
  packageRoot: '/tmp/vega-compat-probe',
  cliExtensions: {
    description:
      'Compatibility fixture, never installed as an application plugin',
    entryPoint: 'cli.js',
    commands: [
      {
        name: 'inspect',
        title: 'Inspect fixture',
        environments: ['cli', 'mcp'],
        parameters: [
          { name: 'text', type: 'text', description: 'Fixture text' },
          { name: 'count', type: 'number' },
          { name: 'confirmed', type: 'confirm' },
        ],
      },
    ],
  },
};

test('Expo CLI resolves genuine Zod 4.6.7 rather than the vulnerable v3 API', () => {
  assert.equal(cliRequire('zod/package.json').version, '4.6.7');
  const { z } = cliRequire('zod');
  const schema = z.string();
  assert.equal(schema._zod.version.major, 4);
  assert.equal(typeof z.toJSONSchema, 'function');
  assert.equal(typeof PluginSchema._zod, 'object');
});

test('actual CLI plugin schema validates descriptors and readonly environments', () => {
  const parsed = PluginSchema.parse(plugin);
  assert(Object.isFrozen(parsed.cliExtensions.commands[0].environments));
  assert.equal(
    PluginSchema.safeParse({ ...plugin, packageName: '' }).success,
    false,
  );
  assert.equal(
    PluginSchema.safeParse({
      ...plugin,
      cliExtensions: { ...plugin.cliExtensions, commands: [] },
    }).success,
    false,
  );
  assert.equal(
    PluginSchema.safeParse({
      ...plugin,
      cliExtensions: {
        ...plugin.cliExtensions,
        commands: [{ name: 'a', title: 'A', environments: ['invalid'] }],
      },
    }).success,
    false,
  );
});

test('actual optional MCP schema preserves enums, types, strictness and JSON schema', () => {
  const schema = createMCPDevToolsExtensionSchema(PluginSchema.parse(plugin));
  const input = {
    command: 'inspect',
    text: 'fixture',
    count: 2,
    confirmed: true,
  };
  assert.deepEqual(schema.parse(input), input);
  assert.equal(schema.safeParse({ command: 'inspect' }).success, true);
  for (const invalid of [
    { command: 'unknown' },
    { command: 'inspect', count: '2' },
    { command: 'inspect', confirmed: 'true' },
    { command: 'inspect', extra: 'not allowed' },
  ]) {
    assert.equal(schema.safeParse(invalid).success, false);
  }
  assert.equal(
    cliRequire('zod').toJSONSchema(schema).additionalProperties,
    false,
  );
  assert.throws(() =>
    createMCPDevToolsExtensionSchema({ ...plugin, cliExtensions: undefined }),
  );
  // This checks schema compatibility, not a live expo-mcp transport connection.
});

test('actual plugin output schema validates text, image and audio and exposes issues', () => {
  const output = [
    { type: 'text', text: 'ok', level: 'info' },
    { type: 'image', url: 'https://example.com/image.png' },
    { type: 'audio', url: 'https://example.com/audio.mp3', text: 'audio' },
  ];
  assert.deepEqual(DevToolsPluginOutputSchema.parse(output), output);
  for (const invalid of [
    [{ type: 'image', url: 'not a URL' }],
    [{ type: 'text', text: 'bad', level: 'invalid' }],
    [{ type: 'unknown' }],
  ]) {
    const result = DevToolsPluginOutputSchema.safeParse(invalid);
    assert.equal(result.success, false);
    assert(
      result.error.issues.map((issue) => issue.message).join(', ').length > 0,
    );
  }
});

test('actual CLI output parser handles validated JSON, schema errors and plain text', () => {
  const results = new DevToolsPluginCliExtensionResults();
  const output = [{ type: 'text', text: 'ok', level: 'info' }];
  assert.deepEqual(results.parseOutputText(JSON.stringify(output)), output);
  const invalid = results.parseOutputText('[{"type":"text"}]');
  assert.equal(invalid[0].level, 'error');
  assert.match(invalid[0].text, /^Invalid JSON:/);
  assert.deepEqual(results.parseOutputText('one\ntwo'), [
    { type: 'text', text: 'one', level: 'info' },
    { type: 'text', text: 'two', level: 'info' },
  ]);
  results.append(JSON.stringify(output));
  results.exit(1);
  assert.equal(results.getOutput().length, 2);
  assert.equal(results.getOutput()[1].level, 'error');
});

// Regression for the official bounded-collection fix: oversized arrays must be
// rejected before per-element validation allocates an unbounded issue list.
test('CLI Zod rejects oversized bounded arrays before parsing their elements', () => {
  const { z } = cliRequire('zod');
  let parsedElements = 0;
  const bounded = z
    .array(
      z.unknown().transform((value) => {
        parsedElements += 1;
        return value;
      }),
    )
    .max(2);
  const result = bounded.safeParse(Array(1000).fill('fixture'));
  assert.equal(result.success, false);
  assert.equal(parsedElements, 0);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});
