# ⚡ Amazon Scout: 100% Serverless Reseller Barcode & Restriction Scanner

A lightweight, lightning-fast mobile application (**iOS & Android**) built specifically for Amazon resellers who source **Books, DVDs, Blu-rays, and Video Games** in thrift stores, library sales, estate sales, and clearance aisles.

**100% Serverless & Free**: Everything runs **directly on your phone**. There is **no backend server to run or maintain**, and **zero monthly hosting fees ($0.00)**.

---

## 🎯 The Problems This Solves

1. **Slow, bloated barcode scanning**: The official Amazon Seller app scanner tries to load multi-megabyte product pages, reviews, and high-res cover art. In metal-roofed thrift stores or store basements with 1 bar of LTE, it freezes or fails. **Amazon Scout** uses on-device Google ML Kit camera barcode recognition and on-device metadata lookups that load in milliseconds.
2. **Hidden publisher and studio restrictions**: The Amazon Seller app only displays a generic "Apply to Sell" button. It does not warn you that academic publishers (e.g. Pearson, McGraw-Hill, Wiley) require **10-unit wholesale distributor invoices** until *after* you've bought the book. **Amazon Scout** immediately warns you with a prominent red badge: 🔴 **HARD GATED: Publisher Invoices Required (Do Not Buy)**.
3. **No cell service in thrift store basements**: When cell service drops completely, the app automatically saves scans to an **Offline Queue**, allowing you to keep scanning without interruption and batch-sync everything with one tap once you step outside.

---

## 🚀 Key Features

* **100% On-Device & Zero Maintenance**: No servers to manage, no computer required to stay running, and no AWS/cloud bills.
* **Instant Camera Recognition**: Powered by Google ML Kit at 60 FPS. Detects standard barcodes (UPC-A, EAN-13, ISBN-10, ISBN-13, Code 39) in under 30 milliseconds.
* **Hard-Gated Publisher & Studio Intelligence**:
  * **Academic Textbooks**: Built-in rules for Pearson, McGraw-Hill, Cengage, Wiley, Elsevier, Oxford UP, Cambridge UP, Macmillan, Norton, Wolters Kluwer, Springer, and F.A. Davis.
  * **DVDs & Movies**: Flags major restricted studios (Walt Disney, Warner Bros, Sony Pictures, Paramount, Universal, HBO, 20th Century Fox) and the Amazon \$25+ MSRP DVD restriction threshold.
  * **Video Games**: Flags first-party gated brands (Nintendo Switch/Pokemon, PlayStation, Xbox).
* **1-Tap Seller Central Link**: Jump directly into your Amazon Seller Central listing search for the exact ASIN with a single tap.
* **Offline Batch Queue**: Never lose a scan in a dead zone.
* **Zero-Glance Audio & Haptic Feedback**: Vibrates and chimes based on whether an item is safe or restricted.

---

## 🔌 How It Gets Amazon Data (No API Keys, No Backend)

Amazon Scout does **not** integrate with any official Amazon API. There is no Product Advertising API, no Selling Partner API (SP-API), no affiliate tag, and no Amazon account credentials stored anywhere in the app. Instead, the phone reads Amazon search result pages directly and extracts the details it needs:

| Source | What it provides | Key required? |
| --- | --- | --- |
| `amazon.ca` / `amazon.com` search results | Title, ASIN, Buy Box, lowest used price | No |
| OpenLibrary | Title, author, publisher, year (books) | No |
| iTunes Search API | Title/author confirmation (ebooks) | No |
| UPCitemdb (trial) | Title & brand (DVDs, Blu-rays, games) | No |
| AbeBooks (Amazon-owned) | Used-book market price | No |
| eBay Sold/Completed | Comps — opened in the eBay app or browser | No |

For physical books the ISBN-13 is converted to its ISBN-10, because the ISBN-10 *is* the ASIN — so the app can look up the exact product instead of guessing from a keyword search. If Amazon.ca has no used price, it retries Amazon.com and estimates the CAD equivalent.

**One thing to understand about the restriction badges:** they are computed **locally** from the built-in publisher/studio/brand rules, ISBN-prefix tables, and the DVD MSRP threshold. The app never asks Amazon whether *your* account is gated. Real gating is specific to your account, the category, and the item's condition, so treat a 🔴 badge as a strong advisory warning, not a verdict — and always confirm with the **1-Tap Seller Central** button before buying.

Because this reads Amazon's pages rather than an API, it can break if Amazon changes its markup or serves a CAPTCHA. When that happens the app silently falls back to the other sources, so you may see a title without a price rather than an error.

---

## 📁 Repository Structure

There is **no `server/` directory and no backend of any kind** — every line of logic that runs ships inside the mobile app.

