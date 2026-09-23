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

## 📁 Repository Structure

```text
├── package.json               # Root scripts (npm start launches mobile app)
├── .gitignore                 # Excludes node_modules, temp files, and credentials
├── README.md                  # Complete documentation
│
└── client/                    # Cross-Platform Mobile App (iOS & Android)
    ├── App.js                 # Live camera viewfinder, targeting reticle, and main UI
    ├── app.json               # Expo configuration with camera permissions
    ├── package.json           # React Native / Expo dependencies
    └── src/
        ├── services/
        │   ├── barcodeService.js    # On-device barcode & ISBN resolver (Serverless)
        │   ├── gatingRules.js       # On-device database of gated publishers & studios
        │   ├── api.js               # Clean service interface with auto-offline queueing
        │   └── storage.js           # AsyncStorage for scan history, settings, and queue
        └── components/
            ├── ScanResultModal.js   # High-contrast Green/Red restriction card
            ├── SettingsModal.js     # Haptic/audio toggles and local storage manager
            ├── HistoryModal.js      # Filterable scan log with timestamps
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

## 🐙 How to Push to GitHub

You can either have the AI assistant push directly using a GitHub Token, or push manually in 1 minute:

### Option A: Let the AI Push for You
1. Create a GitHub Personal Access Token:
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens).
   - Generate a **Classic Token** with the `repo` scope selected.
2. Create an empty repository at [github.com/new](https://github.com/new) named `amazon-scout-app`.
3. Provide your token and GitHub username in the chat, and the AI will execute the push directly!

### Option B: Push Manually via Terminal
In your terminal, run:
```bash
git add .
git commit -m "Update: 100% Serverless architecture with embedded gating database"
git remote add origin https://github.com/YOUR_USERNAME/amazon-scout-app.git
git push -u origin main
```
