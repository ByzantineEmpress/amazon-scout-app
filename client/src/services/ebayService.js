import axios from 'axios';
import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Clipboard from 'expo-clipboard';
import { buildEbayQuery } from './ebayQuery';

/**
 * Mobile Chrome user agent, shared by the sold-comps scraper and the in-app WebView so eBay
 * serves the mobile layout rather than the desktop one. Note the absence of the "; wv" marker
 * that identifies an embedded WebView, which some sites treat as a bot.
 */
export const EBAY_MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

function ebayDomain(marketplace) {
  return marketplace === 'US' ? 'https://www.ebay.com' : 'https://www.ebay.ca';
}

/**
 * Sold & completed listings for a query, cheapest first.
 * The query comes from ebayQuery.js, which is where the choice of title over ISBN is explained.
 */
export function getEbaySoldUrl(query, marketplace = 'CA') {
  const keywords = String(query ?? '').trim();
  return `${ebayDomain(marketplace)}/sch/i.html?_nkw=${encodeURIComponent(keywords)}&LH_Sold=1&LH_Complete=1&_sop=15`;
}

/** Scrape the lowest sold price for one query. Returns null when nothing usable comes back. */
async function scrapeLowestSold(query, marketplace) {
  if (!query) return null;

  const res = await axios.get(getEbaySoldUrl(query, marketplace), {
    headers: {
      'User-Agent': EBAY_MOBILE_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 3500,
    maxRedirects: 2,
    validateStatus: (status) => status >= 200 && status < 400
  });

  if (!res.data || typeof res.data !== 'string' || res.data.includes('Error Page | eBay')) {
    return null;
  }

  const priceRegex = /class="s-item__price"[^>]*>(?:<span[^>]*>)?(?:CDN\$|C\$|US\s*\$|\$)\s*([0-9,]+\.[0-9]{2})/gi;
  const prices = [];
  let match;
  while ((match = priceRegex.exec(res.data)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isNaN(value) && value > 0.99) prices.push(value);
  }

  return prices.length > 0 ? { price: Math.min(...prices), count: prices.length } : null;
}

/**
 * The instant lowest-sold figure shown on the scan card.
 *
 * Tries the title query first, because that is what actually finds book comps, then falls back to
 * the identifier for the occasional listing that quotes an ISBN or UPC. Reports which one
 * produced the number, so the card can say how exact the match is rather than implying more than
 * it knows.
 */
export async function fetchEbaySoldLowest({ barcode, title, author, marketplace = 'CA' } = {}) {
  const currencyPrefix = marketplace === 'US' ? '$' : 'CDN$ ';
  const titleQuery = buildEbayQuery({ title, author, barcode });
  const codeQuery = String(barcode ?? '').trim();
  const soldUrl = getEbaySoldUrl(titleQuery || codeQuery, marketplace);

  const attempts = [['title', titleQuery]];
  if (codeQuery && codeQuery !== titleQuery) attempts.push(['barcode', codeQuery]);

  for (const [matchedBy, query] of attempts) {
    try {
      const hit = await scrapeLowestSold(query, marketplace);
      if (hit) return { success: true, soldUrl, currencyPrefix, matchedBy, query, ...hit };
    } catch (_e) {
      // eBay challenges unauthenticated scrapers routinely; move on to the next query.
    }
  }

  return {
    success: false,
    soldUrl,
    price: null,
    currencyPrefix,
    matchedBy: null,
    query: titleQuery || codeQuery
  };
}

/**
 * One-tap handoff: copies the search terms (not the ISBN, which is rarely in a listing) and
 * opens the eBay app, falling back to a browser.
 */
export async function launchEbaySold({ barcode, title, author, marketplace = 'CA' } = {}) {
  const query = buildEbayQuery({ title, author, barcode });

  if (query) {
    try {
      await Clipboard.setStringAsync(query);
    } catch (_e) {
      // Clipboard is a convenience; the app can still be opened without it.
    }
  }

  const soldUrl = getEbaySoldUrl(query, marketplace);

  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.openApplication('com.ebay.mobile');
      return { copied: true, openedApp: true };
    } catch (_e) {
      // eBay app not installed; fall through to the browser.
    }
  }

  try {
    if (await Linking.canOpenURL(soldUrl)) {
      await Linking.openURL(soldUrl);
      return { copied: true, openedApp: false };
    }
  } catch (_e) {
    // Nothing more to try.
  }

  return { copied: true, openedApp: false };
}
