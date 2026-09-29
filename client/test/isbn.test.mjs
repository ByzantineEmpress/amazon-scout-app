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

function assertTrue(value, label) {
  if (value !== true) throw new Error(`${label}: expected true, got ${JSON.stringify(value)}`);
}

// isbn.js has no imports, so the source can be evaluated directly after dropping `export`.
const source = fs.readFileSync(path.join(here, '..', 'src', 'services', 'isbn.js'), 'utf8');
const {
  isbn10to13, isbn13to10, normalizeBarcode,
  isbn10CheckDigit, isValidIsbn10, isValidIsbn13, isValidIsbn, pickBestIsbn, extractIsbnCandidates
} = new Function(
  `${source.replace(/^export /gm, '')}
return {
  isbn10to13, isbn13to10, normalizeBarcode,
  isbn10CheckDigit, isValidIsbn10, isValidIsbn13, isValidIsbn, pickBestIsbn, extractIsbnCandidates
};`
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

// --- ISBN-10 validation: mod-11 and the letter -------------------------------

test('the ISBN-10 check digit is X when mod-11 produces 10', () => {
  assertEqual(isbn10CheckDigit('043942089'), 'X', 'check digit');
  assertEqual(isbn10CheckDigit('013235088'), '2', 'ordinary digit');
});

test('valid ISBN-10s are accepted, including an X check digit', () => {
  assertTrue(isValidIsbn10('043942089X'), '043942089X');
  assertTrue(isValidIsbn10('0132350882'), '0132350882');
  assertTrue(isValidIsbn10('0743273567'), '0743273567');
});

test('a wrong check digit or wrong length is rejected', () => {
  assertEqual(isValidIsbn10('0439420890'), false, 'X expected, digit given');
  assertEqual(isValidIsbn10('0132350881'), false, 'off by one');
  assertEqual(isValidIsbn10('043942089'), false, 'nine characters');
  assertEqual(isValidIsbn10('04394208912'), false, 'eleven characters');
});

test('an X anywhere but the last position is invalid', () => {
  assertEqual(isValidIsbn10('0439X2089X'), false, 'X in the middle');
  assertEqual(isValidIsbn10('X439420892'), false, 'X at the front');
});

// --- ISBN-13 validation ------------------------------------------------------

test('valid ISBN-13s are accepted', () => {
  assertTrue(isValidIsbn13('9780439420891'), '9780439420891');
  assertTrue(isValidIsbn13('9780132350884'), '9780132350884');
});

test('a valid EAN-13 that is not a book is not an ISBN', () => {
  // 4006381333931 is a well-formed EAN-13 (body sums to 89 -> check 1) but has no 978/979
  // Bookland prefix, so it is a product code, not a book number.
  assertEqual(isValidIsbn13('4006381333931'), false, 'non-book prefix');
  assertEqual(isValidIsbn13('9780132350885'), false, 'bad check digit');
  assertEqual(isValidIsbn('4006381333931'), false, 'neither form');
});

// --- finding an ISBN in photographed text ------------------------------------

test('a bare ISBN-13 is found', () => {
  assertEqual(JSON.stringify(extractIsbnCandidates('9780439420891')), JSON.stringify(['9780439420891']), 'found');
});

test('a hyphenated ISBN-10 ending in X is found', () => {
  assertEqual(JSON.stringify(extractIsbnCandidates('ISBN 0-439-42089-X')), JSON.stringify(['043942089X']), 'found');
});

test('a labelled ISBN-13 is found', () => {
  assertEqual(JSON.stringify(extractIsbnCandidates('ISBN-13: 978-0-439-42089-1')), JSON.stringify(['9780439420891']), 'found');
});

test('an ISBN printed beside its price add-on is still found', () => {
  assertEqual(JSON.stringify(extractIsbnCandidates('9780439420891 51999')), JSON.stringify(['9780439420891']), 'found');
});

test('two ISBNs on one page are both found, in reading order', () => {
  const text = 'ISBN 0-439-42089-X\nISBN-13: 978-0-439-42089-1';
  assertEqual(JSON.stringify(extractIsbnCandidates(text)), JSON.stringify(['043942089X', '9780439420891']), 'both');
});

test('a misread digit yields nothing rather than a wrong number', () => {
  // One digit of a real ISBN changed: the check digit no longer agrees, so it is dropped.
  assertEqual(extractIsbnCandidates('9780439420895').length, 0, 'nothing accepted');
});

test('text without an ISBN yields nothing', () => {
  assertEqual(extractIsbnCandidates('THE GREAT GATSBY').length, 0, 'no digits');
  assertEqual(extractIsbnCandidates('Call 555-1234 for details').length, 0, 'phone number');
  assertEqual(extractIsbnCandidates('').length, 0, 'empty');
  assertEqual(extractIsbnCandidates(null).length, 0, 'null');
  assertEqual(extractIsbnCandidates(undefined).length, 0, 'undefined');
});

// --- choosing which number to shop with --------------------------------------

test('the check-digit-valid 978 ISBN-13 wins', () => {
  // A non-book EAN and an ISBN-10 are also present, as OpenLibrary data often has.
  assertEqual(pickBestIsbn(['043942089X', '9780439420891', '4006381333931']), '9780439420891', 'chosen');
});

test('a corrupt 13-digit number loses to a valid ISBN-10', () => {
  // 9780439420895 fails its check digit, so the validated ISBN-10 is the safer choice.
  assertEqual(pickBestIsbn(['9780439420895', '043942089X']), '043942089X', 'chosen');
});

test('a well-shaped but unvalidated 13-digit number is still usable', () => {
  // Falls back to shape when nothing validates, so imperfect source data still works.
  assertEqual(pickBestIsbn(['9780439420895']), '9780439420895', 'chosen');
  assertEqual(pickBestIsbn(['0439420890']), null, 'invalid ISBN-10 with no 13-digit fallback');
});

test('nothing usable returns null', () => {
  assertEqual(pickBestIsbn([]), null, 'empty');
  assertEqual(pickBestIsbn(null), null, 'null');
  assertEqual(pickBestIsbn(['', 'nonsense']), null, 'junk');
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