```text
├── package.json               # Root scripts (npm start launches mobile app, npm test runs unit tests)
├── .gitignore                 # Excludes node_modules, temp files, and credentials
├── README.md                  # Complete documentation
│
├── .github/workflows/
│   └── release-apk.yml        # Builds, signs & publishes the Android APK on a v* tag
│
└── client/                    # Cross-Platform Mobile App (iOS & Android)
    ├── index.js               # Entry point (registerRootComponent)
    ├── App.js                 # Live camera viewfinder, scan loop, and modal state
    ├── app.json               # Expo configuration with camera permissions
    ├── eas.json               # EAS build profiles (development / preview / production)
    ├── package.json           # React Native / Expo dependencies
    ├── plugins/
    │   ├── withAndroidQueries.js  # Lets the app open the Amazon Seller & eBay Android apps
    │   └── withReleaseSigning.js  # Signs release builds with a real keystore, not the debug key
    ├── test/
    │   ├── gatingRules.test.mjs       # Unit tests for the gating engine
    │   └── releaseSigning.test.mjs    # Guards the release signing config (npm test)
    └── src/
        ├── services/
        │   ├── barcodeService.js    # On-device barcode & ISBN resolver (Serverless)
        │   ├── gatingRules.js       # On-device database of gated publishers & studios
        │   ├── api.js               # Clean service interface with auto-offline queueing
        │   ├── storage.js           # AsyncStorage for scan history, settings, and queue
        │   ├── ebayService.js       # 1-tap eBay Sold/Completed comps lookup
        │   └── updateService.js     # In-app GitHub Releases update checker
        └── components/
            ├── ScanResultModal.js   # High-contrast Green/Red restriction card
            ├── SettingsModal.js     # Haptic/audio toggles and local storage manager
            ├── HistoryModal.js      # Filterable scan log with timestamps
            ├── ManualEntryModal.js  # Type an ISBN/UPC when a barcode won't scan
            └── OfflineQueueModal.js # Batch queue management and 1-tap sync
```

---

## 🛠️ Quick Start (Running on Your Phone in 60 Seconds)

