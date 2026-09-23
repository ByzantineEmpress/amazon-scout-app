# ⚡ Amazon Scout: High-Speed Reseller Barcode & Restriction Scanner

A lightweight, lightning-fast mobile application (**iOS & Android**) and proxy backend built specifically for Amazon resellers who source **Books, DVDs, Blu-rays, and Video Games** in thrift stores, library sales, estate sales, and clearance aisles.

---

## 🎯 The Problems This Solves

1. **Slow, bloated barcode scanning**: The official Amazon Seller app scanner tries to load multi-megabyte product pages, reviews, and high-res cover art. In metal-roofed thrift stores or store basements with 1 bar of LTE, it freezes or fails. **Amazon Scout** uses on-device camera barcode recognition and transfers **less than 300 bytes of clean JSON**, loading in ~150ms even on weak 3G.
2. **Hidden publisher and studio restrictions**: The Amazon Seller app only displays a generic "Apply to Sell" button. It does not warn you that academic publishers (e.g. Pearson, McGraw-Hill, Wiley) require **10-unit wholesale distributor invoices** until *after* you've bought the book. **Amazon Scout** immediately warns you with a prominent red badge: 🔴 **HARD GATED: Publisher Invoices Required (Do Not Buy)**.
3. **No cell service in thrift store basements**: When cell service drops completely, the app automatically saves scans to an **Offline Queue**, allowing you to keep scanning without interruption and batch-sync everything with one tap once you step outside.

---

## 🚀 Key Features

* **Instant Camera Recognition**: Powered by Google ML Kit at 60 FPS. Detects standard barcodes (UPC-A, EAN-13, ISBN-10, ISBN-13, Code 39) in under 30 milliseconds.
* **Hard-Gated Publisher & Studio Intelligence**:
  * **Academic Textbooks**: Built-in rules for Pearson, McGraw-Hill, Cengage, Wiley, Elsevier, Oxford UP, Cambridge UP, Macmillan, Norton, Wolters Kluwer, Springer, and F.A. Davis.
  * **DVDs & Movies**: Flags major restricted studios (Walt Disney, Warner Bros, Sony Pictures, Paramount, Universal, HBO, 20th Century Fox) and the Amazon \$25+ MSRP DVD restriction threshold.
  * **Video Games**: Flags first-party gated brands (Nintendo Switch/Pokemon, PlayStation, Xbox).
* **Dual Operational Modes**:
  * **Tier 1 (Default / Individual Seller Account)**: 100% free, no Amazon developer keys needed. Resolves book/media metadata via open catalog APIs and applies our restriction database.
  * **Tier 2 (Pro Seller Account / SP-API Live)**: Ready for when you upgrade to an Amazon Professional account. Directly calls Amazon's `getListingsRestrictions` and `getItemOffers` APIs.
* **1-Tap Seller Central Link**: Jump directly into your Amazon Seller Central listing search for the exact ASIN with a single tap.
* **Offline Batch Queue**: Never lose a scan in a dead zone.
* **Zero-Glance Audio & Haptic Feedback**: Vibrates and chimes based on whether an item is safe or restricted.

---

## 📁 Repository Structure

```text
├── package.json               # Root scripts to launch server and client together
├── .gitignore                 # Excludes node_modules, temp files, and credentials
├── README.md                  # Complete documentation
│
├── server/                    # Lightweight Node.js Proxy & Rules Engine
│   ├── server.js              # Express API with single-scan and batch-scan endpoints
│   ├── gatingRules.js         # Curated database of gated publishers, studios, and brands
│   ├── barcodeService.js      # Barcode/ISBN normalization, caching, and open resolution
│   ├── amazonSpApi.js         # Official Amazon SP-API connector (Tier 2 ready)
│   ├── test-scan.js           # Verification test suite for barcodes and gating
│   ├── package.json           # Server dependencies (Express, Axios, Cors, Dotenv)
│   └── .env.example           # Template for optional SP-API credentials
│
└── client/                    # Cross-Platform Mobile App (iOS & Android)
    ├── App.js                 # Live camera viewfinder, targeting reticle, and main UI
    ├── app.json               # Expo configuration with camera permissions
    ├── package.json           # React Native / Expo dependencies
    └── src/
        ├── services/
        │   ├── api.js         # Low-latency scan client with auto-offline queueing
        │   └── storage.js     # AsyncStorage for scan history, settings, and queue
        └── components/
            ├── ScanResultModal.js   # High-contrast Green/Red restriction card
            ├── SettingsModal.js     # Server URL config and latency tester
            ├── HistoryModal.js      # Filterable scan log with timestamps
            └── OfflineQueueModal.js # Batch queue management and 1-tap sync
```

---

## 🛠️ Step-by-Step Quick Start

