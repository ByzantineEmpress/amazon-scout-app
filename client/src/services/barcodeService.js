import axios from 'axios';
import { evaluateRestrictions } from './gatingRules.js';
import { addToOfflineQueue } from './storage.js';

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
 * Normalize barcode string
 */
export function normalizeBarcode(raw) {
  if (!raw) return '';
  return raw.replace(/[^0-9X]/gi, '').toUpperCase();
}

/**
 * 1. Live Amazon Search Extractor (Gets Real Title, ASIN, Buy Box, and Lowest Used Price)
 * Multi-block parsing, ISBN-10 physical prioritization, $0 Audible filter, and CA/US cross-fallback
 */
async function scrapeAmazonSearch(barcode, marketplace = 'CA') {
  const isBook = barcode.startsWith('978') || barcode.startsWith('979') || barcode.length === 10;
  const isbn10 = isBook && barcode.length === 13 ? isbn13to10(barcode) : (barcode.length === 10 ? barcode : null);

  const queries = isbn10 ? [isbn10, barcode] : [barcode];
  const primaryDomain = marketplace === 'US' ? 'https://www.amazon.com' : 'https://www.amazon.ca';
  const fallbackDomain = marketplace === 'US' ? 'https://www.amazon.ca' : 'https://www.amazon.com';

  const trySearch = async (domain, query) => {
    try {
      const isCa = domain.includes('.ca');
      const res = await axios.get(`${domain}/s?k=${query}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': isCa ? 'en-CA,en-US;q=0.9,en;q=0.8' : 'en-US,en;q=0.9'
        },
        timeout: 4500
      });

      const html = res.data;
      if (typeof html !== 'string' || html.length < 5000) return null;
      if (html.includes('No results for') || html.includes('did not match any products')) return null;

      const blocks = html.split('data-component-type="s-search-result"').slice(1);
      if (blocks.length === 0) return null;

      let bestPhysical = null;
      let bestAny = null;

      for (const b of blocks) {
        const titleMatch = b.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
                           b.match(/class="a-size-[^"]*a-color-base[^"]*">([^<]+)<\/span>/i);
        if (!titleMatch) continue;

        const rawTitle = titleMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .trim();

        if (rawTitle.toLowerCase().includes('no results') || rawTitle.toLowerCase().includes('need help')) continue;

        const asinMatch = b.match(/data-asin="([A-Z0-9]{10})"/i);
        const asin = asinMatch ? asinMatch[1] : null;

        const isDigital = (rawTitle.toLowerCase().includes('kindle') || 
                           rawTitle.toLowerCase().includes('audible') || 
                           (asin && asin.startsWith('B0')));

        const authorMatch = b.match(/by\s+<[^>]+>([^<]+)<\/[^>]+>/i) ||
                            b.match(/by\s+<span[^>]*>([^<]+)<\/span>/i);
        const author = authorMatch ? authorMatch[1].trim() : null;

        // Used price
        const usedMatch = b.match(/(?:Used|used)\s+(?:and\s+New\s+)?from\s*(?:CDN\$|C\$|\$)\s*([0-9]+\.[0-9]{2})/i) ||
                          b.match(/More\s+Buying\s+Choices[\s\S]*?(?:CDN\$|C\$|\$)\s*([0-9]+\.[0-9]{2})/i);
        let usedMin = usedMatch ? parseFloat(usedMatch[1]) : null;

        // BuyBox
        const bbMatch = b.match(/class="a-price-whole">([0-9,]+)<span class="a-price-fraction">([0-9]{2})<\/span>/);
        const buyBox = bbMatch ? parseFloat(bbMatch[1].replace(/,/g, '') + '.' + bbMatch[2]) : null;

        // Filter out $0.00 Audible trial trap
        if (!usedMin) {
          const offscreenPrices = [...b.matchAll(/(?:CDN\$|C\$|\$)\s*([0-9]+\.[0-9]{2})/gi)]
            .map(m => parseFloat(m[1]))
            .filter(p => p > 1.50);
          if (offscreenPrices.length > 0) {
            usedMin = Math.min(...offscreenPrices);
          }
        }

        const candidate = {
          title: rawTitle,
          author,
          asin: asin || query,
          buyBox,
          usedMin: usedMin || buyBox,
          domain,
          isDigital
        };

        if (!isDigital && candidate.usedMin) {
          return candidate;
        }

        if (!bestPhysical && !isDigital) bestPhysical = candidate;
        if (!bestAny) bestAny = candidate;
      }

      return bestPhysical || bestAny;
    } catch (e) {
      return null;
    }
  };

  // 1. Try primary domain (first with ISBN-10, then barcode)
  for (const q of queries) {
    const res = await trySearch(primaryDomain, q);
    if (res && res.usedMin) return res;
  }

  // 2. Try fallback domain if no used price on primary
  for (const q of queries) {
    const res = await trySearch(fallbackDomain, q);
    if (res && res.usedMin) {
      if (primaryDomain.includes('.ca') && res.domain.includes('.com')) {
        res.usedMin = parseFloat((res.usedMin * 1.36).toFixed(2));
        res.isUsFallback = true;
      }
      return res;
    }
  }

  return null;
}

/**
 * 2. AbeBooks Used Book Price Resolver (Owned by Amazon)
 * World's largest used book catalog, keyless, zero captchas
 */
async function fetchAbeBooksPrice(barcode, marketplace = 'CA') {
  try {
    const url = `https://www.abebooks.com/servlet/SearchResults?isbn=${barcode}&sortby=17`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });
    const match = res.data.match(/data-test-id="listing-price"[^>]*>[\s\S]*?(?:US\$|CDN\$|\$)\s*([0-9]+\.[0-9]{2})/i);
    if (match) {
      const usdPrice = parseFloat(match[1]);
      const cadPrice = parseFloat((usdPrice * 1.36).toFixed(2));
      return {
        usedMin: marketplace === 'US' ? usdPrice : cadPrice,
        source: 'AbeBooks / Amazon Used'
      };
    }
  } catch (e) {}
  return null;
}

/**
 * 2. Apple Books / iTunes Ebook API
 * 100% Free, NO API key required, ultra-fast (~120ms), no 429 rate limits
 */
async function fetchAppleBooks(barcode) {
  try {
    const res = await axios.get(`https://itunes.apple.com/search?term=${barcode}&entity=ebook&limit=1`, {
      timeout: 3000
    });
    const item = res.data?.results?.[0];
    if (item && item.trackName) {
      return {
        title: item.trackName,
        author: item.artistName || null,
        category: item.genres?.[0] || 'Books'
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 3. OpenLibrary Fast Search API
 * Compliant User-Agent to avoid ECONNRESET and 1s rate limit
 */
async function fetchOpenLibrary(barcode) {
  try {
    // 3a. Search API (fast Solr/Elasticsearch index)
    const res = await axios.get(
      `https://openlibrary.org/search.json?q=${barcode}&fields=title,author_name,publisher,publish_year&limit=1`,
      {
        headers: { 'User-Agent': 'AmazonScoutApp/1.0 (contact@amazonscout.app)' },
        timeout: 4000
      }
    );
    const doc = res.data?.docs?.[0];
    if (doc && doc.title) {
      return {
        title: doc.title,
        author: doc.author_name?.[0] || null,
        publisher: doc.publisher?.[0] || null,
        year: doc.publish_year?.[0] || null
      };
    }
  } catch (e) {
    // Try legacy endpoint if search times out
  }

  try {
    // 3b. Legacy ISBN endpoint fallback
    const res = await axios.get(`https://openlibrary.org/isbn/${barcode}.json`, {
      headers: { 'User-Agent': 'AmazonScoutApp/1.0 (contact@amazonscout.app)' },
      timeout: 3500
    });
    if (res.data && res.data.title) {
      return {
        title: res.data.title,
        publisher: res.data.publishers?.[0] || null,
        year: res.data.publish_date || null
      };
    }
  } catch (e) {
    // Fallback smoothly
  }

  return null;
}

/**
 * 4. UPCitemdb API for DVDs, Blu-rays, Video Games, and Non-Book Media
 */
async function fetchUPCItemDb(barcode) {
  try {
    const res = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      timeout: 3500
    });
    const item = res.data?.items?.[0];
    if (item && item.title) {
      return {
        title: item.title,
        publisher: item.brand || item.publisher || null,
        category: item.category || 'Media / General'
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Main On-Device Scan Resolution
 * Completely serverless - executes 100% on phone
 */
export async function processBarcodeScanOnDevice(rawBarcode, marketplace = 'CA') {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    throw new Error('Invalid barcode provided');
  }

  const cacheKey = `${marketplace}:${barcode}`;
  // 1. Check local cache (0ms instant return)
  if (localCache.has(cacheKey)) {
    return { ...localCache.get(cacheKey), cached: true };
  }

  try {
    const isBook = barcode.startsWith('978') || barcode.startsWith('979') || barcode.length === 10;
    const computedAsin = isBook ? (barcode.length === 13 ? isbn13to10(barcode) : barcode) : barcode;

    // 2. Concurrently query Amazon live search, AbeBooks, Apple Books, and OpenLibrary
    const lookups = [
      scrapeAmazonSearch(barcode, marketplace),
      fetchOpenLibrary(barcode)
    ];

    if (isBook) {
      lookups.push(fetchAppleBooks(barcode));
      lookups.push(fetchAbeBooksPrice(barcode, marketplace));
    } else {
      lookups.push(fetchUPCItemDb(barcode));
    }

    const [amzRes, olRes, thirdRes, fourthRes] = await Promise.allSettled(lookups);

    const amz = amzRes.status === 'fulfilled' ? amzRes.value : null;
    const ol = olRes.status === 'fulfilled' ? olRes.value : null;
    const third = thirdRes.status === 'fulfilled' ? thirdRes.value : null;
    const abe = (isBook && fourthRes?.status === 'fulfilled') ? fourthRes.value : null;

    // Aggregate the best title, author, and publisher across all sources
    const title = amz?.title || third?.title || ol?.title || 'Unknown Item';
    const author = amz?.author || third?.author || ol?.author || '';
    const publisher = ol?.publisher || third?.publisher || '';
    const category = third?.category || (isBook ? 'Books' : 'Media / General');
    const year = ol?.year || '';

    // ASIN and pricing
    const isCanada = marketplace !== 'US';
    const asin = amz?.asin || computedAsin || barcode;
    const usedMin = amz?.usedMin || abe?.usedMin || null;
    const buyBox = amz?.buyBox || null;
    const priceSource = amz?.usedMin
      ? (amz.isUsFallback ? 'Amazon.com (est. CAD)' : (isCanada ? 'Amazon.ca' : 'Amazon.com'))
      : (abe?.usedMin ? 'AbeBooks / Used Market' : null);

    // 3. Evaluate restrictions on-device
    const restriction = evaluateRestrictions({
      title,
      publisher,
      brand: publisher,
      category
    });

    const domain = isCanada ? 'https://www.amazon.ca' : 'https://www.amazon.com';
    const sellerCentralDomain = isCanada ? 'https://sellercentral.amazon.ca' : 'https://sellercentral.amazon.com';

    const asinOrQuery = asin || barcode;
    const sellerCentralUrl = `${sellerCentralDomain}/productsearch?q=${asinOrQuery}`;
    const amazonProductUrl = `${domain}/dp/${asinOrQuery}`;

    const response = {
      barcode,
      asin: asinOrQuery,
      marketplace,
      currency: isCanada ? 'CAD' : 'USD',
      currencyPrefix: isCanada ? 'CDN$ ' : '$',
      title,
      publisher,
      author,
      category,
      year,
      status: restriction.status,
      badge: restriction.badge,
      badgeColor: restriction.badgeColor,
      textColor: restriction.textColor || '#FFFFFF',
      reason: restriction.reason,
      canSell: restriction.canSell,
      requiresInvoices: restriction.requiresInvoices,
      matchedName: restriction.matchedName || null,
      usedMin,
      usedBuyBox: buyBox,
      usedOffers: null,
      priceSource,
      sellerCentralUrl,
      amazonProductUrl,
      timestamp: Date.now()
    };

    localCache.set(cacheKey, response);
    return response;
  } catch (err) {
    console.warn('On-device scan error for barcode:', barcode, err.message);

    // Save to offline queue if network timed out
    await addToOfflineQueue(barcode);

    const isCanada = marketplace !== 'US';
    const domain = isCanada ? 'https://www.amazon.ca' : 'https://www.amazon.com';
    const sellerCentralDomain = isCanada ? 'https://sellercentral.amazon.ca' : 'https://sellercentral.amazon.com';

    return {
      barcode,
      asin: barcode,
      marketplace,
      currency: isCanada ? 'CAD' : 'USD',
      currencyPrefix: isCanada ? 'CDN$ ' : '$',
      title: 'Item Queued Offline (No Cell Signal)',
      status: 'OFFLINE_QUEUED',
      badge: 'OFFLINE QUEUED',
      badgeColor: '#718096',
      reason: 'Network timed out in store. Barcode saved to Offline Queue.',
      canSell: null,
      requiresInvoices: false,
      sellerCentralUrl: `${sellerCentralDomain}/productsearch?q=${barcode}`,
      amazonProductUrl: `${domain}/dp/${barcode}`,
      timestamp: Date.now()
    };
  }
}
