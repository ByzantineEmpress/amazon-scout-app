/**
 * Tests for the ISBN conversion helpers - the maths that decides which Amazon ASIN is looked up.
 *
 * The vectors are hand-verified rather than produced by the code under test:
 *
 *   043942089X   ISBN-10, mod-11 sum = 209 = 19 x 11, so the check digit really is X
 *   9780439420891  its ISBN-13 (a real catalogued book; body 978043942089 sums to 109 -> check 1)
 *   0132350882   ISBN-10 "Clean Code"
 *   9780132350884  its ISBN-13 (body 978013235088 sums to 96 -> check 4)
 *   0743273567   ISBN-10 "The Great Gatsby"
 *   9780743273565  its ISBN-13 (body 978074327356 sums to 105 -> check 5)
 *
 * Run from the repository root:  npm test
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
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

// isbn.js has no imports, so the source can be evaluated directly after dropping `export`.
const source = fs.readFileSync(path.join(here, '..', 'src', 'services', 'isbn.js'), 'utf8');
const { isbn10to13, isbn13to10, normalizeBarcode } = new Function(
  `${source.replace(/^export /gm, '')}\nreturn { isbn10to13, isbn13to10, normalizeBarcode };`
)();

console.log('\nisbn.js\n');

// --- the letter case this exists for ----------------------------------------

test('an ISBN-10 ending in X converts to the right ISBN-13', () => {
  assertEqual(isbn10to13('043942089X'), '9780439420891', 'ISBN-13');
});

test('an ISBN-13 converts back to an ISBN-10 ending in X', () => {
  // This is the value that becomes the Amazon ASIN for a physical book.
  assertEqual(isbn13to10('9780439420891'), '043942089X', 'ISBN-10');
});

test('the X survives a full round trip', () => {
  const isbn13 = '9780439420891';
  assertEqual(isbn10to13(isbn13to10(isbn13)), isbn13, 'round trip');
});

// --- ordinary numeric ISBNs --------------------------------------------------

test('known ISBN pairs convert correctly', () => {
  assertEqual(isbn13to10('9780132350884'), '0132350882', 'Clean Code ISBN-10');
  assertEqual(isbn13to10('9780743273565'), '0743273567', 'Great Gatsby ISBN-10');
  assertEqual(isbn10to13('0132350882'), '9780132350884', 'Clean Code ISBN-13');
  assertEqual(isbn10to13('0743273567'), '9780743273565', 'Great Gatsby ISBN-13');
});

test('every 978 ISBN-13 survives a round trip', () => {
  for (const isbn13 of ['9780132350884', '9780743273565', '9780439420891']) {
    assertEqual(isbn13to10(isbn13), isbn13to10(isbn13), `${isbn13} deterministic`);
    assertEqual(isbn10to13(isbn13to10(isbn13)), isbn13, `${isbn13} round trip`);
  }
});

// --- inputs with no ISBN-10 equivalent --------------------------------------

test('a 979-prefixed ISBN-13 has no ISBN-10 form', () => {
  // 979 titles sit outside the ISBN-10 range entirely, so there is no ASIN to derive.
  assertEqual(isbn13to10('9791234567890'), null, 'result');
});

test('malformed input does not produce a bogus conversion', () => {
  assertEqual(isbn13to10('12345678901'), null, 'too short');
  assertEqual(isbn13to10(''), null, 'empty');
  assertEqual(isbn10to13('abc'), 'abc', 'unchanged when not a 10-character ISBN');
});

// --- normalization -----------------------------------------------------------

test('a hyphenated barcode normalizes to bare digits', () => {
  assertEqual(normalizeBarcode('978-0-439-42089-1'), '9780439420891', 'digits');
});

test('normalization keeps the X and upper-cases it', () => {
  // Needed for Manual Entry, where someone types the printed ISBN-10.
  assertEqual(normalizeBarcode('0-439-42089-x'), '043942089X', 'preserved');
  assertEqual(normalizeBarcode('043942089X'), '043942089X', 'already upper case');
});

test('normalization of nothing is empty, not a crash', () => {
  assertEqual(normalizeBarcode(''), '', 'empty string');
  assertEqual(normalizeBarcode(null), '', 'null');
  assertEqual(normalizeBarcode(undefined), '', 'undefined');
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
