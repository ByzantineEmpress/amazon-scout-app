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
