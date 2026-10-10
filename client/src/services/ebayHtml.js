/**
 * Reading counts and prices out of eBay's search result pages.
 *
 * Kept apart from the fetching (services/ebayService.js) so it can be tested against fixtures,
 * because this is the fragile part: eBay's markup changes without notice, and a parse that
 * silently returns a wrong number is worse than one that returns nothing. Every function here
 * returns null or an empty result rather than guessing.
 *
 * Dependency-free by design: client/test/ebayHtml.test.mjs loads this file by reading its source
 * and stripping the `export` keywords.
 */

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Reduce a page to its visible text, so a count can be found whatever the markup around it. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(SCRIPT_OR_STYLE, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The number of results eBay reports for a search, or null when it cannot be determined.
 *
 * eBay says "1,234 results for dune herbert" in a dedicated heading. The class names differ
 * between its layouts, so the heading is tried first and the visible text is the fallback; the
 * number must sit immediately before the word "results", which is what keeps a listing title
 * containing the word from being mistaken for the count.
 */
export function parseResultCount(html) {
  const raw = String(html ?? '');
  if (!raw) return null;

  // A page with no result count at all is usually an error or an interstitial.
  if (/Error Page \| eBay/i.test(raw)) return null;

  // The count is sometimes nested inside a child element, so capture a window past the class
  // attribute rather than stopping at the first tag, and read the text out of it.
  const headingMatch = raw.match(
    /class="[^"]*(?:srp-controls__count-heading|srp-controls__count|s-item__count)[^"]*"[^>]*>([\s\S]{0,400})/i
  );

  const candidates = [];
  if (headingMatch) candidates.push(htmlToText(headingMatch[1]));
  // The visible text, from the top: the count is announced before the listings.
  candidates.push(htmlToText(raw).slice(0, 4000));

  for (const text of candidates) {
    const match = text.match(/([\d][\d,]{0,14})\+?\s*results?\b/i);
    if (match) {
      const value = parseInt(match[1].replace(/,/g, ''), 10);
      if (Number.isFinite(value)) return value;
    }
    if (/\b0 results\b/i.test(text)) return 0;
  }

  // "No exact matches found" is deliberately not treated as zero: eBay shows that alongside
  // suggested listings, so it says nothing certain about how many results exist.
  return null;
}

/**
 * The sold prices on a sold/completed results page.
 *
 * The `s-item__price` class is what the app has always matched on, and it appears in both the
 * desktop and mobile renderings. The currency prefix is optional and may be spaced - eBay.ca
 * writes "C $8.99" as well as "CDN$ 8.99" - which the previous pattern missed. Because the match
 * is anchored to that class, tolerating the prefix costs nothing in accuracy.
 *
 * Values at or below 0.99 are dropped: they are almost always a placeholder rather than a sale.
 */
export function parseSoldPrices(html) {
  const raw = String(html ?? '');
  if (!raw || /Error Page \| eBay/i.test(raw)) return [];

  const pricePattern = /class="s-item__price"[^>]*>(?:<span[^>]*>)?(?:CDN|CAD|C|US)?\s*\$\s*([0-9,]+\.[0-9]{2})/gi;

  const prices = [];
  let match;
  while ((match = pricePattern.exec(raw)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isNaN(value) && value > 0.99) prices.push(value);
  }
  return prices;
}

/**
 * The lowest sold price on the page, or null.
 */
export function lowestSoldPrice(html) {
  const prices = parseSoldPrices(html);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * A count, or null for anything that is not one.
 *
 * `Number(null)` and `Number('')` are both 0, which would silently turn "we could not read the
 * count" into "nothing sold" - a 0% sell-through badge on an item that may sell perfectly well.
 * A missing count must stay missing.
 */
function toCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

/**
 * Sell-through as a whole percentage: of everything that sold or is still listed, how much sold.
 *
 * This is the usual reseller proxy, and it is a proxy. The two counts are different windows -
 * eBay's sold search covers roughly the last 90 days, the active count is right now - and they
 * count listings rather than units, so a multi-quantity listing counts once. It is also only as
 * meaningful as the search terms it was measured on.
 *
 * Returns null when it cannot be computed: with nothing sold and nothing listed there is no rate
 * to report, and a missing count must not be read as zero.
 */
export function sellThroughRate(soldCount, activeCount) {
  const sold = toCount(soldCount);
  const active = toCount(activeCount);
  if (sold === null || active === null) return null;

  const total = sold + active;
  if (total <= 0) return null;

  return Math.round((sold / total) * 100);
}

/**
 * A coarse band for colouring the number.
 *
 * The thresholds are reseller convention, not anything eBay publishes, and they are applied to an
 * estimate - so this is used for the colour of a badge and deliberately never rendered as a word
 * that would claim more precision than the input has.
 */
export function sellThroughBand(percent) {
  if (!Number.isFinite(percent)) return null;
  if (percent >= 60) return 'high';
  if (percent >= 30) return 'medium';
  return 'low';
}
