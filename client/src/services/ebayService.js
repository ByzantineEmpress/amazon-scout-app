import axios from 'axios';
import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Clipboard from 'expo-clipboard';
import { buildEbayQuery } from './ebayQuery';
import { categoryScope } from './ebayCategory';
import {
  parseResultCount,
  parseSoldPrices,
  sellThroughRate
} from './ebayHtml';

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
export function getEbaySoldUrl(query, marketplace = 'CA', categoryId = null) {
  const keywords = String(query ?? '').trim();
  return `${ebayDomain(marketplace)}/sch/i.html?_nkw=${encodeURIComponent(keywords)}&LH_Sold=1&LH_Complete=1&_sop=15${categoryScope(categoryId)}`;
}

/** Currently-listed listings for the same query, which is the other half of sell-through. */
export function getEbayActiveUrl(query, marketplace = 'CA', categoryId = null) {
  const keywords = String(query ?? '').trim();
  return `${ebayDomain(marketplace)}/sch/i.html?_nkw=${encodeURIComponent(keywords)}${categoryScope(categoryId)}`;
}

/** Fetch a search page. Returns '' rather than throwing, so a failure degrades quietly. */
async function fetchSearchHtml(url, timeout) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': EBAY_MOBILE_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout,
    maxRedirects: 2,
    validateStatus: (status) => status >= 200 && status < 400
  });
  return typeof res.data === 'string' ? res.data : '';
}

/**
 * Read one query's sold page and active page, and work out what it says.
 *
 * Two requests instead of one, but they run together, so the wait is the slower of the two rather
 * than the sum. The active page only feeds the sell-through estimate, so it gets a shorter
 * timeout and is allowed to fail: the price is the point, and it must not be held up by a page
 * that is merely nice to have.
 *
 * Never throws. Every field is null when it could not be read, because a wrong number here would
 * be acted on.
 */
async function lookupStats(query, marketplace) {
  const soldUrl = getEbaySoldUrl(query, marketplace);
  const activeUrl = getEbayActiveUrl(query, marketplace);

  const [soldHtml, activeHtml] = await Promise.all([
    fetchSearchHtml(soldUrl, 3500).catch(() => ''),
    fetchSearchHtml(activeUrl, 2500).catch(() => '')
  ]);

  const prices = parseSoldPrices(soldHtml);
  const soldCount = parseResultCount(soldHtml);
  const activeCount = parseResultCount(activeHtml);

  return {
    soldUrl,
    price: prices.length > 0 ? Math.min(...prices) : null,
    count: prices.length,
    soldCount,
    activeCount,
    sellThrough: sellThroughRate(soldCount, activeCount)
  };
}

/**
 * The instant lowest-sold figure and sell-through for the scan card.
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
  const fallbackUrl = getEbaySoldUrl(titleQuery || codeQuery, marketplace);

  const attempts = [['title', titleQuery]];
  if (codeQuery && codeQuery !== titleQuery) attempts.push(['barcode', codeQuery]);

  for (const [matchedBy, query] of attempts) {
    try {
      const stats = await lookupStats(query, marketplace);
      // Accept the attempt if it told us anything at all: a sell-through with no price is still
      // worth showing.
      if (stats.price !== null || stats.sellThrough !== null) {
        return {
          success: stats.price !== null,
          currencyPrefix,
          matchedBy,
          query,
          ...stats
        };
      }
    } catch (_e) {
      // eBay challenges unauthenticated scrapers routinely; move on to the next query.
    }
  }

  return {
    success: false,
    soldUrl: fallbackUrl,
    price: null,
    currencyPrefix,
    matchedBy: null,
    query: titleQuery || codeQuery,
    soldCount: null,
    activeCount: null,
    sellThrough: null
  };
}

/**
 * The lowest sold price for a raw search phrase.
 *
 * Used by the photo comps tool, where the terms are read off an item rather than taken from a
 * catalogue title. The phrase is used exactly as given: there is no catalogue title here, so
 * running it through the title cleaner would be wrong.
 */
export async function fetchEbayLowestForQuery(query, marketplace = 'CA') {
  const currencyPrefix = marketplace === 'US' ? '$' : 'CDN$ ';
  const phrase = String(query ?? '').trim();
  const soldUrl = getEbaySoldUrl(phrase, marketplace);

  if (phrase) {
    try {
      const stats = await lookupStats(phrase, marketplace);
      return { success: stats.price !== null, currencyPrefix, ...stats };
    } catch (_e) {
      // eBay challenges unauthenticated scrapers routinely; the pane behind the button still works.
    }
  }

  return {
    success: false,
    soldUrl,
    currencyPrefix,
    price: null,
    soldCount: null,
    activeCount: null,
    sellThrough: null
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
