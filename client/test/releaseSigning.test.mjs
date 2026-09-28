/**
 * Tests for plugins/withReleaseSigning.js.
 *
 * This plugin exists because the Android template that `expo prebuild` generates signs
 * the *release* build with `signingConfigs.debug` — the public keystore that ships in
 * the template. Shipping that means anyone can sign an APK that Android accepts as an
 * update to this app, so the transform is worth pinning down with tests.
 *
 * Run from the repository root:  npm test
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyReleaseSigning, releaseUsesDebugKey } = require('../plugins/withReleaseSigning.js');

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function assertTrue(value, label) {
  if (value !== true) throw new Error(`${label}: expected true, got ${JSON.stringify(value)}`);
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to contain ${JSON.stringify(needle)}`);
  }
}

function assertThrows(fn, label) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label}: expected it to throw, but it returned`);
}

/** The signing block exactly as the Expo SDK 57 Android template writes it. */
const TEMPLATE = `android {
    namespace 'com.amazonscout.app'
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

console.log('\nwithReleaseSigning.js\n');

test('the unpatched template really is debug-signed (the bug being fixed)', () => {
  assertTrue(releaseUsesDebugKey(TEMPLATE), 'template detected as debug-signed');
});

test('release builds are repointed to a release keystore', () => {
  const patched = applyReleaseSigning(TEMPLATE);
  assertContains(patched, 'signingConfig signingConfigs.release', 'release buildType');
  if (releaseUsesDebugKey(patched)) {
    throw new Error('release buildType is still signed with the debug keystore');
  }
});

test('debug builds keep using the debug keystore', () => {
  const patched = applyReleaseSigning(TEMPLATE);
  assertContains(patched, 'signingConfig signingConfigs.debug', 'debug buildType preserved');
});

test('signing credentials come from gradle properties, never hardcoded', () => {
  const patched = applyReleaseSigning(TEMPLATE);
  for (const prop of [
    'AMAZONSCOUT_STORE_FILE',
    'AMAZONSCOUT_STORE_PASSWORD',
    'AMAZONSCOUT_KEY_ALIAS',
    'AMAZONSCOUT_KEY_PASSWORD'
  ]) {
    assertContains(patched, prop, `property ${prop}`);
  }

  // The debug block legitimately keeps the template's public credentials, so scope the
  // "no hardcoded secrets" check to the release block this plugin injects.
  const start = patched.indexOf('signingConfigs {');
  const end = patched.indexOf('debug {', start);
  if (start === -1 || end === -1) throw new Error('could not locate the injected release signing block');
  const releaseBlock = patched.slice(start, end);

  for (const secret of ['scoutpass123', "'android'", '"android"', 'androiddebugkey']) {
    if (releaseBlock.includes(secret)) {
      throw new Error(`release signing block leaked the credential ${JSON.stringify(secret)}`);
    }
  }
  if (patched.includes('scoutpass123')) {
    throw new Error('the old hardcoded keystore password is still present');
  }
});

test('the keystore type is explicit so Gradle cannot guess from the file name', () => {
  // The release keystore is PKCS#12; leaving storeType unset lets Gradle probe it as JKS.
  assertContains(applyReleaseSigning(TEMPLATE), 'storeType "PKCS12"', 'storeType');
});

test('the release keystore is only read when the properties exist', () => {
  // Otherwise every debug build on a machine without signing properties fails at
  // Gradle configuration time.
  const patched = applyReleaseSigning(TEMPLATE);
  assertContains(patched, 'if (project.hasProperty("AMAZONSCOUT_STORE_FILE"))', 'property guard');
});

test('applying the transform twice is a no-op', () => {
  const once = applyReleaseSigning(TEMPLATE);
  const twice = applyReleaseSigning(once);
  if (once !== twice) throw new Error('transform is not idempotent');
});

test('a template that already signs release correctly is left alone', () => {
  const alreadyCorrect = TEMPLATE.replace(
    'signingConfig signingConfigs.debug\n            def enableShrinkResources',
    'signingConfig signingConfigs.release\n            def enableShrinkResources'
  );
  if (applyReleaseSigning(alreadyCorrect) !== alreadyCorrect) {
    throw new Error('a correct template should be returned unchanged');
  }
});

test('it refuses to continue when the release block cannot be found', () => {
  // A future Expo template could restructure build.gradle. Failing loudly is the
  // point: a silent no-op would publish debug-signed APKs again.
  const unrecognised = TEMPLATE.replace('signingConfig signingConfigs.debug\n            def enableShrinkResources', 'def enableShrinkResources');
  assertThrows(() => applyReleaseSigning(unrecognised), 'unrecognised template');
});

console.log('');
if (failures.length === 0) {
  console.log(`✅ ${passed} passed\n`);
} else {
  console.log(`❌ ${failures.length} failed, ${passed} passed\n`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log('');
  process.exitCode = 1;
}
