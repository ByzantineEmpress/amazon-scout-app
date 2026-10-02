/**
 * Best-effort reading of a title and author from text recognised on a book.
 *
 * This is only used to prefill a search box for books that predate ISBN (1970), which have no
 * number on them to read. Both fields are editable in the UI, so the goal here is a decent
 * first guess - not a correct answer. Anything cleverer would still be wrong sometimes, and a
 * user correcting a prefilled field is faster than a user typing one from scratch.
 *
 * The OCR module returns blocks -> lines -> elements, each with a bounding box. Typography is
 * what gives the guess its shape: a title is set larger than anything else on a title page, so
 * the tallest line wins, ties going to the one nearest the top.
 */

/** Lines that are page furniture rather than a title. */
const NOISE = /^(isbn|copyright|all rights reserved|printed in|first published|a novel|penguin|bantam|signet|dell|avon|ballantine|pocket books)\b/i;

/** An author line usually announces itself. */
const AUTHOR_PREFIX = /^by[\s.:]+/i;

/** Or it looks like a personal name: a few capitalised words, nothing else. */
const NAME_LIKE = /^[A-Z][A-Za-z'’.-]*(?:\s+(?:[A-Z]\.?|[A-Z][A-Za-z'’.-]*)){0,3}$/;

/** Flatten the OCR block structure into lines carrying just enough geometry. */
export function linesFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];

  const lines = [];
  for (const block of blocks) {
    for (const line of block?.lines || []) {
      const text = String(line?.text ?? '').trim();
      if (!text) continue;
      const frame = line?.frame || {};
      const top = Number.isFinite(frame.top) ? frame.top : 0;
      const bottom = Number.isFinite(frame.bottom) ? frame.bottom : top;
      lines.push({ text, top, height: Math.max(0, bottom - top) });
    }
  }
  return lines;
}

/**
 * Guess a title and author. Returns empty strings when there is nothing usable, so callers can
 * simply leave their fields blank.
 */
export function guessTitleAndAuthor(blocks) {
  const lines = linesFromBlocks(blocks).filter((line) => !NOISE.test(line.text));
  if (lines.length === 0) return { title: '', author: '' };

  const byProminence = [...lines].sort((a, b) => b.height - a.height || a.top - b.top);
  const titleLine = byProminence[0];

  // An explicit "by ..." line wins; otherwise take the first name-shaped line that is not the
  // title itself.
  const prefixed = lines.find((line) => AUTHOR_PREFIX.test(line.text) && line !== titleLine);
  const nameLike = lines.find(
    (line) => line !== titleLine && NAME_LIKE.test(line.text) && line.text.length > 2
  );
  const authorLine = prefixed || nameLike;

  return {
    title: titleLine.text,
    author: authorLine ? authorLine.text.replace(AUTHOR_PREFIX, '').trim() : ''
  };
}

/**
 * Packaging text that describes the object rather than the product: warnings, age ratings,
 * quantities, import marks, prices, barcodes and web addresses. On a typical box this is most of
 * the text, and none of it belongs in a search.
 *
 * The marketing words are anchored to a whole line on purpose - "NEW!" is noise, but "New
 * Balance" is a brand.
 */
const ITEM_NOISE = [
  /^(ages?|age)\s*\d/i,
  /^\d+\s*(\+|years?|yrs?|months?|mths?|pieces?|pcs?|count|ct)\b/i,
  /\bwarning\b/i,
  /\bchoking hazard\b/i,
  /\bbatteries\b/i,
  /\bnot included\b/i,
  /\bmade in\b/i,
  /\bkeep away from\b/i,
  /\bdo not\b/i,
  /\bpatent(ed| pending)?\b/i,
  /\bsee (back|bottom|inside|reverse)\b/i,
  /\bout of 5\b/i,
  /^(new|hot|sale|free|bonus|best seller|as seen on tv)[!.\s]*$/i,
  /\bwww\./i,
  /\.(com|ca|net|org)\b/i,
  /^https?:/i,
  /^[\d\s\-().#/*+,]+$/, // digits and punctuation only: barcodes, phone numbers, model numbers
  /^[$€£]\s*\d+([.,]\d+)?$/, // a price
  /^(upc|ean|isbn|sku|mpn|model|item|lot|ref)\b/i,
  /^[^A-Za-zÀ-ÿ]+$/ // nothing letter-like at all
];

function isItemNoise(text) {
  if (text.length < 2) return true;
  return ITEM_NOISE.some((pattern) => pattern.test(text));
}

/** Drop the marks that would only get in a search engine's way. */
export function cleanItemText(raw) {
  return String(raw ?? '')
    .replace(/[®™©]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•*:,.|/]+|[\s\-–—•*:,.|/]+$/g, '')
    .trim();
}

