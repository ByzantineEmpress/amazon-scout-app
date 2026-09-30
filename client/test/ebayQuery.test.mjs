/**
 * Tests for the eBay comps query builder.
 *
 * This decides what gets searched on eBay, and eBay ANDs every term, so an over-long query
 * silently returns no comps at all - the exact failure this module was written to fix. The
 * vectors below are the shapes real catalogue titles and author strings arrive in.
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

// ebayQuery.js has no imports, so its source can be evaluated after dropping `export`.
const source = fs.readFileSync(path.join(here, '..', 'src', 'services', 'ebayQuery.js'), 'utf8');
const { cleanTitleForSearch, authorSurname, buildEbayQuery } = new Function(
  `${source.replace(/^export /gm, '')}\nreturn { cleanTitleForSearch, authorSurname, buildEbayQuery };`
)();

console.log('\nebayQuery.js\n');

// --- title cleaning ----------------------------------------------------------

test('a subtitle is dropped, because sellers rarely type it', () => {
  assertEqual(
    cleanTitleForSearch('Clean Code: A Handbook of Agile Software Craftsmanship'),
    'Clean Code',
    'subtitle removed'
  );
});

test('series and format asides are dropped', () => {
  assertEqual(
    cleanTitleForSearch('Harry Potter and the Chamber of Secrets (Harry Potter, #2)'),
    'Harry Potter and the Chamber of Secrets',
    'parenthetical removed'
  );
  assertEqual(cleanTitleForSearch('The Lord of the Rings [DVD]'), 'The Lord of the Rings', 'bracket removed');
  assertEqual(cleanTitleForSearch('Star Wars - Book 2 of the Thrawn Trilogy'), 'Star Wars', 'series tail removed');
});

test('a plain title is left alone', () => {
  assertEqual(cleanTitleForSearch('Dune'), 'Dune', 'unchanged');
  assertEqual(cleanTitleForSearch('  Spaced   Out  '), 'Spaced Out', 'whitespace collapsed');
});

test('a colon in a very short title is kept', () => {
  // "Up: A Novel" - the prefix is too short to be a reliable title on its own.
  assertEqual(cleanTitleForSearch('Up: A Novel'), 'Up: A Novel', 'kept');
  assertEqual(cleanTitleForSearch('A: B'), 'A: B', 'kept');
});

test('accented letters survive', () => {
  assertEqual(cleanTitleForSearch('Café Society: A Novel'), 'Café Society', 'accent kept');
});

test('nothing in gives nothing out', () => {
  assertEqual(cleanTitleForSearch(''), '', 'empty');
  assertEqual(cleanTitleForSearch(null), '', 'null');
  assertEqual(cleanTitleForSearch(undefined), '', 'undefined');
  assertEqual(cleanTitleForSearch('   '), '', 'blank');
});

// --- author surname ----------------------------------------------------------

test('the surname is taken when the author is written first-name-first', () => {
  assertEqual(authorSurname('F. Scott Fitzgerald'), 'Fitzgerald', 'Fitzgerald');
  assertEqual(authorSurname('J.K. Rowling'), 'Rowling', 'Rowling');
  assertEqual(authorSurname('Ursula K. Le Guin'), 'Guin', 'last word');
});

test('the surname is taken when the author is written surname-first', () => {
  assertEqual(authorSurname('Rowling, J.K.'), 'Rowling', 'comma form');
  assertEqual(authorSurname('Martin, Robert C.'), 'Martin', 'comma form');
});

test('accents survive in names', () => {
  assertEqual(authorSurname('Gabriel García Márquez'), 'Márquez', 'accented');
});

test('too little to go on yields nothing rather than a guess', () => {
  assertEqual(authorSurname('A. B.'), '', 'initials only');
  assertEqual(authorSurname(''), '', 'empty');
  assertEqual(authorSurname(null), '', 'null');
  assertEqual(authorSurname('   '), '', 'blank');
});

test('a short but real surname is kept', () => {
  assertEqual(authorSurname('Harper Lee'), 'Lee', 'three letters');
});

// --- the query ---------------------------------------------------------------

test('a book is searched as title plus author surname', () => {
  assertEqual(
    buildEbayQuery({
      title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
      author: 'Robert C. Martin'
    }),
    'Clean Code Martin',
    'query'
  );
  assertEqual(
    buildEbayQuery({ title: 'Dune', author: 'Frank Herbert' }),
    'Dune Herbert',
    'query'
  );
});

test('a book with no author is searched by title alone', () => {
  assertEqual(buildEbayQuery({ title: 'Dune' }), 'Dune', 'query');
  assertEqual(
    buildEbayQuery({ title: 'Harry Potter and the Chamber of Secrets (Harry Potter, #2)', author: 'J.K. Rowling' }),
    'Harry Potter and the Chamber of Secrets Rowling',
    'query'
  );
});

test('an item with no usable title falls back to its identifier', () => {
  assertEqual(buildEbayQuery({ barcode: '9780441013593' }), '9780441013593', 'identifier');
});

test('the identifier is used only when it is explicitly preferred', () => {
  const item = { barcode: '9780441013593', title: 'Dune', author: 'Frank Herbert' };
  assertEqual(buildEbayQuery({ ...item, prefer: 'barcode' }), '9780441013593', 'preferred');
  assertEqual(buildEbayQuery(item), 'Dune Herbert', 'default is the title');
});

test('preferring the identifier without one still uses the title', () => {
  assertEqual(buildEbayQuery({ title: 'Dune', prefer: 'barcode' }), 'Dune', 'falls back');
});

test('nothing at all yields an empty query rather than a stray word', () => {
  assertEqual(buildEbayQuery({}), '', 'empty object');
  assertEqual(buildEbayQuery(), '', 'no argument');
  assertEqual(buildEbayQuery({ title: '', barcode: '' }), '', 'both blank');
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
