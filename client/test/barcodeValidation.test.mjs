/**
 * Tests for the scanner validation layer.
 *
 * The check-digit vectors below are worked out by hand rather than by calling the function
 * under test, so they genuinely cross-check the implementation:
 *
 *   9780132350884   ISBN-13 "Clean Code"        body 978013235088, weights 3,1 from the right sum to 96  -> 4
 *   9780743273565   ISBN-13 "The Great Gatsby"  body 978074327356, sum 105                              -> 5
 *   036000291452    standard UPC-A sample       body 03600029145, sum 58                               -> 2
 *   12345670        synthetic EAN-8             body 1234567, sum 60                                   -> 0
 *   12345678901231  synthetic ITF-14            body 1234567890123, sum 109                           -> 1
 *
 * Run from the repository root:  npm test
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, label) {
  if (value !== true) throw new Error(`${label}: expected true, got ${JSON.stringify(value)}`);
}

function assertFalse(value, label) {
  if (value !== false) throw new Error(`${label}: expected false, got ${JSON.stringify(value)}`);
}

// barcodeValidation.js is an ES module and client/package.json has no "type": "module", so
// Node would parse it as CommonJS. Same loader approach as the other suites: read the source,
// drop the `export` keywords, and evaluate it.
const fs = require('fs');
const source = fs.readFileSync(
  path.join(here, '..', 'src', 'services', 'barcodeValidation.js'),
  'utf8'
);
const mod = new Function(`${source.replace(/^export /gm, '')}\nreturn {
  SCANNER_BARCODE_TYPES, DEFAULT_SCANNER_BARCODE_TYPES, gs1CheckDigit, isValidProductCode,
  validateScannedCode, normalizeBarcode, sameBounds, REQUIRED_CONFIRMATIONS, CONFIRM_WINDOW_MS,
  BOUNDS_TOLERANCE, confirmScan, EMPTY_CONFIRMATION
};`)();

const {
  SCANNER_BARCODE_TYPES, DEFAULT_SCANNER_BARCODE_TYPES, gs1CheckDigit, isValidProductCode,
  validateScannedCode, normalizeBarcode, sameBounds, REQUIRED_CONFIRMATIONS, CONFIRM_WINDOW_MS,
  BOUNDS_TOLERANCE, confirmScan, EMPTY_CONFIRMATION
} = mod;

console.log('\nbarcodeValidation.js\n');

// --- enabled symbologies -----------------------------------------------------

test('every enabled symbology is a real expo-camera BarcodeType', () => {
  // From https://docs.expo.dev/versions/v57.0.0/sdk/camera/ (BarcodeType enum). A typo here
  // would silently stop that symbology from ever being detected.
  const supported = [
    'aztec', 'ean13', 'ean8', 'qr', 'pdf417', 'upc_e', 'datamatrix',
    'code39', 'code93', 'itf14', 'codabar', 'code128', 'upc_a'
  ];
  for (const type of SCANNER_BARCODE_TYPES) {
    if (!supported.includes(type)) throw new Error(`"${type}" is not a supported BarcodeType`);
  }
});

test('symbologies that caused false reads are not enabled', () => {
  for (const type of ['qr', 'code39', 'code128', 'pdf417', 'aztec', 'datamatrix']) {
    if (SCANNER_BARCODE_TYPES.includes(type)) {
      throw new Error(`${type} should not be scanned: it is not a product barcode`);
    }
  }
});

test('the full product set includes ITF-14 (case/carton codes)', () => {
  // ITF-14 is available (for multi-packs) but excluded from the default scan set.
  const expected = ['ean13', 'ean8', 'upc_a', 'itf14'];
  assertEqual(JSON.stringify(SCANNER_BARCODE_TYPES), JSON.stringify(expected), 'full set');
});

test('the default scan set excludes ITF-14 (case codes are noise)', () => {
  // Case/carton codes are the "scanned a case, got the wrong item" class of false read, so they
  // are off by default and toggled in Settings.
  const expected = ['ean13', 'ean8', 'upc_a'];
  assertEqual(JSON.stringify(DEFAULT_SCANNER_BARCODE_TYPES), JSON.stringify(expected), 'default set');
  assertFalse(DEFAULT_SCANNER_BARCODE_TYPES.includes('itf14'), 'ITF-14 in default set');
});

// --- check digits ------------------------------------------------------------

test('check digits match hand-computed values', () => {
  assertEqual(gs1CheckDigit('978013235088'), 4, 'Clean Code ISBN-13 body');
  assertEqual(gs1CheckDigit('978074327356'), 5, 'Great Gatsby ISBN-13 body');
  assertEqual(gs1CheckDigit('03600029145'), 2, 'UPC-A sample body');
  assertEqual(gs1CheckDigit('1234567'), 0, 'EAN-8 body');
  assertEqual(gs1CheckDigit('1234567890123'), 1, 'ITF-14 body');
});

test('valid codes of every supported length are accepted', () => {
  for (const code of ['12345670', '036000291452', '9780132350884', '12345678901231']) {
    assertTrue(isValidProductCode(code), `${code} (${code.length} digits)`);
  }
});

test('a single wrong digit fails the check', () => {
  for (const code of ['12345671', '036000291453', '9780132350885', '9780743273566']) {
    assertEqual(isValidProductCode(code), false, code);
  }
});

test('non-numeric and wrong-length input is not a product code', () => {
  for (const code of ['ABC123456789', '97801323508X4', '12345', '123456789', '', '9780132350884 ']) {
    assertEqual(isValidProductCode(code), false, JSON.stringify(code));
  }
});

// --- the QR / text case that caused the bug ---------------------------------

test('a QR code URL is rejected, not mined for digits', () => {
  // normalizeBarcode would strip the letters and punctuation and leave "1234567890123",
  // which looks like a barcode. It must never reach a lookup.
  const verdict = validateScannedCode('https://www.example.com/p/1234567890123');
  assertEqual(verdict.ok, false, 'ok');
  assertEqual(verdict.reason, 'not-numeric', 'reason');
});

test('a Code 39 asset tag is rejected, not truncated to its digits', () => {
  const verdict = validateScannedCode('ABC123456789');
  assertEqual(verdict.ok, false, 'ok');
  assertEqual(verdict.reason, 'not-numeric', 'reason');
});

test('surrounding whitespace does not defeat a real barcode', () => {
  const verdict = validateScannedCode('  9780132350884  ');
  assertEqual(verdict.ok, true, 'ok');
  assertEqual(verdict.code, '9780132350884', 'code');
});

test('a plausible-length misread with a bad check digit is rejected', () => {
  assertEqual(validateScannedCode('9780132350885').reason, 'check-digit', 'reason');
});

test('implausible lengths are rejected with the length reported', () => {
  assertEqual(validateScannedCode('12345').reason, 'unexpected-length-5', 'reason');
  assertEqual(validateScannedCode('').reason, 'empty', 'reason');
});

// --- price add-ons on book barcodes -----------------------------------------

test('a book barcode with an add-on glued on still resolves to the ISBN', () => {
  // Books often carry a 2- or 5-digit price add-on beside the main barcode, and some platforms
  // report the two concatenated. The ISBN itself must still come through.
  const five = validateScannedCode('978043942089199999');
  assertEqual(five.ok, true, '13+5 ok');
  assertEqual(five.code, '9780439420891', '13+5 code');

  const two = validateScannedCode('978043942089199');
  assertEqual(two.ok, true, '13+2 ok');
  assertEqual(two.code, '9780439420891', '13+2 code');
});

test('a real ITF-14 is kept whole, not truncated to a UPC-A plus add-on', () => {
  // 14 digits is a genuine symbology length, so the full code must be validated as-is.
  const verdict = validateScannedCode('12345678901231');
  assertEqual(verdict.ok, true, 'ok');
  assertEqual(verdict.code, '12345678901231', 'code');
});

test('a 13-digit code is never truncated to a valid 12-digit prefix', () => {
  // "978013235088" is itself a valid UPC-A, so a rule of "strip any trailing digits" would
  // accept this bad EAN as that UPC-A plus a 1-digit add-on - looking up the wrong product.
  // Add-ons are only 2 or 5 digits, so the tail must be rejected.
  const verdict = validateScannedCode('9780132350885');
  assertEqual(verdict.ok, false, 'ok');
  assertEqual(verdict.reason, 'check-digit', 'reason');
});

// --- spatial stability (sameBounds) ------------------------------------------

test('identical bounds are the same place', () => {
  const b = { x: 100, y: 200, width: 50, height: 30 };
  assertTrue(sameBounds(b, { ...b }), 'identical');
});

test('a few-pixel drift is still the same place', () => {
  const a = { x: 100, y: 200, width: 50, height: 30 };
  const b = { x: 104, y: 203, width: 52, height: 31 };
  assertTrue(sameBounds(a, b), 'small drift');
});

test('a different barcode elsewhere in the frame is a different place', () => {
  const a = { x: 100, y: 200, width: 50, height: 30 };
  const b = { x: 400, y: 600, width: 50, height: 30 };
  assertFalse(sameBounds(a, b), 'far apart');
});

test('a missing box cannot confirm the same place', () => {
  const a = { x: 100, y: 200, width: 50, height: 30 };
  assertFalse(sameBounds(a, null), 'null b');
  assertFalse(sameBounds(null, a), 'null a');
});

test('a larger box that shares the same anchor is still the same place', () => {
  // The tolerance is relative to the larger box, so a 3x box that shares the same top-left corner
  // still counts as "the same barcode in the same place." The spatial gate exists to reject a
  // *different* barcode elsewhere in the frame (tested above), not to distinguish a barcode
  // from a slightly larger reading of itself.
  const a = { x: 100, y: 200, width: 50, height: 30 };
  const b = { x: 100, y: 200, width: 150, height: 90 };
  assertTrue(sameBounds(a, b), '3x box sharing anchor');
});

test('a larger box shifted far away is a different place', () => {
  // The anchor delta must stay within the larger box's tolerance; a 3x box moved a full box-width
  // away does not.
  const a = { x: 100, y: 200, width: 50, height: 30 };
  const b = { x: 250, y: 200, width: 150, height: 90 };
  assertFalse(sameBounds(a, b), '3x box shifted far');
});

// --- frame agreement (time-windowed, spatially stable) ------------------------

test('one frame is not enough', () => {
  const first = confirmScan(EMPTY_CONFIRMATION, '9780132350884', 1000);
  assertEqual(first.accept, false, 'accepted on the first frame');
  assertEqual(first.state.code, '9780132350884', 'state code');
  assertEqual(first.state.count, 1, 'state count');
});

test('the third agreeing frame within the window accepts', () => {
  assertEqual(REQUIRED_CONFIRMATIONS, 3, 'required confirmations');
  const a = confirmScan(EMPTY_CONFIRMATION, '9780132350884', 1000);
  const b = confirmScan(a.state, '9780132350884', 1200);
  const c = confirmScan(b.state, '9780132350884', 1400);
  assertEqual(a.accept, false, 'frame 1');
  assertEqual(b.accept, false, 'frame 2');
  assertEqual(c.accept, true, 'frame 3');
  assertEqual(c.code, '9780132350884', 'accepted code');
});

test('frames outside the window do not confirm', () => {
  // A code seen, then the user moves away, then comes back: the gap exceeds the window, so the
  // count restarts and the late frames never add to the early ones.
  const a = confirmScan(EMPTY_CONFIRMATION, '9780132350884', 1000);
  const late = confirmScan(a.state, '9780132350884', 1000 + CONFIRM_WINDOW_MS + 100);
  assertEqual(late.accept, false, 'accepted across the window');
  assertEqual(late.state.count, 1, 'count restarted');
});

test('a steady misread that never leaves the window still needs three frames', () => {
  // The old two-frame gate accepted a steady misread after two consecutive reports. The new
  // three-frame gate requires three, so a single intermittent correct read in the middle does
  // not defeat it.
  let state = EMPTY_CONFIRMATION;
  let accepted = false;
  const frames = [
    ['9780132350885', 1000], // misread
    ['9780132350885', 1100], // misread
    ['9780132350884', 1200], // one correct read
    ['9780132350885', 1300], // misread again
    ['9780132350885', 1400]  // misread
  ];
  for (const [code, t] of frames) {
    const step = confirmScan(state, code, t);
    state = step.state;
    if (step.accept) accepted = true;
  }
  assertFalse(accepted, 'accepted an intermittent-correct sequence');
});

test('a steady second barcode in the frame is rejected by the spatial gate', () => {
  // Two barcodes in the frame: the main one (correct code, stable position) and a case code
  // (different code, different position). The case code never agrees in place, so it never
  // confirms even if it is steady.
  const main = { x: 100, y: 200, width: 50, height: 30 };
  const case_ = { x: 400, y: 600, width: 50, height: 30 };
  let state = EMPTY_CONFIRMATION;
  let acceptedCase = false;
  for (let i = 0; i < 5; i++) {
    // Alternate main and case so neither runs up to three in a row in the same place.
    const stepMain = confirmScan(state, '9780132350884', 1000 + i * 100, main);
    state = stepMain.state;
    const stepCase = confirmScan(state, '12345678901231', 1000 + i * 100 + 50, case_);
    state = stepCase.state;
    if (stepCase.accept) acceptedCase = true;
  }
  assertFalse(acceptedCase, 'case code confirmed');
});

test('a different code restarts the count rather than blocking', () => {
  const first = confirmScan(EMPTY_CONFIRMATION, '9780132350884', 1000);
  const other = confirmScan(first.state, '036000291452', 1200);
  assertEqual(other.accept, false, 'accepted');
  assertEqual(other.state.count, 1, 'count restarted');
  const back = confirmScan(other.state, '9780132350884', 1400);
  assertEqual(back.accept, false, 'should need three agreeing frames again');
  assertEqual(back.state.count, 1, 'count is one, not carried over');
});

console.log('');
if (failures.length === 0) {
  console.log(`PASS: ${passed} passed\n`);
} else {
  console.log(`FAIL: ${failures.length} failed, ${passed} passed\n`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log('');
  process.exitCode = 1;
}
