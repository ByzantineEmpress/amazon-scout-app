/**
 * Validation for codes reported by the camera.
 *
 * The scanner is fast, but it is not always right. Two things make a wrong read expensive here:
 *
 *  - `normalizeBarcode` in barcodeService.js strips every non-digit character. So a Code 39
 *    asset tag reading "ABC123456" becomes the barcode "123456", and a QR code holding a URL
 *    becomes whatever digits that URL happened to contain. Both then get looked up as if they
 *    were real product barcodes.
 *  - Acting on the first frame means a transient misread is treated as fact.
 *
 * Every detection therefore passes through here before anything is looked up. Only the product
 * symbologies are enabled at the camera, and a code must be all digits, of an expected length,
 * and carry a valid GS1 check digit. None of this costs measurable time: it is arithmetic on a
 * short string, and it happens while the camera is still running.
 */

/**
 * Symbologies that actually appear on books, DVDs, Blu-rays and games.
 *
 * Deliberately excluded:
 *  - `qr`       shelf labels, price tags and marketing codes are everywhere, and their contents
 *                are text, not product numbers.
 *  - `code39` / `code128`  general-purpose alphanumeric codes used on asset tags and shipping
 *                labels; normalizeBarcode would mangle them into plausible-looking wrong digits.
 *  - `upc_e`    the compressed format for small packages (gum, lip balm). Validating it means
 *                expanding it to UPC-A first, and a wrong expansion would reject real codes, so
 *                it is left out until it can be done properly. Type it in via Manual Entry.
 *  - `pdf417`, `aztec`, `datamatrix`, `code93`, `codabar`  not used on retail media.
 */
export const SCANNER_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'itf14'];

/** Digit counts those symbologies use: EAN-8, UPC-A, EAN-13, ITF-14. */
const VALID_LENGTHS = [8, 12, 13, 14];

/** EAN-2 and EAN-5 are the only add-on supplements printed beside a retail barcode. */
const ADD_ON_LENGTHS = [2, 5];

/**
 * GS1 modulo-10 check digit. Counting left from the end of the body, digits alternate weight
 * 3, 1, 3, 1 ... This is shared by EAN-8, UPC-A, EAN-13 and ITF-14; UPC-E is the exception and
 * is not handled here.
 */
export function gs1CheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `code` is all digits, a supported length, and its check digit agrees. */
export function isValidProductCode(code) {
  if (typeof code !== 'string' || !/^\d+$/.test(code)) return false;
  if (!VALID_LENGTHS.includes(code.length)) return false;
  return gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * Decide whether a detection should be trusted.
 *
 * Returns `{ ok: true, code }` or `{ ok: false, reason }`. The reason is for debugging and
 * tests; it is never shown to the user, who only cares that the scanner keeps looking.
 */
export function validateScannedCode(rawData) {
  const raw = typeof rawData === 'string' ? rawData.trim() : '';

  if (!raw) return { ok: false, reason: 'empty' };

  if (!/^\d+$/.test(raw)) {
    // A QR code, a Code 39/128 label, or any text. This is the case that used to reach the
    // lookup as a mangled number.
    return { ok: false, reason: 'not-numeric' };
  }

  if (VALID_LENGTHS.includes(raw.length) && isValidProductCode(raw)) {
    return { ok: true, code: raw };
  }

  // Retail media frequently carries a price add-on (2 or 5 digits) printed beside the main
  // barcode, and some platforms report the two glued together. Such a value looks like an
  // invalid code of an odd length, so before rejecting it, try the leading EAN-13 / UPC-A on
  // its own. Books are exactly where this matters. Costs nothing when it never fires.
  //
  // The tail length must be a real add-on length. Loosening this to "any extra digits" would
  // accept a misread 13-digit EAN as whatever 12-digit UPC-A its first digits happened to
  // spell - which is the very class of wrong lookup this module exists to prevent.
  for (const mainLength of [13, 12]) {
    if (!ADD_ON_LENGTHS.includes(raw.length - mainLength)) continue;
    const candidate = raw.slice(0, mainLength);
    if (isValidProductCode(candidate)) {
      return { ok: true, code: candidate };
    }
  }

  if (!VALID_LENGTHS.includes(raw.length)) {
    return { ok: false, reason: `unexpected-length-${raw.length}` };
  }

  return { ok: false, reason: 'check-digit' };
}

/**
 * How many consecutive detections of the same code are required before acting on it.
 * A handheld camera produces the occasional single-frame misread; requiring agreement across
 * frames removes almost all of them. At the rate the camera reports barcodes this is well
 * under a tenth of a second, so it stays fast.
 */
export const REQUIRED_CONFIRMATIONS = 2;

/**
 * Frame-agreement gate. Pure and stateful by design, so it can be tested without a camera:
 * `state` is `{ code, count }` from the previous frame, and the result carries the next state
 * plus whether the code may now be accepted.
 *
 * Any different code resets the count, so a real barcode that is briefly misread as something
 * else simply needs one more agreeing frame rather than being abandoned.
 */
export function confirmScan(state, code) {
  const count = (state && state.code === code ? state.count : 0) + 1;
  return { state: { code, count }, accept: count >= REQUIRED_CONFIRMATIONS };
}

/** State for the gate before any code has been seen. */
export const EMPTY_CONFIRMATION = { code: '', count: 0 };
