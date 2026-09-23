import axios from 'axios';
import { evaluateRestrictions } from './gatingRules';
import { addToOfflineQueue } from './storage';

// In-memory cache for ultra-fast repeat lookups (0ms latency on phone)
const localCache = new Map();

/**
 * Convert an ISBN-10 to ISBN-13
 */
export function isbn10to13(isbn10) {
  const clean = isbn10.replace(/[^0-9X]/gi, '');
  if (clean.length !== 10) return isbn10;
  const base = '978' + clean.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

/**
 * Convert an ISBN-13 to ISBN-10 (Amazon ASIN for physical books)
 */
export function isbn13to10(isbn13) {
  const clean = isbn13.replace(/[^0-9]/g, '');
  if (clean.length !== 13 || !clean.startsWith('978')) return null;
  const base = clean.substring(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(base[i], 10) * (10 - i);
  }
  const remainder = (11 - (sum % 11)) % 11;
  const check = remainder === 10 ? 'X' : remainder.toString();
  return base + check;
}

/**
 * Normalize barcode
 */
export function normalizeBarcode(raw) {
  if (!raw) return '';
  return raw.replace(/[^0-9X]/gi, '').toUpperCase();
}

/**
 * Fetch book/media metadata directly from phone
 */
async function fetchMetadataOnDevice(barcode) {
  const cleanBarcode = normalizeBarcode(barcode);
  const isBook = cleanBarcode.startsWith('978') || cleanBarcode.startsWith('979') || cleanBarcode.length === 10;

  let title = 'Unknown Item';
  let publisher = '';
  let author = '';
  let category = isBook ? 'Books' : 'Media / General';
  let asin = isBook ? (cleanBarcode.length === 13 ? isbn13to10(cleanBarcode) : cleanBarcode) : cleanBarcode;
  let year = '';

  if (isBook) {
    const isbnQuery = cleanBarcode.length === 10 ? isbn10to13(cleanBarcode) : cleanBarcode;
    try {
      // 1. Try OpenLibrary Edition endpoint (fast, free, no keys needed)
      const olRes = await axios.get(`https://openlibrary.org/isbn/${isbnQuery}.json`, {
        headers: { 'User-Agent': 'AmazonScoutApp/1.0 (reseller-assistant)' },
        timeout: 4000
      });
      if (olRes.data) {
        title = olRes.data.title || title;
        if (olRes.data.publishers && olRes.data.publishers.length > 0) {
          publisher = olRes.data.publishers[0];
        }
        if (olRes.data.publish_date) {
          year = olRes.data.publish_date;
        }
      }
    } catch (olErr) {
      // 2. Fallback to Google Books
      try {
        const gbRes = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanBarcode}`, {
          timeout: 3500
        });
        if (gbRes.data && gbRes.data.items && gbRes.data.items.length > 0) {
          const info = gbRes.data.items[0].volumeInfo;
          title = info.title || title;
          publisher = info.publisher || publisher;
          author = info.authors ? info.authors.join(', ') : '';
          year = info.publishedDate ? info.publishedDate.substring(0, 4) : year;
          if (info.categories && info.categories.length > 0) {
            category = info.categories[0];
          }
        }
      } catch (gbErr) {
        // Fallback gracefully
      }
    }
  } else {
    // UPC / EAN media lookup
    try {
      const upcRes = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanBarcode}`, {
        timeout: 4000
      });
      if (upcRes.data && upcRes.data.items && upcRes.data.items.length > 0) {
        const item = upcRes.data.items[0];
        title = item.title || title;
        publisher = item.brand || item.publisher || '';
        category = item.category || category;
      }
    } catch (upcErr) {
      // Graceful fallback
    }
  }

  return {
    barcode: cleanBarcode,
    asin: asin || cleanBarcode,
    title,
    publisher,
    author,
    category,
    year
  };
}

/**
 * Main On-Device Scan Resolution
 * Completely serverless - executes 100% on phone
 */
export async function processBarcodeScanOnDevice(rawBarcode) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    throw new Error('Invalid barcode provided');
  }

  // 1. Check local cache (0ms instant return)
  if (localCache.has(barcode)) {
    return { ...localCache.get(barcode), cached: true };
  }

  try {
    // 2. Fetch metadata directly from phone
    const meta = await fetchMetadataOnDevice(barcode);

    // 3. Evaluate restrictions on-device
    const restriction = evaluateRestrictions({
      title: meta.title,
      publisher: meta.publisher,
      brand: meta.publisher,
      category: meta.category
    });

    const asinOrQuery = meta.asin || barcode;
    const sellerCentralUrl = `https://sellercentral.amazon.com/productsearch?q=${asinOrQuery}`;
    const amazonProductUrl = `https://www.amazon.com/dp/${asinOrQuery}`;

    const response = {
      barcode,
      asin: asinOrQuery,
      title: meta.title,
      publisher: meta.publisher,
      author: meta.author,
      category: meta.category,
      year: meta.year,
      status: restriction.status,
      badge: restriction.badge,
      badgeColor: restriction.badgeColor,
      reason: restriction.reason,
      canSell: restriction.canSell,
      requiresInvoices: restriction.requiresInvoices,
      matchedName: restriction.matchedName || null,
      usedMin: null,
      usedBuyBox: null,
      usedOffers: null,
      sellerCentralUrl,
      amazonProductUrl,
      timestamp: Date.now()
    };

    localCache.set(barcode, response);
    return response;
  } catch (err) {
    console.warn(`On-device scan error for ${barcode}:`, err.message);

    // Save to offline queue if network timed out
    await addToOfflineQueue(barcode);

    return {
      barcode,
      asin: barcode,
      title: 'Item Queued Offline (No Cell Signal)',
      status: 'OFFLINE_QUEUED',
      badge: 'OFFLINE QUEUED',
      badgeColor: '#718096',
      reason: 'Network timed out in store. Barcode saved to Offline Queue.',
      canSell: null,
      requiresInvoices: false,
      sellerCentralUrl: `https://sellercentral.amazon.com/productsearch?q=${barcode}`,
      amazonProductUrl: `https://www.amazon.com/dp/${barcode}`,
      timestamp: Date.now()
    };
  }
}
