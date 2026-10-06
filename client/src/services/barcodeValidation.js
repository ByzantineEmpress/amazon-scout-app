/**
 * Scanner validation: what counts as a real product barcode, and when a scan is accepted.
 *
 * A code is only accepted after it has been read correctly in a run of frames. A single misread
 * breaks the check digit, so the checksum does most of the work; the frame agreement layer is
 * what catches the ~10% of misreads that happen to pass it, and the time-windowed, spatially
 * stable gate that lives on top of that is what stops a steady misread (or a steady *other*
 * barcode in the frame) from ever being accepted.
 *
 * This module has no imports on purpose: the test files load it by reading the source and
 * stripping the `export` keywords, which only works while it stays self-contained.
 */

/**
 * Symbologies the live scanner is allowed to report.
 *
 * Only retail product barcodes: EAN-13 (international / most books), EAN-8, UPC-A, and ITF-14
 * (the 14-digit case/carton code on multi-packs and retail boxes).
 *
 * Code 39 and Code 128 are deliberately absent: they are the symbology of asset tags, shelf
 * labels and internal stock marks, and a camera pointed at a shelf of them will report them
 * just as readily as product barcodes. QR / PDF417 / Aztec / Data Matrix encode text, not
 * barcodes, and the moment one of them is enabled a URL or a Wi-Fi payload becomes a "plausible
 * barcode".
 *
 * The default set excludes ITF-14 (see DEFAULT_SCANNER_BARCODE_TYPES below) because case
 * barcodes are usually noise for a reseller scanning individual items. ITF-14 is available as a
 * setting, not a default.
 */
export const SCANNER_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'itf14'];

/**
 * The symbologies enabled by default. ITF-14 is excluded: case/carton codes on multi-packs and
 * retail boxes are the "scanned a case, got the wrong item" class of false read, and they are
 * almost never what a reseller is scouting.
 */
export const DEFAULT_SCANNER_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a'];

/**
 * How many agreeing frames, within the confirmation window, are required before a code is
 * accepted. Two is the minimum that survives a single-frame misread; three (the default) is
 * what stops a steady misread or a steady second barcode in the frame.
 */
export const REQUIRED_CONFIRMATIONS = 3;

/** The confirmation window in ms. A code must agree `REQUIRED_CONFIRMATIONS` times inside this
 *  window or the count resets. The window is wide enough to cover a normal hold-still scan and
 *  narrow enough that a code the user has clearly moved away from is not silently carried over. */
export const CONFIRM_WINDOW_MS = 2500;

/**
 * The fraction of a frame the two bounding boxes may differ in (width and height) and still
 * count as "the same barcode in the same place." A real held-still scan drifts by a few pixels;
 * a different barcode elsewhere in the frame moves by a lot.
 */
export const BOUNDS_TOLERANCE = 0.15;

const CHECK_DIGIT_BASE = 10;

/**
 * Strip everything that is not a digit. A real product barcode is always numeric, so any letter
 * (a QR payload, a Code 39 asset tag, an ASIN) makes the code unscannable by design.
 */
export function normalizeBarcode(raw) {
  return String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
}

/**
 * The GS1 / UPC / EAN check digit for a code body (everything except the final digit).
 * Even positions count 3x, odd positions count 1x, read from the right.
 */
export function gs1CheckDigit(body) {
  const digits = String(body).split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const positionFromRight = digits.length - i; // 1-indexed from the right
    const weight = positionFromRight % 2 === 1 ? 3 : 1;
    sum += (digits[i] || 0) * weight;
  }
  return (CHECK_DIGIT_BASE - (sum % CHECK_DIGIT_BASE)) % CHECK_DIGIT_BASE;
}

/**
 * True when the full code's last digit matches its GS1 check digit.
 */
function checkDigitValid(code) {
  if (code.length < 2) return false;
  return Number(code[code.length - 1]) === gs1CheckDigit(code.slice(0, -1));
}

/**
 * A valid product code is 8, 12, 13 or 14 digits and passes its check digit.
 */
export function isValidProductCode(code) {
  if (!/^\d{8,14}$/.test(String(code || ''))) return false;
  return checkDigitValid(String(code));
}

