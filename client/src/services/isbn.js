/**
 * ISBN conversion helpers.
 *
 * These live in their own module for one reason: they are pure, and they decide which ASIN the
 * app sends to Amazon. A bug in `isbn13to10` would silently look up the wrong product, so it
 * needs to be testable without a phone, a camera, or a network - which it was not while it sat
 * inside barcodeService.js alongside axios and AsyncStorage.
 *
 * The important thing to understand about books and barcodes: the barcode on a book is always
 * a numeric EAN-13 (prefix 978 or 979). An ISBN-10 that ends in "X" - which is common, "X"
 * being how mod-11 writes a check value of 10 - appears only in the printed text and in the
 * derived ASIN. A scanned book barcode therefore never contains a letter; the letter is
 * produced by `isbn13to10` below, and that result is what Amazon is asked about.
 */

/**
 * Convert an ISBN-10 to ISBN-13 (keeping the "978" prefix).
 * Returns the input unchanged if it is not a 10-character ISBN.
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
 * Convert an ISBN-13 to ISBN-10, which is the Amazon ASIN for physical books.
 * The check digit can be "X" (mod-11 value 10) - see the note at the top of this file.
 * Returns null when there is no ISBN-10 equivalent (a 979-prefixed ISBN-13 has none).
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
 * Normalize a barcode string: keep digits and X, upper-case the X.
 * Note this is deliberately permissive - it strips anything else - which is why the camera
 * path validates its input before it gets here (see barcodeValidation.js).
 */
export function normalizeBarcode(raw) {
  if (!raw) return '';
  return raw.replace(/[^0-9X]/gi, '').toUpperCase();
}

// --- validation --------------------------------------------------------------
//
// A deliberate note on duplication: the modulo-10 loop below also exists in
// barcodeValidation.js. These modules are kept free of imports so the Node test suite can
// evaluate them directly (they are plain functions with no dependencies to resolve), which is
// worth five duplicated lines.

/** ISBN-13 check digit (the same modulo-10 as EAN-13). */
function isbn13CheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * ISBN-10 check digit, modulo 11. A value of 10 is written "X" - the only place a letter may
 * legitimately appear anywhere in an ISBN.
 */
export function isbn10CheckDigit(first9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(first9[i]) * (10 - i);
  }
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/** True when `code` is a well-formed ISBN-10 with a correct check digit. */
export function isValidIsbn10(code) {
  const clean = String(code ?? '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (!/^\d{9}[\dX]$/.test(clean)) return false;
  return isbn10CheckDigit(clean.slice(0, 9)) === clean[9];
}

/** True when `code` is a well-formed ISBN-13 (978/979 Bookland) with a correct check digit. */
export function isValidIsbn13(code) {
  const clean = String(code ?? '').replace(/\D/g, '');
  if (!/^97[89]\d{10}$/.test(clean)) return false;
  return isbn13CheckDigit(clean.slice(0, 12)) === Number(clean[12]);
}

/** True for either ISBN form. */
export function isValidIsbn(code) {
  return isValidIsbn10(code) || isValidIsbn13(code);
}

/**
 * Choose the most useful ISBN from a list of them.
 *
 * OpenLibrary returns every edition's number for a work, in no particular order, and the
 * lookup works best with a modern 978 ISBN-13. Check-digit-valid numbers win over merely
 * well-shaped ones, so a typo in the source data cannot become the number we shop with.
 */
export function pickBestIsbn(list) {
  const codes = (Array.isArray(list) ? list : []).map((value) => String(value ?? '').trim());

  return (
    codes.find(isValidIsbn13) ||
    codes.find(isValidIsbn10) ||
    codes.find((code) => /^\d{13}$/.test(code)) ||
    null
  );
}

// --- reading an ISBN out of photographed text --------------------------------

/** Characters that may sit between the digits of a printed ISBN. */
const ISBN_SEPARATORS = /[^0-9X]/gi;

/**
 * Pull validated ISBNs out of text recognised in a photo.
 *
 * Printed ISBNs appear in many shapes - "ISBN 0-439-42089-X", "ISBN-13: 978-0-439-42089-1",
 * or bare "9780439420891" - so separators between digits are tolerated and a label in front
 * simply ends the run. Only sequences that pass the check digit are returned, which is what
 * makes reading a number off a page trustworthy: a misread digit almost always breaks the
 * checksum, so a wrong number is dropped instead of being looked up.
 *
 * Deliberately not attempted here: guessing at OCR letter/digit confusions (O for 0, l for 1).
 * Substituting those would raise the chance of accepting a number that was never on the page,
 * and being wrong costs money. Digits only, check digit as the arbiter.
 */
export function extractIsbnCandidates(text) {
  if (typeof text !== 'string' || !text) return [];

  const found = [];
  const seen = new Set();

  const consider = (candidate) => {
    const code = String(candidate || '').toUpperCase();
    if (!code || seen.has(code)) return;
    if (!isValidIsbn(code)) return;
    seen.add(code);
    found.push(code);
  };

  // A run is a stretch of digits, separators and a possible trailing X. Letters end it, so
  // "ISBN 0-439-42089-X" yields the run "0-439-42089-X". Space and tab only, never a newline,
  // so two unrelated numbers on consecutive lines do not merge into one long run.
  const runs = text.match(/[0-9X][0-9X \t\-.]{7,}[0-9X]/gi) || [];

  for (const run of runs) {
    // The whole run, plus each whitespace-separated part, so a price or quantity printed
    // beside the number does not spoil the match.
    for (const part of [run, ...run.split(/[ \t]+/)]) {
      const stripped = part.replace(ISBN_SEPARATORS, '');
      consider(stripped);

      // An ISBN printed next to its price add-on arrives as 13 + 2 or 13 + 5 digits. Only those
      // exact tails are dropped, so an arbitrary long digit string cannot be trimmed down into
      // something that happens to validate (which is a 1-in-10 accident otherwise).
      if (stripped.length === 15 || stripped.length === 18) {
        consider(stripped.slice(0, 13));
      }
    }
  }

  return found;
}