### Prerequisites
* **Node.js** (v18 or newer installed)
* **iPhone or Android Phone** with the free **Expo Go** app installed:
  * [Expo Go for iOS (App Store)](https://apps.apple.com/app/expo-go/id982107779)
  * [Expo Go for Android (Google Play)](https://play.google.com/store/apps/details?id=host.exp.exponent)

---

### Step 1: Start the Backend Server

Open a terminal in the project root:

```bash
npm run server
```

You should see:
```text
===================================================
⚡ Amazon Scout Server running on port 3000
📡 Operational Mode: TIER 1 (Open Metadata & Gating Rules Engine)
===================================================
```

*(To test the server logic with sample books, run `npm run test` in a separate terminal).*

---

### Step 2: Start the Mobile Client

In a second terminal, run:

```bash
npm run client
```

A large **QR code** will appear directly in your terminal.

---

### Step 3: Open on Your Phone

1. Ensure your phone is connected to the **same Wi-Fi network** as your computer.
2. **iPhone**: Open the default Camera app, point it at the terminal QR code, and tap the notification banner to launch in **Expo Go**.
3. **Android**: Open the **Expo Go** app, tap **Scan QR Code**, and point it at the terminal QR code.
4. The app will bundle in a few seconds and the camera scanner will open!

---

### Step 4: Connect the Mobile App to Your Server

Because `localhost` refers to the phone itself, the phone needs your computer's local Wi-Fi IP address:

1. On your Windows computer, open a command prompt and type:
   ```bash
   ipconfig
   ```
   Find your **IPv4 Address** (e.g., `192.168.1.15`).
2. In the Amazon Scout mobile app, tap the **Settings gear (⚙️)** in the top right.
3. In the **Backend Server URL** field, enter:
   ```text
   http://192.168.1.15:3000
   ```
   *(replace `192.168.1.15` with your actual IPv4 address).*
4. Tap **Test Server Connection**. Once it says `Connected`, tap **Save Settings**.
5. You're ready to scan!

---

## ☁️ Deploying the Backend to the Cloud (For Sourcing on Cellular Data)

When you are out sourcing at thrift stores, your phone won't be on your home Wi-Fi. You can deploy the backend to a free/cheap cloud hosting platform like **Render** or **Railway** so the app works anywhere on LTE/5G.

### Free Deployment via Render.com:
1. Push this project to GitHub (see GitHub instructions below).
2. Go to [Render.com](https://render.com) and create a free account.
3. Click **New +** $\rightarrow$ **Web Service**.
4. Connect your GitHub repository.
5. Configure the service:
   * **Root Directory**: `server`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Environment**: `Node`
6. Click **Deploy Web Service**.
7. Render will provide a free HTTPS URL (e.g. `https://amazon-scout-api.onrender.com`).
8. Paste that URL into the app's **Settings (⚙️)** menu on your phone. Now you can scan from anywhere in the world!

---

## 🔒 Upgrading to Tier 2: Amazon SP-API (When You Upgrade to Pro)

Amazon's official Selling Partner API requires an Amazon **Professional Selling Account** (\$39.99/mo). When you sell over 40 items a month, the Professional account pays for itself by eliminating Amazon's \$0.99 per-item fee.

Once you have a Professional account:
1. Register a private developer application in [Amazon Seller Central](https://sellercentral.amazon.com/sellingpartner/developerconsole).
2. In `server/`, copy `.env.example` to `.env`:
   ```bash
   cp server/.env.example server/.env
   ```
3. Fill in your credentials:
   ```env
   SP_API_LWA_CLIENT_ID=your_client_id
   SP_API_LWA_CLIENT_SECRET=your_client_secret
   SP_API_REFRESH_TOKEN=your_refresh_token
   SP_API_SELLER_ID=your_seller_id
   SP_API_MARKETPLACE_ID=ATVPDKIKX0DER
   ```
4. Restart the server. The server will detect the keys and automatically switch to **TIER 2 (Pro SP-API Live)** mode, querying Amazon directly for live Used prices, exact BSR, and your account's specific restriction status.

---

## 🐙 How to Push This Project to GitHub

To ensure you never lose this code, follow these steps to push it to your GitHub account:

### 1. Configure Your Git Identity (If Not Done Yet)
In your terminal, run:
```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

### 2. Create a New Repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Name the repository: `amazon-scout-app`.
3. Choose **Private** (recommended) or Public.
4. **Do NOT** check "Initialize this repository with a README" (we already created one).
5. Click **Create repository**.

### 3. Link and Push
In your terminal in `c:\Users\Kyra\Documents\Amazon App`, run:

```bash
git add .
git commit -m "Initial commit: High-speed Amazon scouting mobile app and restriction engine"
git remote add origin https://github.com/YOUR_USERNAME/amazon-scout-app.git
git branch -M main
git push -u origin main
```
*(Replace `YOUR_USERNAME` with your actual GitHub username).*

---

## 📱 Standalone APK / iOS App Generation (Optional)

If you eventually want to create standalone `.apk` or `.ipa` app files rather than opening through Expo Go:
1. Install the EAS CLI: `npm install -g eas-cli`
2. Run: `eas login`
3. Configure the build: `eas build:configure`
4. Build for Android: `eas build -p android --profile preview` (produces a downloadable `.apk` file that installs directly on Android phones).
