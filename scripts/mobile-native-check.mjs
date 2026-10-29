// Generate real native projects in an isolated directory; no signing or upload.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const mobile = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'vega-native-check-'));
try {
  for (const name of ['app.json', 'package.json', 'assets', 'app', 'src'])
    await cp(join(mobile, name), join(temporary, name), { recursive: true });
  await symlink(
    join(mobile, 'node_modules'),
    join(temporary, 'node_modules'),
    'junction',
  );
  const result = spawnSync(
    process.execPath,
    [
      join(mobile, 'node_modules/expo/bin/cli'),
      'prebuild',
      temporary,
      '--template',
      'expo-template-bare-minimum@58.0.30',
      '--no-install',
      '--platform',
      'all',
      '--skip-dependency-update',
      'react,react-native,expo',
    ],
    {
      cwd: temporary,
      env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
      stdio: 'inherit',
      timeout: 180000,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Expo native prebuild failed');
  const manifest = await readFile(
    join(temporary, 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
  );
  const gradle = await readFile(
    join(temporary, 'android/app/build.gradle'),
    'utf8',
  );
  assert.match(gradle, /applicationId\s+["']com\.vegappf\.mobile\.preview["']/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  // tools:node="remove" entries are intentional exclusions, not grants.
  for (const permission of [
    'RECORD_AUDIO',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
  ]) {
    for (const tag of manifest.matchAll(/<uses-permission\b[^>]*>/g))
      if (tag[0].includes(`android.permission.${permission}`))
        assert.match(tag[0], /tools:node="remove"/);
  }
  assert.match(
    manifest,
    /android:fullBackupContent="@xml\/secure_store_backup_rules"/,
  );
  assert.match(
    manifest,
    /android:dataExtractionRules="@xml\/secure_store_data_extraction_rules"/,
  );
  const plist = await readFile(join(temporary, 'ios/VEGA/Info.plist'), 'utf8');
  const project = await readFile(
    join(temporary, 'ios/VEGA.xcodeproj/project.pbxproj'),
    'utf8',
  );
  const identifiers = [
    ...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g),
  ].map((match) => match[1].replaceAll('"', '').trim());
  assert.ok(
    identifiers.length >= 2,
    'Both iOS build configurations need an identifier',
  );
  assert.ok(
    identifiers.every((value) => value === 'com.vegappf.mobile.preview'),
  );
  assert.match(plist, /<key>NSAllowsArbitraryLoads<\/key>\s*<false\s*\/>/);
  assert.doesNotMatch(
    plist,
    /NSCameraUsageDescription|NSMicrophoneUsageDescription|NSLocationWhenInUseUsageDescription|NSFaceIDUsageDescription/,
  );
  console.log(
    'Проекты iOS/Android сгенерированы; идентификаторы, TLS и разрешения проверены.',
  );
  console.log('APK/IPA не компилировались, запуск на устройстве не проверен.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