### Prerequisites
* **Node.js** (v18 or newer installed on your computer)
* **iPhone or Android Phone** with the free **Expo Go** app installed:
  * [Expo Go for iOS (App Store)](https://apps.apple.com/app/expo-go/id982107779)
  * [Expo Go for Android (Google Play)](https://play.google.com/store/apps/details?id=host.exp.exponent)

---

### Step 1: Start the App

Open a terminal in `c:\Users\Kyra\Documents\Amazon App` and run:

```bash
npm start
```

A large **QR code** will appear directly in your terminal.

---

### Step 2: Open on Your Phone

1. **iPhone**: Open the default Camera app, point it at the terminal QR code, and tap the notification banner to open in **Expo Go**.
2. **Android**: Open the **Expo Go** app, tap **Scan QR Code**, and point it at the terminal QR code.
3. The app will bundle and open on your phone immediately!

*(You do NOT need to configure any server IP addresses — the app is 100% self-contained).*

---

## 📦 Installing as a Standalone App (Android APK & iOS)

You can run Amazon Scout either in development mode via **Expo Go** or build standalone installer packages.

---

### 🤖 Android: Standalone APK (.apk) via GitHub Releases
Android allows direct installation (sideloading) of standalone `.apk` files without paying for a Google Play Developer account ($0.00).

#### Method 1: Download Direct from GitHub Releases (Zero Setup)
1. Go to your repository's Releases page:  
   **[github.com/ByzantineEmpress/amazon-scout-app/releases/latest](https://github.com/ByzantineEmpress/amazon-scout-app/releases/latest)**
2. Download the attached **`AmazonScout-vX.X.X.apk`** file directly on your Android phone.
3. Tap the file to install (enable *"Allow from this source"* if prompted).
4. **Done!** Amazon Scout is now installed on your home screen.

#### In-App Updates:
Once installed, you never need to manually check GitHub again:
- Open Amazon Scout, tap **⚙️ Settings → Check for Updates**.
- The app checks GitHub Releases for new versions, shows what changed, and lets you install the update with 1 tap!

#### Method 2: Triggering a New APK Build

The quickest path does everything below — it bumps both version files, scaffolds the notes file, opens it in your editor, runs the tests, then commits, tags and pushes:
```bash
npm run release -- 1.0.9
```
Add `--dry-run` to rehearse the whole thing without touching git history. Or do it by hand:

1. **Bump the version** in `client/app.json` (`expo.version`) and `client/package.json` (`version`). The workflow fails the release if the tag and `app.json` disagree, because the in-app updater compares those two values.
2. **Write the release notes** in `release-notes/v<version>.md`. These are displayed inside the app on its *"update available"* card, so write them for a user — see [release-notes/README.md](release-notes/README.md). The build fails early if this file is missing.
3. **Commit and push.**
4. **Tag and push the tag:**
```bash
git tag v1.0.9
git push origin v1.0.9
```
GitHub Actions then builds the APK, signs it with your release keystore, verifies its certificate, and publishes the release.

---

#### ⚠️ Release signing

Every APK must be signed with the **same private key**, or Android refuses to install it as an update over an existing copy. This build deliberately fails rather than falling back to a throwaway key or to the public **Android debug keystore** — either would let a stranger publish an APK that your phone accepts as a genuine Amazon Scout update.

**The keystore exists and the four secrets are configured on this repository:**

| | |
| --- | --- |
| Keystore | `Documents\amazonscout-signing\amazonscout-release.p12` |
| Password file | `Documents\amazonscout-signing\keystore-password.txt` |
| Alias | `amazonscout` |
| Certificate SHA-256 | `4F:F8:44:AB:8A:E3:2E:13:E0:D1:68:38:FD:73:41:C9:32:49:74:4E:03:80:3A:37:61:1E:4A:91:11:B1:2A:99` |

> 🔐 **Back it up, then delete the working copies.** Move `amazonscout-release.p12` and `keystore-password.txt` into a password manager or onto an offline drive. **If the keystore is lost you can never update this app again** — you would have to publish under a new package name. It must never be committed: `.gitignore` covers `*.keystore`, `*.jks`, `*.p12`, `*.key` and `*.b64`.

Secrets live at *Settings → Secrets and variables → Actions*:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore, base64-encoded on a single line |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `amazonscout` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password) |

The workflow restores the keystore, and **fails the release if the finished APK is ever debug-signed**, so this cannot silently regress.

<details>
<summary>Recreating the keystore from scratch</summary>

It is a standard PKCS#12 store — the same container `keytool` has produced by default since Java 9 — so either tool works. With OpenSSL (no JDK needed), the alias comes from `-name`:

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 10000 -nodes \
  -keyout key.pem -out cert.pem \
  -subj "/CN=AmazonScout, O=AmazonScout, L=Toronto, ST=ON, C=CA" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature"
openssl pkcs12 -export -out amazonscout-release.p12 \
  -inkey key.pem -in cert.pem -name amazonscout
```

With a JDK installed, the equivalent is:

```bash
keytool -genkeypair -v -keystore amazonscout-release.p12 -storetype PKCS12 \
  -alias amazonscout -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=AmazonScout, O=AmazonScout, L=Toronto, ST=ON, C=CA"
```

Then base64 the `.p12` onto one line and update `ANDROID_KEYSTORE_BASE64` and the passwords.

</details>

**Validating signing without publishing:** run the *Build & Release Android APK* workflow manually with **dry_run** enabled. It generates the native project, restores the keystore, builds and signs the APK, and checks the certificate — but skips the release, so you can prove the pipeline works before cutting a real version.

> **Upgrading from an older release:** APKs published before this change were signed with the public Android debug keystore. The first release signed with your new key has a different signature, so Android will refuse to install it over an existing copy. Uninstall the old app once and install the new APK; in-app updates work normally from then on.

---

### 🍏 iOS: Installation Options
Unlike Android, Apple restricts direct APK-style sideloading. Here are the three ways to run Amazon Scout on your iPhone:

#### Option 1: Expo Go (Recommended — 100% Free & Immediate)
* Install **Expo Go** from the iOS App Store.
* Run `npm start` and scan the terminal QR code with your iPhone Camera.
* **Tip**: You can save a shortcut directly to your iPhone Home Screen via the iOS Shortcuts app or Expo Go bookmark so it launches with one tap.

#### Option 2: Standalone via TestFlight (Requires Apple Developer Account — \$99/yr)
* If you have an active Apple Developer Program membership:
  ```bash
  npm run build:ios
  ```
* EAS will build the `.ipa` and upload it directly to your Apple Developer TestFlight account.
* You and your spouse can then install the free **TestFlight** app from the App Store and install Amazon Scout directly with zero wires.

#### Option 3: Free Personal Sideloading (Using Sideloadly or AltStore — \$0.00)
* If you do not have an Apple Developer account, you can install the standalone app using your normal, free Apple ID:
  1. Build an iOS build with EAS: `npm run build:ios`
  2. Download **[Sideloadly](https://sideloadly.io/)** (free for Windows).
  3. Plug your iPhone into your Windows PC with a USB cable.
  4. Drag the downloaded `.ipa` file into Sideloadly, enter your standard Apple ID, and click **Start**.
  5. Sideloadly signs and installs the standalone app icon directly onto your iPhone! *(Note: Free personal Apple IDs require re-signing every 7 days).*

---

## 🐙 How to Push to GitHub

### Option A: Git Credential Manager (Recommended)

Never paste a token into a chat, a source file, or a repository URL. A token placed in a remote URL is written to `.git/config` in plaintext, and leaks the moment that folder is copied, zipped, or shared. GitHub's secret scanning also revokes tokens it finds in pushes.

1. Create a GitHub Personal Access Token at [github.com/settings/tokens](https://github.com/settings/tokens) — a **Classic Token** with the `repo` scope.
2. Push once and let Git Credential Manager store it in the Windows Credential Manager:
   ```bash
   git push origin main
   ```
   Enter the token as the password when prompted. It is then cached by the OS, and no secret lives in the project.
3. If a token was ever embedded in the remote URL, strip it and switch to the credential helper:
   ```bash
   git remote set-url origin https://github.com/ByzantineEmpress/amazon-scout-app.git
   ```
   Then **revoke that token** at [github.com/settings/tokens](https://github.com/settings/tokens) and generate a new one.

### Option B: Push Manually via Terminal
In your terminal, run:
```bash
git add .
git commit -m "Update: 100% Serverless architecture with embedded gating database"
git push origin main
```

