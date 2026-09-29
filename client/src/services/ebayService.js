import axios from 'axios';
import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Clipboard from 'expo-clipboard';

/**
 * Mobile Chrome user agent, shared by the sold-comps scraper and the in-app WebView so eBay
 * serves the mobile layout rather than the desktop one. Note the absence of the "; wv" marker
 * that identifies an embedded WebView, which some sites treat as a bot.
 */
export const EBAY_MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

/**
 * Builds the direct URL for eBay Sold & Completed listings, sorted by price lowest
 */
export function getEbaySoldUrl(barcode, title, marketplace = 'CA') {
  const isCanada = marketplace !== 'US';
  const domain = isCanada ? 'https://www.ebay.ca' : 'https://www.ebay.com';
  // Use ISBN / Barcode first for exact matching, fallback to title
  const query = (barcode || title || '').trim();
  return `${domain}/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=15`;
}

/**
 * Asynchronously checks for the lowest sold/market comp on eBay.
 * Runs in background without blocking the primary scan UI.
 */
export async function fetchEbaySoldLowest(barcode, title, marketplace = 'CA') {
  const isCanada = marketplace !== 'US';
  const soldUrl = getEbaySoldUrl(barcode, title, marketplace);
  const currencyPrefix = isCanada ? 'CDN$ ' : '$';

  try {
    const query = barcode || title;
    if (!query) return { success: false, soldUrl, price: null };

    const searchUrl = `${isCanada ? 'https://www.ebay.ca' : 'https://www.ebay.com'}/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1&_sop=15`;

    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': EBAY_MOBILE_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 3500,
      maxRedirects: 2,
      validateStatus: (status) => status >= 200 && status < 400
    });

    if (res.data && typeof res.data === 'string' && !res.data.includes('Error Page | eBay')) {
      // Parse prices from eBay HTML
      const priceRegex = /class="s-item__price"[^>]*>(?:<span[^>]*>)?(?:CDN\$|C\$|US\s*\$|\$)\s*([0-9,]+\.[0-9]{2})/gi;
      const prices = [];
      let match;
      while ((match = priceRegex.exec(res.data)) !== null) {
        const val = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0.99) {
          prices.push(val);
        }
      }

      if (prices.length > 0) {
        const lowest = Math.min(...prices);
        return {
          success: true,
          soldUrl,
          price: lowest,
          currencyPrefix,
          count: prices.length
        };
      }
    }
  } catch (err) {
    // Expected when eBay challenges or redirects unauthenticated scrapers
  }

  return {
    success: false,
    soldUrl,
    price: null,
    currencyPrefix
  };
}

/**
 * One-tap launcher for eBay Sold listings:
 * 1. Copies barcode/ISBN to device clipboard
 * 2. Launches native eBay app or mobile browser directly to sold comps
 */
export async function launchEbaySold(barcode, title, marketplace = 'CA') {
  const query = barcode || title || '';
  if (barcode) {
    try {
      await Clipboard.setStringAsync(barcode);
    } catch (e) {}
  }

  const soldUrl = getEbaySoldUrl(barcode, title, marketplace);

  // On Android, try launching the native eBay mobile app directly
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.openApplication('com.ebay.mobile');
      return { copied: true, openedApp: true };
    } catch (err) {
      // eBay app not installed; fall through to browser
    }
  }

  // Open direct filtered URL in browser
  try {
    const canOpen = await Linking.canOpenURL(soldUrl);
    if (canOpen) {
      await Linking.openURL(soldUrl);
      return { copied: true, openedApp: false };
    }
  } catch (err) {}

  return { copied: true, openedApp: false };
}
