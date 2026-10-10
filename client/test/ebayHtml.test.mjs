/**
 * Tests for reading eBay search pages.
 *
 * This is the fragile half of the sell-through feature: eBay's markup changes without notice, and
 * a parse that returns a plausible wrong number is worse than one that returns nothing. The
 * fixtures below are the shapes eBay serves - a count announced above the listings, prices in
 * `s-item__price` elements - including the variants that have to work: a count nested in a child
 * element, a count with no class at all, and eBay.ca's spaced "C $8.99".
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
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ebayHtml.js has no imports, so its source can be evaluated after dropping `export`.
const source = fs.readFileSync(path.join(here, '..', 'src', 'services', 'ebayHtml.js'), 'utf8');
const { htmlToText, parseResultCount, parseSoldPrices, lowestSoldPrice, sellThroughRate, sellThroughBand } =
  new Function(
    `${source.replace(/^export /gm, '')}
return { htmlToText, parseResultCount, parseSoldPrices, lowestSoldPrice, sellThroughRate, sellThroughBand };`
  )();

/** A sold/completed results page with the count in the heading eBay uses on desktop. */
const SOLD_PAGE = `<!DOCTYPE html><html><head>
<title>dune herbert for sale | eBay</title>
<script>window.__COUNT = "999 results for something else";</script>
<style>.s-item__price { color: red } /* 7 results */</style>
</head><body>
<h1 class="srp-controls__count-heading">1,234 results for <span class="BOLD">dune herbert</span></h1>
<ul class="srp-results">
  <li class="s-item"><span class="s-item__price">CDN$ 12.50</span></li>
  <li class="s-item"><span class="s-item__price">C $8.99</span></li>
  <li class="s-item"><span class="s-item__price">US $21.00</span></li>
  <li class="s-item"><span class="s-item__price">$5.00</span></li>
  <li class="s-item"><span class="s-item__price">CDN$ 0.99</span></li>
</ul>
</body></html>`;

/** An active-listings page whose count sits inside a child element. */
const ACTIVE_PAGE = `<html><body>
<div class="srp-controls__count"><span class="BOLD">348</span> results for dune herbert</div>
<ul class="srp-results"><li class="s-item"><span class="s-item__price">C $14.00</span></li></ul>
</body></html>`;

console.log('\nebayHtml.js\n');

// --- the result count --------------------------------------------------------

test('the count is read from the heading', () => {
  assertEqual(parseResultCount(SOLD_PAGE), 1234, 'sold page');
});

test('a count nested inside a child element is still read', () => {
  assertEqual(parseResultCount(ACTIVE_PAGE), 348, 'active page');
});

test('a count with no recognisable class falls back to the visible text', () => {
  const page = '<html><body><div>87 results for vintage camera</div></body></html>';
  assertEqual(parseResultCount(page), 87, 'fallback');
});

test('script and style contents cannot supply the count', () => {
  // The fixture hides "999 results" and "7 results" in a script and a style block; the real
  // count is 1234, so a parser that reads raw HTML would get this wrong.
  assertEqual(parseResultCount(SOLD_PAGE), 1234, 'not the script');
  assertEqual(htmlToText(SOLD_PAGE).includes('999 results'), false, 'script stripped');
});

test('a title containing "results" is not mistaken for a count', () => {
  const page = '<html><body><h1 class="srp-controls__count-heading">Results for dune</h1></body></html>';
  assertEqual(parseResultCount(page), null, 'no number');
});

test('genuinely zero results reads as zero', () => {
  const page = '<html><body><h1 class="srp-controls__count-heading">0 results for zzzzqqq</h1></body></html>';
  assertEqual(parseResultCount(page), 0, 'zero');
});

test('"no exact matches" is not treated as zero', () => {
  // eBay shows that alongside suggested listings, so it says nothing certain.
  const page = '<html><body><h1 class="srp-controls__count-heading">No exact matches found</h1></body></html>';
  assertEqual(parseResultCount(page), null, 'unknown, not zero');
});

test('an error page or empty input yields nothing', () => {
  assertEqual(parseResultCount('<html><body>Error Page | eBay</body></html>'), null, 'error page');
  assertEqual(parseResultCount(''), null, 'empty');
  assertEqual(parseResultCount(null), null, 'null');
  assertEqual(parseResultCount('<html><body>Nothing here</body></html>'), null, 'no count anywhere');
});

// --- prices ------------------------------------------------------------------

test('sold prices are read in every currency form eBay writes', () => {
  assertEqual(JSON.stringify(parseSoldPrices(SOLD_PAGE)), JSON.stringify([12.5, 8.99, 21, 5]), 'prices');
});

test('the lowest sold price ignores sub-dollar placeholders', () => {
  assertEqual(lowestSoldPrice(SOLD_PAGE), 5, 'lowest');
});

test('a page with no prices yields nothing rather than zero', () => {
  assertEqual(lowestSoldPrice('<html><body>Error Page | eBay</body></html>'), null, 'error page');
  assertEqual(lowestSoldPrice('<html><body><span class="s-item__price">CDN$ 0.99</span></body></html>'), null, 'only a placeholder');
  assertEqual(lowestSoldPrice(''), null, 'empty');
});

// --- sell-through ------------------------------------------------------------

test('sell-through is the share of sold plus still-listed that sold', () => {
  assertEqual(sellThroughRate(60, 40), 60, '60 of 100');
  assertEqual(sellThroughRate(128, 72), 64, '128 of 200');
  assertEqual(sellThroughRate(33, 67), 33, 'rounds');
  assertEqual(sellThroughRate(1, 0), 100, 'everything sold');
  assertEqual(sellThroughRate(0, 50), 0, 'nothing sold');
});

test('sell-through is null when it cannot be said', () => {
  assertEqual(sellThroughRate(0, 0), null, 'nothing sold and nothing listed');
  assertEqual(sellThroughRate(null, 5), null, 'missing sold count');
  assertEqual(sellThroughRate(5, null), null, 'missing active count');
  assertEqual(sellThroughRate(undefined, undefined), null, 'both missing');
  assertEqual(sellThroughRate(-5, 10), null, 'nonsense input');
});

test('the band is coarse and never claims precision', () => {
  assertEqual(sellThroughBand(60), 'high', '60');
  assertEqual(sellThroughBand(59), 'medium', '59');
  assertEqual(sellThroughBand(30), 'medium', '30');
  assertEqual(sellThroughBand(29), 'low', '29');
  assertEqual(sellThroughBand(null), null, 'unknown');
});

test('the two counts together give the rate for the fixtures', () => {
  // The whole point: one page says how many sold, the other how many are listed.
  const sold = parseResultCount(SOLD_PAGE);
  const active = parseResultCount(ACTIVE_PAGE);
  assertEqual(sellThroughRate(sold, active), 78, '1234 of 1582');
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
