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
 * Attempt to scrape live Amazon pricing directly from mobile phone
 */
async function fetchAmazonPricing(asin) {
  if (!asin) return null;
  try {
    const res = await axios.get(`https://www.amazon.com/dp/${asin}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 3800
    });

    const html = res.data;
    if (typeof html !== 'string') return null;

    let usedMin = null;
    let buyBox = null;

    // Pattern 1: aria-label="Other Used and New from $X.XX" or "Used from $X.XX"
    const usedRegex = /(?:Used|used)\s+(?:and\s+New\s+)?from\s*\$([0-9]+\.[0-9]{2})/i;
    const usedMatch = html.match(usedRegex);
    if (usedMatch && usedMatch[1]) {
      usedMin = parseFloat(usedMatch[1]);
    }

    // Pattern 2: Core buybox price
    const bbRegex = /class="a-price-whole">([0-9,]+)<span class="a-price-fraction">([0-9]{2})<\/span>/;
    const bbMatch = html.match(bbRegex);
    if (bbMatch && bbMatch[1] && bbMatch[2]) {
      buyBox = parseFloat(bbMatch[1].replace(/,/g, '') + '.' + bbMatch[2]);
    }

    // Pattern 3: Accordion rows
    if (!usedMin) {
      const accordion = html.match(/id="usedAccordionRow"[\s\S]*?\$([0-9]+\.[0-9]{2})/i);
      if (accordion && accordion[1]) {
        usedMin = parseFloat(accordion[1]);
      }
    }

    // Pattern 4: Fallback to all prices
    if (!usedMin && buyBox) {
      usedMin = buyBox;
    }

    return { usedMin, buyBox };
  } catch (err) {
    // Network or captcha fallback - returns null smoothly
    return null;
  }
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
        timeout: 3500
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
          timeout: 3000
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
        timeout: 3500
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
    // 2. Fetch metadata & live pricing concurrently directly from phone
    const isBook = barcode.startsWith('978') || barcode.startsWith('979') || barcode.length === 10;
    const computedAsin = isBook ? (barcode.length === 13 ? isbn13to10(barcode) : barcode) : barcode;

    const [meta, pricing] = await Promise.all([
      fetchMetadataOnDevice(barcode),
      fetchAmazonPricing(computedAsin)
    ]);

    // 3. Evaluate restrictions on-device
    const restriction = evaluateRestrictions({
      title: meta.title,
      publisher: meta.publisher,
      brand: meta.publisher,
      category: meta.category
    });

    const asinOrQuery = meta.asin || computedAsin || barcode;
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
      usedMin: pricing?.usedMin || null,
      usedBuyBox: pricing?.buyBox || null,
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
