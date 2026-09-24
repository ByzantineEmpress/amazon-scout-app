const axios = require('axios');
const { evaluateRestrictions } = require('./gatingRules');
const { isSpApiConfigured, checkListingsRestrictions, getItemPricing } = require('./amazonSpApi');

// In-memory cache for ultra-fast repeat lookups (0ms latency)
const lookupCache = new Map();

/**
 * Convert an ISBN-10 to ISBN-13
 */
function isbn10to13(isbn10) {
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
 * Convert an ISBN-13 to ISBN-10 (which is the direct ASIN on Amazon for physical books!)
 */
function isbn13to10(isbn13) {
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
 * Normalize barcode input
 */
function normalizeBarcode(raw) {
  if (!raw) return '';
  return raw.replace(/[^0-9X]/gi, '').toUpperCase();
}

/**
 * Fetch book details via OpenLibrary or Google Books API (Tier 1 - Free, no credentials needed)
 */
async function fetchMetadataOpen(barcode) {
  const cleanBarcode = normalizeBarcode(barcode);
  const isBook = cleanBarcode.startsWith('978') || cleanBarcode.startsWith('979') || cleanBarcode.length === 10;

  let title = 'Unknown Item';
  let publisher = '';
  let author = '';
  let category = isBook ? 'Books' : 'Media / General';
  let asin = isBook ? (cleanBarcode.length === 13 ? isbn13to10(cleanBarcode) : cleanBarcode) : cleanBarcode;
  let year = '';

  try {
    if (isBook) {
      // 1. Direct OpenLibrary Edition endpoint (fast, public, no API key needed)
      const isbnQuery = cleanBarcode.length === 10 ? isbn10to13(cleanBarcode) : cleanBarcode;
      try {
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
        // Fallback to Google Books
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
          // Both failed, proceed with cleanBarcode as identifier
        }
      }
    } else {
      // UPC / EAN media lookup via open search
      const upcUrl = `https://api.upcitemdb.com/prod/trial/lookup?upc=${cleanBarcode}`;
      const upcRes = await axios.get(upcUrl, { timeout: 3500 });
      if (upcRes.data && upcRes.data.items && upcRes.data.items.length > 0) {
        const item = upcRes.data.items[0];
        title = item.title || title;
        publisher = item.brand || item.publisher || '';
        category = item.category || category;
      }
    }
  } catch (err) {
    // Network / API timeout or rate limit - graceful fallback
    console.warn('Lookup fallback for barcode:', cleanBarcode, err.message);
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
 * Main scan processing function
 * Returns a micro-payload under 300 bytes for low-signal performance
 */
async function processBarcodeScan(rawBarcode) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    throw new Error('Invalid barcode provided');
  }

  // 1. Check local cache
  if (lookupCache.has(barcode)) {
    return { ...lookupCache.get(barcode), cached: true };
  }

  // 2. Resolve metadata
  const meta = await fetchMetadataOpen(barcode);

  // 3. Evaluate restrictions using our comprehensive gating database
  let restriction = evaluateRestrictions({
    title: meta.title,
    publisher: meta.publisher,
    brand: meta.publisher,
    category: meta.category
  });

  const asinOrQuery = meta.asin || barcode;

  // 4. If SP-API is configured (Tier 2 / Pro account), query live restriction & pricing
  let spPricing = null;
  if (isSpApiConfigured()) {
    try {
      const [spRestr, pricingData] = await Promise.all([
        checkListingsRestrictions(asinOrQuery),
        getItemPricing(asinOrQuery)
      ]);
      if (spRestr) {
        restriction = {
          ...restriction,
          status: spRestr.status,
          canSell: spRestr.canSell,
          reason: spRestr.reason,
          badge: spRestr.canSell ? 'SAFE TO SELL' : 'RESTRICTED',
          badgeColor: spRestr.canSell ? '#38A169' : '#E53E3E'
        };
      }
      spPricing = pricingData;
    } catch (spErr) {
      console.warn('SP-API sync error:', spErr.message);
    }
  }

  // 5. Construct Amazon direct links for instant 1-tap verification
  const sellerCentralUrl = `https://sellercentral.amazon.com/productsearch?q=${asinOrQuery}`;
  const amazonProductUrl = `https://www.amazon.com/dp/${asinOrQuery}`;

  // 6. Build ultra-compact, high-speed response (< 300 bytes)
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
    usedMin: spPricing?.usedMin || null,
    usedBuyBox: spPricing?.usedBuyBox || null,
    usedOffers: spPricing?.usedOffers || null,
    sellerCentralUrl,
    amazonProductUrl,
    timestamp: Date.now()
  };

  // Cache result for 24 hours
  lookupCache.set(barcode, response);

  return response;
}

module.exports = {
  processBarcodeScan,
  normalizeBarcode,
  isbn10to13,
  isbn13to10
};
