/**
 * Choosing which eBay category to narrow a comps search to.
 *
 * Narrowing matters because an unscoped search for a book title happily returns posters, DVDs and
 * study guides for it, which makes the comps useless.
 *
 * The category ids are deliberately NOT hardcoded here. A table of ids would have to be right for
 * every marketplace, and a wrong id does not return slightly worse results - it returns none at
 * all, silently, which is the worst possible failure for a pricing tool. eBay also refuses the
 * requests this project can make from a development machine (HTTP 403), so such a table could not
 * even be checked. Instead the ids come from the results page itself, where eBay lists the
 * categories it has decided the search belongs to, and the name is shown to the user before
 * anything is applied.
 *
 * Dependency-free so it can be tested: client/test/ebayCategory.test.mjs loads this source.
 */

/** eBay's "All Categories" is not a narrowing. */
const ALL_CATEGORIES = '0';

/**
 * Pick the category to offer from the links found on a results page.
 *
 * `candidates` is what the page reports: [{ href, text }], in document order. eBay's refinement
 * list is ordered with the most relevant category first, so the first usable one wins.
 *
 * Returns { id, name } or null. Never invents an id.
 */
export function pickEbayCategory(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  const seen = new Set();

  for (const candidate of list) {
    if (!candidate || typeof candidate !== 'object') continue;

    const href = String(candidate.href ?? '');
    const match = href.match(/[?&]_sacat=(\d+)/);
    if (!match) continue;

    const id = match[1];
    if (id === ALL_CATEGORIES || seen.has(id)) continue;

    // The link text is what the user will be shown, so it has to be a name rather than markup or
    // a whole sentence of page furniture.
    const name = String(candidate.text ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name.length < 2 || name.length > 60) continue;

    seen.add(id);
    return { id, name };
  }

  return null;
}

/**
 * Read the result count out of a light text version of a results page.
 *
 * Only used to sanity-check what a page reported; the counting itself happens in the page. The
 * number must sit immediately before the word "results", which is what stops a listing title
 * containing that word from being read as the count.
 */
export function parsePageCount(text) {
  const match = String(text ?? '').match(/([\d][\d,]{0,14})\+?\s*results?\b/i);
  if (!match) return null;
  const value = parseInt(match[1].replace(/,/g, ''), 10);
  return Number.isFinite(value) ? value : null;
}
