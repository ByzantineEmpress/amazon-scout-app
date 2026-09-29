# Amazon Scout — client (Expo / React Native)

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json` (currently **57**).
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v57.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## What this app actually is

One screen. `index.js` calls `registerRootComponent(App)`, and `App.js` renders the camera viewfinder plus every modal. There is **no navigation library**: no `expo-router`, no `react-navigation`, no `src/app/` directory. Screens are `useState` booleans that toggle `<Modal visible={...}>`.

Do not introduce a router, a `src/app/` tree, or `_layout.tsx` files unless the task explicitly asks for that migration — it would be a rewrite of working, released code.

```
index.js                  → registerRootComponent(App)
App.js                    → camera UI, scan loop, modal state
src/components/*Modal.js  → ScanResult, Settings, History, OfflineQueue, ManualEntry
src/services/             → all non-UI logic (see Data flow)
plugins/                  → Expo config plugins (native config, applied at prebuild)
```

Plain JavaScript only — there is no TypeScript in this project.

## Commands

Run these from `client/` unless noted.

```bash
npx expo install <package>   # ALWAYS use instead of npm/yarn/pnpm add — resolves SDK-compatible versions
npx expo start               # dev server (root: npm start)
npx expo-doctor              # diagnose dependency and config issues
npx expo install --fix       # fix incompatible package versions
npm test                     # from the REPO ROOT — runs every test in client/test/
npx expo prebuild --platform android   # generate android/ (CI does this; never hand-edit it)
```

There is no ESLint config and no TypeScript config checked in, so `npx expo lint` would scaffold ESLint on first run and `npx tsc --noEmit` has nothing to check. Before declaring a task done, run `npm test` from the repo root and `npx expo-doctor`; if your change touches a component, verify it in Expo Go on a device.

## Data flow

Everything runs on-device. There is **no backend and no server component** — the app talks directly to third-party keyless HTTP endpoints.

```
App.js
  └─ scanBarcode()                 src/services/api.js      ← the only entry point UI uses
       └─ processBarcodeScanOnDevice()  src/services/barcodeService.js
            ├─ scrapeAmazonSearch()   amazon.ca / amazon.com search HTML (regex-parsed)
            ├─ fetchOpenLibrary()     openlibrary.org
            ├─ fetchAppleBooks()      itunes.apple.com
            ├─ fetchUPCItemdb()       api.upcitemdb.com (non-book media)
            ├─ fetchAbeBooksPrice()   abebooks.com (used-book pricing)
            └─ evaluateRestrictions()  src/services/gatingRules.js  ← pure, local, offline
       └─ storage.js              AsyncStorage: settings, history (100 max), offline queue
```

Two things to respect when editing this:

- **`scrapeAmazonSearch` parses raw Amazon HTML.** It is inherently brittle: a markup change, a CAPTCHA, or a 429 makes it return `null`. Callers treat `null` as "no data" and fall back to the other sources, so failures degrade quietly instead of throwing. Preserve that tolerance, and never let a scrape failure crash a scan.
- **`evaluateRestrictions` is a local heuristic, not an Amazon answer.** It infers a verdict from publisher/studio/brand keywords, an ISBN-prefix table, and a "DVD MSRP ≥ $25" rule. Real gating is account-, category-, and condition-specific, so a `HARD_GATED` verdict is a warning to verify in Seller Central — treat the wording as advisory, never as authoritative.

`gatingRules.js` must stay dependency-free (no `import` statements): `test/gatingRules.test.mjs` loads it by reading the source and stripping `export` keywords, which only works while the module is self-contained.

## Building with EAS

Use EAS to build, sign, and submit in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. This is not a Bun project (no `bun.lock`), so run the CLI as `npx eas-cli@latest <command>`; substitute that for bare `eas` in docs examples.

`eas.json` defines `development` (dev client), `preview` (internal distribution, Android APK), and `production`. The npm scripts `build:android` / `build:ios` both use the `preview` profile.

Android APKs for end users are produced by `.github/workflows/release-apk.yml` on a `v*` tag push: it runs `expo prebuild`, signs with the release keystore from repository secrets, verifies the APK's certificate, and publishes to GitHub Releases. Version bumps for a release go in `app.json` (`expo.version`) and `package.json`, and the tag must be `v` + that exact version — the workflow fails the release when they disagree, because the in-app update checker compares the two and a mismatch produces an update that never clears. Each release also needs `release-notes/v<version>.md`; the workflow fails *before* building if it is missing, and the app renders the first three lines of it in its update card, so write it for a user rather than as a changelog. To exercise the whole signing path without publishing anything, dispatch that workflow manually with the **dry_run** input enabled — it builds, signs and verifies, then stops before the release step (the tag/version and notes checks are skipped on dry runs, so any tag works there). Use `npm run release -- <version>` from the repo root to do all of that in one step: it bumps both version files, scaffolds and opens the notes file, runs the tests, then commits, tags and pushes. `--dry-run` does every local step without touching git history.

**Never let a release be signed with `debug.keystore`.** The Expo Android template signs the release buildType with the debug keystore by default; that key is public, so anyone could forge an APK that Android accepts as an update to this app. `plugins/withReleaseSigning.js` repoints it at a real keystore (credentials come from Gradle properties, never committed), and both `test/releaseSigning.test.mjs` and a workflow step fail loudly if it ever regresses.

Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins. Existing examples: `plugins/withAndroidQueries.js` (package queries that let the app launch the Amazon Seller and eBay Android apps) and `plugins/withReleaseSigning.js` (release APK signing).
- Native permissions live in `app.json` (`expo.ios.infoPlist.NSCameraUsageDescription`, `expo.android.permissions`). Add new permissions there, not in generated native files.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
- Default marketplace is `'CA'` (Amazon.ca, CAD). Any new pricing or URL logic must handle both `'CA'` and `'US'` — the existing helpers take `marketplace` as a parameter for that reason.