/**
 * Guess what an item is called, from text recognised on its packaging.
 *
 * Same principle as the book guesser above, different furniture: a product name is set larger
 * than the small print around it, and packaging announces it as "BRAND Product Name", so the
 * prominent lines are read in reading order and joined. Used to prefill a search box for eBay
 * sold comps, and the field is editable, so a good first guess is the whole goal.
 */
export function guessItemName(blocks) {
  const lines = linesFromBlocks(blocks)
    .map((line) => ({ ...line, text: cleanItemText(line.text) }))
    .filter((line) => !isItemNoise(line.text));
  if (lines.length === 0) return '';

  const tallest = Math.max(...lines.map((line) => line.height)) || 1;

  // Prominent lines only, then back into reading order - packaging reads top to bottom.
  const prominent = lines
    .filter((line) => line.height >= tallest * 0.55)
    .sort((a, b) => b.height - a.height || a.top - b.top)
    .slice(0, 3)
    .sort((a, b) => a.top - b.top);

  const parts = [];
  for (const line of prominent) {
    if (!line.text) continue;
    if (parts.length === 0) {
      parts.push(line.text);
      continue;
    }
    // Stop adding once the phrase gets long: eBay ANDs the terms, so a rambling query finds less.
    if ([...parts, line.text].join(' ').length > 50) break;
    parts.push(line.text);
  }

  const name = parts.join(' ').slice(0, 70).trim();

  // A model number is the most useful handle on a bare device, but eBay ANDs its terms: adding
  // one to an already-descriptive name risks excluding every listing that omits it. So it is
  // only folded in when the name is a single word - which on an unbranded box is often just the
  // maker - or missing altogether. Otherwise the UI offers it as a separate tap.
  const model = findModelNumber(blocks);
  const words = name ? name.split(/\s+/).filter(Boolean).length : 0;
  if (model && words <= 1 && !name.includes(model)) {
    return [name, model].filter(Boolean).join(' ');
  }
  return name;
}

/** A line that names the model outright. The value is what matters, not the label. */
const MODEL_LABEL =
  /^(?:model(?:\s*(?:no|number|#)\.?)?|mod\.?|m\/n|type|prod(?:uct)?\s*(?:no|#)\.?)\s*[:#]?\s*(.+)$/i;

/** Compliance marks read like model numbers. EN71 and friends are not search terms. */
const STANDARD_PREFIX = /^(en|astm|iso|fcc|rohs|ul|csa|sae|ansi|ce)\s?-?\s?\d/i;

/**
 * A value that is an instruction rather than a model. The full noise list cannot be used here:
 * it rejects anything numeric, and "Model 1914" is a perfectly good model number.
 */
const MODEL_VALUE_NOISE = /\bsee\b|\bn\/?a\b|^none$/i;

/**
 * A model designator is one token mixing letters and digits: CFI-ZCT1W, HAC-001, WH-1000XM4.
 * Packaging is full of four-character standards that look similar, so a token has to be long
 * enough to be plausible, and the standards are excluded by name.
 */
function isModelToken(text) {
  const token = text.trim();
  if (token.length < 6 || token.length > 20) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9\-/._]*$/.test(token)) return false;
  if (!/[A-Za-z]/.test(token) || !/\d/.test(token)) return false;
  if (STANDARD_PREFIX.test(token)) return false;
  return !ITEM_NOISE.some((pattern) => pattern.test(token));
}

/**
 * Find the model number on the item.
 *
 * This is the answer for things with no name to read - a controller, a camera body, a drill, a
 * pair of headphones. Such an object may carry no product name at all, but it very often carries
 * a model number, and that is exactly how used gear is listed and searched on eBay.
 *
 * Small print is deliberately included here: model numbers are usually the least prominent text
 * on the object, tucked on a sticker underneath.
 */
export function findModelNumber(blocks) {
  const lines = linesFromBlocks(blocks).map((line) => ({ ...line, text: cleanItemText(line.text) }));

  // An explicit "Model:" label is trusted, even when the value is a plain number ("Model 1914").
  for (const line of lines) {
    const match = line.text.match(MODEL_LABEL);
    if (!match) continue;
    const value = cleanItemText(match[1]);
    if (value.length >= 3 && value.length <= 24 && !MODEL_VALUE_NOISE.test(value)) {
      return value;
    }
  }

  // Otherwise the most prominent token that looks like one.
  for (const line of [...lines].sort((a, b) => b.height - a.height)) {
    for (const token of line.text.split(/\s+/)) {
      if (isModelToken(token)) return token;
    }
  }

  return '';
}
