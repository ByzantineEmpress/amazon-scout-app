import axios from 'axios';
import { evaluateRestrictions } from './gatingRules.js';
import { addToOfflineQueue } from './storage.js';

// The ISBN maths now lives in its own pure module so it can be unit tested without pulling in
// axios and AsyncStorage. Re-exported here so the public import surface is unchanged.
import { isbn10to13, isbn13to10, normalizeBarcode } from './isbn.js';
export { isbn10to13, isbn13to10, normalizeBarcode };

// In-memory cache for ultra-fast repeat lookups (0ms latency on phone)
const localCache = new Map();

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

      // For book searches, Amazon may surface other titles with the same name (e.g. a
      // different "Dark Room" by another publisher). The ASIN for a book equals the
      // ISBN-10 digits (or ISBN-13 digits), so we verify the ASIN matches the query
      // before accepting an early return. Without this check, the first non-digital
      // result with a used price wins — even if it's the wrong book.
      //
      // The query may be an ISBN-10 (10 digits) or ISBN-13 (13 digits starting 978/979).
      // The ASIN in the result is the same digits. We compare by stripping non-digits
      // and checking if one contains the other (to handle ISBN-10 vs ISBN-13 mismatch).
      const isBookQuery = isBook && /^\d{10,13}$/.test(query);
      const queryDigits = query.replace(/\D/g, '');

      const asinMatchesQuery = (asin) => {
        if (!asin || !queryDigits) return false;
        const asinDigits = asin.replace(/\D/g, '');
        // Exact match, or the ASIN is the ISBN-10 prefix of the ISBN-13 query (or vice versa)
        if (asinDigits === queryDigits) return true;
        if (asinDigits.length === 10 && queryDigits.length === 13) {
          return queryDigits.slice(-10) === asinDigits;
        }
        if (asinDigits.length === 13 && queryDigits.length === 10) {
          return asinDigits.slice(-10) === queryDigits;
        }
        return false;
      };

      let bestPhysical = null;
      let bestAny = null;
      let bestBookMatch = null; // first result whose ASIN matches the queried ISBN

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

        // Offer count: "N used & new offers" or "N offers" in the search result block.
        const offerCountMatch = b.match(/(\d+)\s+used\s*&\s*new\s+offers?/i) ||
                                b.match(/(\d+)\s+offers?\s*\(/i);
        const offerCount = offerCountMatch ? parseInt(offerCountMatch[1], 10) : null;

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
          offerCount,
          domain,
          isDigital
        };

        // Track the first result whose ASIN matches the queried ISBN (the correct book).
        if (isBookQuery && asinMatchesQuery(asin) && !bestBookMatch) {
          bestBookMatch = candidate;
        }

        // Early return: for non-book queries, the first non-digital result with a used
        // price wins. For book queries, only return early if the ASIN matches the ISBN —
        // otherwise a different book with the same title grabs the slot.
        if (!isDigital && candidate.usedMin) {
          if (!isBookQuery || asinMatchesQuery(asin)) {
            return candidate;
          }
        }

        if (!bestPhysical && !isDigital) bestPhysical = candidate;
        if (!bestAny) bestAny = candidate;
      }

      // Prefer the ISBN-matched result for book searches, then fall back to the
      // best physical result, then any result.
      return bestBookMatch || bestPhysical || bestAny;
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
      const allPublishers = Array.isArray(doc.publisher)
        ? doc.publisher
        : (doc.publisher ? [doc.publisher] : []);
      return {
        title: doc.title,
        author: doc.author_name?.[0] || null,
        publisher: doc.publisher?.[0] || null,
        allPublishers,
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
      const allPublishers = Array.isArray(res.data.publishers)
        ? res.data.publishers
        : (res.data.publishers ? [res.data.publishers] : []);
      return {
        title: res.data.title,
        publisher: res.data.publishers?.[0] || null,
        allPublishers,
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

// ─────────────────────────────────────────────────────────────────────────────
// Amazon product detail page: the real offer list
//
// The search-page scrape (above) gives the buy box and the "Used & New from $X" snippet, which
// are useful but partial: they are what Amazon chose to surface in search, not the full offer
// list. The product detail page (`/dp/ASIN`) carries the actual offers — Amazon's own price,
// the lowest used, the offer count, and the sales rank — which is what a reseller needs to
// decide whether an item is worth picking up.
//
// This is the keyless equivalent of what the paid scouting apps (Scoutly, ScoutIQ, Profit
// Bandit) show, scraped straight from the detail page rather than via SP-API / PA-API. It is
// best-effort by design: Amazon changes its markup frequently, and a failure here must never
// take down a scan (invariant §4.6). The search scrape already degrades to null on failure;
// this one does the same, and callers treat a null as "offer list unavailable" and fall back
// to the search-snippet prices.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape the Amazon product detail page for the real offer list.
 *
 * @param {string} asin  The ASIN from the search scrape.
 * @param {string} marketplace  'CA' or 'US'.
 * @returns {Promise<{
 *   newPrice: ?number,
 *   lowestUsed: ?number,
 *   soldByAmazon: boolean,
 *   salesRank: ?string,
 *   offerCount: ?number
 * }>}  Always resolves; never throws. Returns null values when a field is not present.
 */
export async function fetchAmazonOfferList(asin, marketplace = 'CA') {
  if (!asin || typeof asin !== 'string' || asin.length < 5) return null;
  const domain = marketplace === 'US' ? 'amazon.com' : 'amazon.ca';
  const url = `https://www.${domain}/dp/${encodeURIComponent(asin)}?th=1&psc=1`;

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': marketplace === 'US' ? 'en-US,en;q=0.9' : 'en-CA,en-US;q=0.9,en;q=0.8'
      },
      timeout: 4500
    });

    const html = typeof res.data === 'string' ? res.data : '';
    if (html.length < 5000) return null;

    const result = {
      newPrice: null,
      lowestUsed: null,
      soldByAmazon: false,
      salesRank: null,
      offerCount: null
    };

    // New price: the buy box "priceToPay" on the detail page. The current markup is:
    //   <span class="a-price ... priceToPay ..."><span class="a-offscreen">$23.00</span>...
    // The price is in a-offscreen directly under the priceToPay span (there is no priceAmount
    // element in the current layout).
    const priceToPay = html.match(
      /priceToPay[\s\S]{0,600}?a-offscreen[^>]*>\$([\d,]+\.?\d{0,2})/
    );
    if (priceToPay) {
      const v = parseFloat(priceToPay[1].replace(/,/g, ''));
      if (Number.isFinite(v)) result.newPrice = v;
    }
    if (result.newPrice == null) {
      // Fallback: any a-price span with an a-offscreen value (the core price display).
      const corePrice = html.match(
        /<span[^>]*a-price[^>]*>[\s\S]{0,400}?a-offscreen[^>]*>\$([\d,]+\.?\d{0,2})/
      );
      if (corePrice) {
        const v = parseFloat(corePrice[1].replace(/,/g, ''));
        if (Number.isFinite(v)) result.newPrice = v;
      }
    }

    // Lowest used: the "Other sellers on Amazon" section on the detail page shows the
    // lowest price across all offers for THIS specific ASIN, with the condition
    // (New or Used) in the condition-text-block-title-text span. The price is in the
    // apex-pricetopay-accessibility-label span. This is authoritative for the specific book
    // (unlike the search snippet, which can be polluted by a different edition with the
    // same title).
    // Markup:
    //   <span id="condition-text-block-title-text">Lowest price: Used</span>
    //   ...
    //   <span class="apex-pricetopay-accessibility-label">$8.79</span>
    const otherSellersPos = html.indexOf('Other sellers on Amazon');
    if (otherSellersPos !== -1) {
      const section = html.slice(otherSellersPos, otherSellersPos + 3000);
      const condition = section.match(/Lowest price:\s*(New|Used)/);
      const price = section.match(
        /apex-pricetopay-accessibility-label[^>]*>\s*\$([\d,]+\.?\d{0,2})/
      );
      if (price && condition) {
        const v = parseFloat(price[1].replace(/,/g, ''));
        if (Number.isFinite(v)) {
          if (condition[1] === 'Used') {
            result.lowestUsed = v;
          } else {
            // Lowest is a New offer — it's a better deal, use it as the new price if lower.
            if (result.newPrice == null || v < result.newPrice) {
              result.newPrice = v;
            }
          }
        }
      }
    }

    // Offer count: "Compare all N options" link in the "Other sellers" section.
    const compareMatch = html.match(/Compare all (\d+) options/i);
    if (compareMatch) {
      result.offerCount = parseInt(compareMatch[1], 10);
    }

    // Sales rank: "Amazon Best Sellers Rank: #N in Category".
    const rank = html.match(
      /Best Sellers Rank[\s\S]{0,200}?#([\d,]+)[\s\S]{0,80}?in\s+([^<\n]+)/
    );
    if (rank) {
      const category = rank[2].replace(/<[^>]+>/g, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      result.salesRank = `#${rank[1]} in ${category}`;
    }

    // Sold by Amazon: the detail page shows "Ships from & Sold by Amazon" when Amazon is the
    // seller of the buy box offer.
    result.soldByAmazon = /Sold by[\s\S]{0,80}?Amazon/i.test(html) &&
                          /Ships from[\s\S]{0,80}?Amazon/i.test(html);

    return result;
  } catch (e) {
    // Degrade, never throw (§4.6). A detail-page failure must not crash the scan.
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
    const allPublishers = ol?.allPublishers || (ol?.publisher ? [ol.publisher] : (third?.publisher ? [third.publisher] : []));
    let publisher = ol?.publisher || third?.publisher || '';
    const category = third?.category || (isBook ? 'Books' : 'Media / General');
    const year = ol?.year || '';

    // ASIN and pricing
    const isCanada = marketplace !== 'US';
    const asin = amz?.asin || computedAsin || barcode;
    const priceSource = amz?.usedMin
      ? (amz.isUsFallback ? 'Amazon.com (est. CAD)' : (isCanada ? 'Amazon.ca' : 'Amazon.com'))
      : (abe?.usedMin ? 'AbeBooks / Used Market' : null);

    // Real offer list from the product detail page. This is the "exact Amazon pricing" the
    // paid scouting apps show: the actual buy box price, lowest used, offer count, and sales
    // rank, scraped from /dp/ASIN rather than the search snippet. It degrades to null on any
    // failure (§4.6) and is shown alongside — never instead of — the search-snippet prices.
    const asinForDetail = amz?.asin || computedAsin;
    const offerList = asinForDetail
      ? await (fetchAmazonOfferList(asinForDetail, marketplace).then((r) => r).catch(() => null))
      : null;

    // 3. Evaluate restrictions on-device
    const restriction = evaluateRestrictions({
      title,
      publisher,
      allPublishers,
      brand: publisher,
      author,
      category,
      barcode,
      asin
    });

    // If restriction matched a known major brand/publisher, display that as the primary publisher
    if (restriction.matchedName && (!publisher || publisher.toLowerCase().includes('urano') || restriction.status !== 'UNGATED')) {
      publisher = restriction.matchedName;
    }

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
      usedMin: offerList?.lowestUsed ?? amz?.usedMin ?? abe?.usedMin ?? null,
      usedBuyBox: offerList?.newPrice ?? amz?.buyBox ?? null,
      usedOffers: null,
      priceSource,
      // Real offer list from the product detail page (the "exact Amazon pricing").
      // The detail page's "Other sellers" section is authoritative for this specific ASIN:
      // newPrice (buy box), lowestUsed (lowest across all offers), offerCount, and salesRank.
      // The search-snippet values (amz.usedMin, amz.offerCount) are fallbacks for when the
      // detail page scrape fails.
      newPrice: offerList?.newPrice ?? amz?.buyBox ?? null,
      lowestUsed: offerList?.lowestUsed ?? amz?.usedMin ?? null,
      soldByAmazon: offerList?.soldByAmazon ?? false,
      salesRank: offerList?.salesRank ?? null,
      offerCount: offerList?.offerCount ?? amz?.offerCount ?? null,
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
