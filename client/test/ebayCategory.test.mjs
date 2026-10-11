/**
 * Tests for choosing an eBay category to narrow a comps search to.
 *
 * The fixtures are the shapes eBay's results page reports: refinement links whose hrefs carry
 * `_sacat=<id>`, mixed in with ordinary listing links that must be ignored.
 *
 * Run from the repository root:  npm test
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ebayCategory.js has no imports, so its source can be evaluated after dropping `export`.
const source = fs.readFileSync(path.join(here, '..', 'src', 'services', 'ebayCategory.js'), 'utf8');
const { pickEbayCategory, parsePageCount, categoryScope } = new Function(
  `${source.replace(/^export /gm, '')}\nreturn { pickEbayCategory, parsePageCount, categoryScope };`
)();

/** A results page's links, in document order: the sidebar first, listings after. */
const PAGE_LINKS = [
  { href: '/sch/i.html?_nkw=dune&_sacat=0', text: 'All Categories' },
  { href: '/sch/i.html?_nkw=dune&_sacat=267', text: 'Books & Magazines' },
  { href: '/sch/i.html?_nkw=dune&_sacat=171228', text: 'Antiquarian & Collectible' },
  { href: '/itm/dune-paperback/123456', text: 'Dune Paperback' },
  { href: 'https://www.ebay.ca/p/134265', text: 'Dune' }
];

console.log('\nebayCategory.js\n');

test('the first real category on the page is chosen', () => {
  // "All Categories" is skipped: it is not a narrowing.
  assertEqual(pickEbayCategory(PAGE_LINKS), { id: '267', name: 'Books & Magazines' }, 'chosen');
});

test('links that are not categories are ignored', () => {
  const listingsOnly = PAGE_LINKS.filter((l) => !l.href.includes('_sacat='));
  assertEqual(pickEbayCategory(listingsOnly), null, 'no category offered');
});

test('a page with only "All Categories" offers nothing', () => {
  assertEqual(pickEbayCategory([{ href: '/sch/i.html?_sacat=0', text: 'All Categories' }]), null, 'nothing');
});

test('the same category twice is not offered twice', () => {
  const doubled = [
    { href: '/x?_sacat=267', text: 'Books' },
    { href: '/y?_sacat=267', text: 'Books' }
  ];
  assertEqual(pickEbayCategory(doubled), { id: '267', name: 'Books' }, 'first only');
});

test('a nameless or absurdly long link is rejected', () => {
  // The name is shown to the user, so it has to be a name.
  assertEqual(pickEbayCategory([{ href: '/x?_sacat=267', text: '   ' }]), null, 'blank');
  assertEqual(pickEbayCategory([{ href: '/x?_sacat=267', text: 'A'.repeat(80) }]), null, 'too long');
  assertEqual(pickEbayCategory([{ href: '/x?_sacat=267', text: ' Books  &  Magazines ' }]),
    { id: '267', name: 'Books & Magazines' }, 'whitespace collapsed');
});

test('an id is never invented', () => {
  assertEqual(pickEbayCategory([{ href: '/x?_sacat=abc', text: 'Books' }]), null, 'non-numeric');
  assertEqual(pickEbayCategory([{ href: '/x?sacat=267', text: 'Books' }]), null, 'not a query param');
  assertEqual(pickEbayCategory([{ href: '', text: 'Books' }]), null, 'empty href');
});

test('junk input yields nothing rather than throwing', () => {
  for (const input of [null, undefined, [], 'nonsense', 42, [null, 1, 'x'], [{}]]) {
    assertEqual(pickEbayCategory(input), null, `input ${JSON.stringify(input)}`);
  }
});

test('a page count is read only next to the word "results"', () => {
  assertEqual(parsePageCount('1,234 results for dune herbert'), 1234, 'with comma');
  assertEqual(parsePageCount('87 results'), 87, 'plain');
  assertEqual(parsePageCount('10,000+ results'), 10000, 'capped');
  assertEqual(parsePageCount('Results for dune'), null, 'no number');
  assertEqual(parsePageCount(''), null, 'empty');
  assertEqual(parsePageCount(null), null, 'null');
});

test('the first count on the page wins, not one from a listing title', () => {
  // This is why the page reader looks at the count heading first, and at the top of the body text
  // only as a fallback: a listing called "3 Results of a Study" must not become the count.
  assertEqual(
    parsePageCount('1,234 results for dune herbert ... 3 Results of a Study'),
    1234,
    'first wins'
  );
});

test('a category id is only used when it is a plain number', () => {
  assertEqual(categoryScope('267'), '&_sacat=267', 'id');
  assertEqual(categoryScope(156), '&_sacat=156', 'number');
  assertEqual(categoryScope(' 267 '), '&_sacat=267', 'trimmed');
});

test('nothing is added when there is no category to scope to', () => {
  assertEqual(categoryScope(null), '', 'null');
  assertEqual(categoryScope(undefined), '', 'undefined');
  assertEqual(categoryScope(''), '', 'empty');
  // "All Categories" is the absence of a scope, not a scope.
  assertEqual(categoryScope('0'), '', 'all categories');
});

test('anything that is not an id is refused, because it lands in a URL', () => {
  assertEqual(categoryScope('267&_nkw=hacked'), '', 'would inject a parameter');
  assertEqual(categoryScope('../../etc'), '', 'path');
  assertEqual(categoryScope('1e5'), '', 'exponent');
  assertEqual(categoryScope('999999999999999'), '', 'absurdly long');
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
