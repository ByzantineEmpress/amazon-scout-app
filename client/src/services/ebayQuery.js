/**
 * Build the keyword query used for an eBay sold-comps search.
 *
 * Why this exists: the app used to search eBay by ISBN, because that is an exact identifier.
 * But eBay sellers type a book's title and author and almost never the ISBN, so an ISBN search
 * finds nothing and a book looks like it has no sold comps at all.
 *
 * Two things drive recall on eBay, and both point the same way:
 *
 *  - eBay ANDs the terms in `_nkw`, so every extra word is another chance for a real listing to
 *    be excluded. A full subtitle is a liability.
 *  - Sellers list the title with the author, not the series, edition, or format asides.
 *
 * So the query is the main title plus the author's surname.
 */

/** (parenthetical) and [bracketed] asides - series numbers, edition notes, format - are noise. */
const ASIDE = /[([{][^)\]}]*[)\]}]+/g;

/** Trailing "- Book 2 of the Whatever" style series notes. */
const SERIES_TAIL = /\s*[-–—]\s*(book|vol\.?|volume)\s*\d+.*$/i;

/**
 * Reduce a catalogue title to the part a seller would actually have typed.
 * Keeps accented letters, so names and titles survive intact.
 */
export function cleanTitleForSearch(raw) {
  let title = String(raw ?? '');
  if (!title.trim()) return '';

  title = title.replace(ASIDE, ' ');
  title = title.replace(SERIES_TAIL, ' ');

  // Drop the subtitle. "Clean Code: A Handbook of Agile Software Craftsmanship" matches far more
  // listings as "Clean Code" than as the whole string.
  const colon = title.indexOf(':');
  if (colon > 2) title = title.slice(0, colon);

  return title.replace(/\s+/g, ' ').replace(/^[\s,;.]+|[\s,;.]+$/g, '').trim();
}

/**
 * The author's surname, which is what appears in an eBay listing title.
 * Handles "J.K. Rowling" and "Rowling, J.K." alike, and declines to guess when nothing
 * name-like is left.
 */
export function authorSurname(raw) {
  const author = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!author) return '';

  // "Rowling, J.K." puts the surname first.
  const candidate = author.split(',')[0].trim() || author;
  const words = candidate.split(' ').filter(Boolean);
  const last = words[words.length - 1] || '';

  // Accented Latin letters are kept; anything else is punctuation.
  const cleaned = last.replace(/[^A-Za-zÀ-ÿ'’-]/g, '');
  return cleaned.length >= 3 ? cleaned : '';
}

/**
 * Build the query.
 *
 * `prefer` is 'title' by default because that is what finds comps; 'barcode' remains available
 * for the occasional listing that does quote an ISBN, and for non-book items where a UPC can be
 * the more exact handle.
 */
export function buildEbayQuery({ barcode, title, author, prefer = 'title' } = {}) {
  const code = String(barcode ?? '').trim();
  if (prefer === 'barcode' && code) return code;

  const cleanTitle = cleanTitleForSearch(title);
  if (cleanTitle) {
    const surname = authorSurname(author);
    return surname ? `${cleanTitle} ${surname}` : cleanTitle;
  }

  // No usable title: the identifier is all we have.
  return code;
}