/**
 * Decide whether a single scanned string is a real product code, and return the exact digits to
 * look up. Returns `{ ok, code, reason }`.
 *
 * The rules, in order:
 *  1. It must be numeric after stripping. Anything with a letter is not a product barcode.
 *  2. It must be a plausible length (8/12/13/14) or an EAN-13 with a 2/5-digit add-on.
 *  3. It must pass the GS1 check digit.
 *
 * The add-on rule only fires on a 15/16/17/18-digit string whose first 13 digits are a valid
 * EAN-13. This is deliberately narrow: a 13-digit string that is itself a valid UPC-A is *not*
 * truncated, because that would accept a bad EAN as a UPC-A plus a 1-digit add-on (the bug from
 * v1.0.x where a misread EAN-13 looked up the wrong product).
 */
export function validateScannedCode(raw) {
  const digits = normalizeBarcode(raw);
  if (!digits) return { ok: false, reason: 'empty' };
  if (/[a-z]/i.test(String(raw))) return { ok: false, reason: 'not-numeric' };

  const n = digits.length;

  // Direct hit: a known product-code length that passes its check digit.
  if (n === 8 || n === 12 || n === 13 || n === 14) {
    if (checkDigitValid(digits)) return { ok: true, code: digits };
    return { ok: false, reason: 'check-digit' };
  }

  // EAN-13 + 2/5-digit add-on: the first 13 digits must themselves be a valid EAN-13.
  if ((n === 15 || n === 18) && checkDigitValid(digits.slice(0, 13))) {
    return { ok: true, code: digits.slice(0, 13) };
  }
  if ((n === 16 || n === 17) && checkDigitValid(digits.slice(0, 13))) {
    // 13 + 3 or 13 + 4 is not a real add-on, but the first 13 still must be a valid EAN-13 to
    // be accepted at all; otherwise it is an unexpected length.
    if (checkDigitValid(digits.slice(0, 13))) return { ok: true, code: digits.slice(0, 13) };
    return { ok: false, reason: `unexpected-length-${n}` };
  }

  return { ok: false, reason: `unexpected-length-${n}` };
}

/**
 * True when two bounding boxes are close enough to be "the same barcode in the same place."
 * Each box is `{ x, y, width, height }`. A missing box on either side is treated as "cannot
 * confirm" (false), because the spatial gate exists to reject, not to guess.
 */
export function sameBounds(a, b, tolerance = BOUNDS_TOLERANCE) {
  if (!a || !b) return false;
  const maxW = Math.max(a.width || 0, b.width || 0);
  const maxH = Math.max(a.height || 0, b.height || 0);
  const dx = Math.abs((a.x || 0) - (b.x || 0));
  const dy = Math.abs((a.y || 0) - (b.y || 0));
  return dx <= maxW * tolerance && dy <= maxH * tolerance;
}

/**
 * The empty confirmation state.
 */
export const EMPTY_CONFIRMATION = {
  code: null,
  count: 0,
  firstAt: null,
  bounds: null
};

/**
 * Fold one scanned frame into the confirmation state.
 *
 * A frame *agrees* with the running state when:
 *  - the code is the same,
 *  - it was seen within `CONFIRM_WINDOW_MS` of the first frame of the run, and
 *  - (when bounds are available) it is in the same place as the first frame.
 *
 * When it agrees, the count increments; when it does not, the run restarts at this frame. A code
 * is accepted once the count reaches `REQUIRED_CONFIRMATIONS`.
 *
 * Returns `{ accept, code, state }`. `accept` is true exactly once, on the frame that completes
 * the run.
 */
export function confirmScan(state, code, now, bounds) {
  const s = state || EMPTY_CONFIRMATION;

  const inWindow =
    s.firstAt !== null &&
    now !== undefined &&
    now - s.firstAt <= CONFIRM_WINDOW_MS;

  const samePlace =
    s.bounds == null || bounds == null || sameBounds(s.bounds, bounds);

  if (s.code === code && inWindow && samePlace) {
    const count = s.count + 1;
    const accepted = count >= REQUIRED_CONFIRMATIONS;
    return {
      accept: accepted,
      code,
      state: accepted
        ? EMPTY_CONFIRMATION
        : { code, count, firstAt: s.firstAt, bounds: s.bounds }
    };
  }

  // New run: this frame is the first of a fresh sequence.
  return {
    accept: false,
    code,
    state: {
      code,
      count: 1,
      firstAt: now === undefined ? null : now,
      bounds: bounds || null
    }
  };
}
