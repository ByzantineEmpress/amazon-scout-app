const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Signs release builds with a real release keystore instead of the debug keystore.
 *
 * Why this plugin exists: the Android template that `expo prebuild` generates ships
 *
 *     buildTypes {
 *         debug   { signingConfig signingConfigs.debug }
 *         release { signingConfig signingConfigs.debug }   // <-- the problem
 *     }
 *
 * with a comment telling you to supply your own keystore. If you don't override that
 * line, Gradle signs the release APK with `debug.keystore` — the well-known key that
 * ships inside the template, whose alias and password are public. Anybody could then
 * build an APK that Android accepts as an update to this app.
 *
 * Credentials are read from Gradle properties (supplied in CI via
 * ~/.gradle/gradle.properties, never committed):
 *
 *     AMAZONSCOUT_STORE_FILE / AMAZONSCOUT_STORE_PASSWORD
 *     AMAZONSCOUT_KEY_ALIAS  / AMAZONSCOUT_KEY_PASSWORD
 *
 * The `if (project.hasProperty(...))` guard keeps debug builds working on machines
 * that have no signing properties configured. A release build without them produces
 * an unsigned APK, so CI fails early if the secrets are missing, and the workflow
 * verifies the built APK's certificate before publishing.
 */

const RELEASE_SIGNING_BLOCK = `        release {
            if (project.hasProperty("AMAZONSCOUT_STORE_FILE")) {
                storeFile file(AMAZONSCOUT_STORE_FILE)
                storePassword AMAZONSCOUT_STORE_PASSWORD
                keyAlias AMAZONSCOUT_KEY_ALIAS
                keyPassword AMAZONSCOUT_KEY_PASSWORD
            }
        }
`;

/** The release buildType still pointing at the debug key is the failure we exist to prevent. */
function releaseUsesDebugKey(buildGradle) {
  return /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]{0,600}?signingConfig\s+signingConfigs\.debug/.test(buildGradle);
}

/**
 * Pure text transform, exported so it can be unit tested without running prebuild.
 * @param {string} buildGradle contents of android/app/build.gradle
 * @returns {string} patched contents
 */
function applyReleaseSigning(buildGradle) {
  // Already handled by us, or a future template that signs release properly on its own.
  if (
    buildGradle.includes('AMAZONSCOUT_STORE_FILE') ||
    /signingConfig\s+signingConfigs\.release/.test(buildGradle)
  ) {
    return buildGradle;
  }

  // 1. Declare the release signingConfig inside the existing signingConfigs block.
  let next = buildGradle.replace(/signingConfigs\s*\{/, (match) => `${match}\n${RELEASE_SIGNING_BLOCK}`);

  // 2. Repoint ONLY the release buildType. A naive /buildTypes\s*\{\s*release\s*\{/
  //    does not match this template, because `debug {` sits in between — that is
  //    exactly the bug that shipped debug-signed releases.
  next = next.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{)([\s\S]*?)(\n\s*\})/,
    (whole, head, body, tail) => {
      const patchedBody = body.replace(
        /signingConfig\s+signingConfigs\.debug/,
        'signingConfig signingConfigs.release'
      );
      return patchedBody === body ? whole : head + patchedBody + tail;
    }
  );

  if (releaseUsesDebugKey(next)) {
    throw new Error(
      'withReleaseSigning: failed to override the release signingConfig — the release build ' +
        'would be signed with the public debug keystore. Refusing to continue. Check whether ' +
        'the Android template in this Expo SDK changed its build.gradle structure.'
    );
  }

  if (!next.includes('signingConfig signingConfigs.release')) {
    throw new Error(
      'withReleaseSigning: could not find a release buildType to reconfigure. ' +
        'Check whether the Android template in this Expo SDK changed its build.gradle structure.'
    );
  }

  return next;
}

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy build.gradle.');
    }
    cfg.modResults.contents = applyReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
module.exports.releaseUsesDebugKey = releaseUsesDebugKey;
