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

// barcodeValidation.js is an ES module and client/package.json has no "type": "module", so
// Node would parse it as CommonJS. Same loader approach as the other suites: read the source,
// drop the `export` keywords, and evaluate it.
const fs = require('fs');
const source = fs.readFileSync(
  path.join(here, '..', 'src', 'services', 'barcodeValidation.js'),
  'utf8'
);
const mod = new Function(`${source.replace(/^export /gm, '')}
return {
  SCANNER_BARCODE_TYPES, gs1CheckDigit, isValidProductCode, validateScannedCode,
  REQUIRED_CONFIRMATIONS, confirmScan, EMPTY_CONFIRMATION
};`)();

const {
  SCANNER_BARCODE_TYPES, gs1CheckDigit, isValidProductCode, validateScannedCode,
  REQUIRED_CONFIRMATIONS, confirmScan, EMPTY_CONFIRMATION
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

test('only product symbologies remain enabled', () => {
  const expected = ['ean13', 'ean8', 'upc_a', 'itf14'];
  assertEqual(JSON.stringify(SCANNER_BARCODE_TYPES), JSON.stringify(expected), 'enabled types');
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

// --- frame agreement ---------------------------------------------------------

test('one frame is not enough', () => {
  const first = confirmScan(EMPTY_CONFIRMATION, '9780132350884');
  assertEqual(first.accept, false, 'accepted on the first frame');
  assertEqual(first.state.code, '9780132350884', 'state code');
  assertEqual(first.state.count, 1, 'state count');
});

test('a second agreeing frame accepts', () => {
  const first = confirmScan(EMPTY_CONFIRMATION, '9780132350884');
  const second = confirmScan(first.state, '9780132350884');
  assertEqual(second.accept, true, 'accepted');
  assertEqual(REQUIRED_CONFIRMATIONS, 2, 'required confirmations');
});

test('alternating codes never confirm', () => {
  let state = EMPTY_CONFIRMATION;
  let accepted = false;
  for (const code of ['9780132350884', '9780132350885', '9780132350884', '9780132350885']) {
    const step = confirmScan(state, code);
    state = step.state;
    if (step.accept) accepted = true;
  }
  assertEqual(accepted, false, 'accepted an alternating sequence');
});

test('a different code restarts the count rather than blocking', () => {
  const first = confirmScan(EMPTY_CONFIRMATION, '9780132350884');
  const other = confirmScan(first.state, '036000291452');
  assertEqual(other.accept, false, 'accepted');
  assertEqual(other.state.count, 1, 'count restarted');
  const back = confirmScan(other.state, '9780132350884');
  assertEqual(back.accept, false, 'should need two agreeing frames again');
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
