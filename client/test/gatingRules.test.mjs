/**
 * Tests for the on-device gating rules.
 *
 * Why the unusual loader below: `src/services/gatingRules.js` is an ES module (Metro
 * compiles it that way for the app), but `client/package.json` has no `"type": "module"`,
 * so Node would parse that .js file as CommonJS and throw on the `export` keywords.
 * Changing the package type would affect how Metro and Expo config files load, so
 * instead we read the source, drop the `export` keywords, and return the bindings.
 * gatingRules.js has no imports, so there is nothing else to resolve.
 *
 * Run from the repository root:  npm test
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const rulesPath = path.join(here, '..', 'src', 'services', 'gatingRules.js');

const source = await readFile(rulesPath, 'utf8');
const rules = new Function(`${source.replace(/^export /gm, '')}
return {
  evaluateRestrictions, checkIsbnPrefix,
  GATED_BOOK_PUBLISHERS, GATED_MEDIA_STUDIOS, GATED_VIDEO_GAME_BRANDS, ISBN_PUBLISHER_PREFIXES
};`)();

const {
  evaluateRestrictions, checkIsbnPrefix,
  GATED_BOOK_PUBLISHERS, GATED_MEDIA_STUDIOS, GATED_VIDEO_GAME_BRANDS, ISBN_PUBLISHER_PREFIXES
} = rules;

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

/** Every rule table must stay structurally intact as entries are edited. */
function assertTableShape(table, label) {
  assertTrue(Array.isArray(table) && table.length > 0, `${label} is a non-empty array`);
  for (const entry of table) {
    assertTrue(typeof entry.name === 'string' && entry.name.length > 0, `${label} entry has a name`);
    assertTrue(Array.isArray(entry.keywords) && entry.keywords.length > 0, `${label}/${entry.name} has keywords`);
    assertTrue(typeof entry.severity === 'string', `${label}/${entry.name} has a severity`);
    assertTrue(typeof entry.reason === 'string' && entry.reason.length > 0, `${label}/${entry.name} has a reason`);
  }
}

console.log('\ngatingRules.js\n');

// --- Table integrity -------------------------------------------------------

test('all four rule tables are structurally intact', () => {
  assertTableShape(GATED_BOOK_PUBLISHERS, 'GATED_BOOK_PUBLISHERS');
  assertTableShape(GATED_MEDIA_STUDIOS, 'GATED_MEDIA_STUDIOS');
  assertTableShape(GATED_VIDEO_GAME_BRANDS, 'GATED_VIDEO_GAME_BRANDS');
  assertTrue(ISBN_PUBLISHER_PREFIXES.length > 0, 'ISBN_PUBLISHER_PREFIXES is non-empty');
  for (const entry of ISBN_PUBLISHER_PREFIXES) {
    assertTrue(Array.isArray(entry.prefixes) && entry.prefixes.length > 0, `prefix entry ${entry.publisher} has prefixes`);
  }
});

// --- ISBN prefix resolution ------------------------------------------------

test('Pearson ISBN prefix resolves to the Pearson rule', () => {
  assertEqual(checkIsbnPrefix('9780132350884')?.publisher, 'Pearson', 'publisher');
});

test('a Big Five prefix is APPROVAL_REQUIRED, not invoice-gated', () => {
  const res = evaluateRestrictions({ title: 'Some Novel', barcode: '9780312345678' });
  assertEqual(res.status, 'APPROVAL_REQUIRED', 'status');
  assertEqual(res.requiresInvoices, false, 'requiresInvoices');
  assertEqual(res.canSell, false, 'canSell');
});

test('the ISBN prefix check outranks title heuristics', () => {
  // "Clean Code" is a benign title, but the 978013 prefix is Pearson's.
  const res = evaluateRestrictions({ title: 'Clean Code', barcode: '9780132350884' });
  assertEqual(res.status, 'HARD_GATED', 'status');
  assertEqual(res.matchedName, 'Pearson', 'matchedName');
  assertEqual(res.requiresInvoices, true, 'requiresInvoices');
  assertEqual(res.canSell, false, 'canSell');
});

// --- Keyword matching ------------------------------------------------------

test('a short keyword is not matched inside a longer word', () => {
  // 'eone' (4 chars) is a rule keyword. "someone" contains that substring but must
  // not match, because matchKeyword applies word boundaries to short keywords.
  const res = evaluateRestrictions({ title: 'Someone Like You', category: 'Books' });
  assertEqual(res.status, 'UNGATED', 'status');
});

test('...but the same short keyword does match as its own word', () => {
  const res = evaluateRestrictions({ title: 'Some Film', publisher: 'eOne', category: 'DVDs' });
  assertEqual(res.status, 'HARD_GATED', 'status');
  assertEqual(res.matchedName, 'Entertainment One / eOne (Canada)', 'matchedName');
});

test('a hard-gated media studio is detected', () => {
  const res = evaluateRestrictions({ title: 'The Lion King', publisher: 'Walt Disney Studios' });
  assertEqual(res.status, 'HARD_GATED', 'status');
  assertEqual(res.matchedName, 'Walt Disney Studios', 'matchedName');
});

test('a hard-gated game brand is detected', () => {
  const res = evaluateRestrictions({ title: 'Mario Kart 8 Deluxe', category: 'Video Games' });
  assertEqual(res.status, 'HARD_GATED', 'status');
  assertEqual(res.matchedName, 'Nintendo', 'matchedName');
  assertEqual(res.canSell, false, 'canSell');
});

test('a CAUTION-tier studio sets requiresInvoices false', () => {
  const res = evaluateRestrictions({ title: 'Seven Samurai', publisher: 'The Criterion Collection' });
  assertEqual(res.status, 'CAUTION', 'status');
  assertEqual(res.requiresInvoices, false, 'requiresInvoices');
});

// --- The DVD MSRP threshold rule -------------------------------------------

test('a DVD above the $25 MSRP threshold is gated', () => {
  const res = evaluateRestrictions({ title: 'Some Obscure Movie', category: 'DVD', msrp: 30 });
  assertEqual(res.status, 'HARD_GATED', 'status');
  assertEqual(res.requiresInvoices, true, 'requiresInvoices');
});

test('a DVD at $25 exactly is gated (threshold is inclusive)', () => {
  assertEqual(evaluateRestrictions({ title: 'Some Obscure Movie', category: 'DVD', msrp: 25 }).status, 'HARD_GATED', 'status');
});

test('a DVD below the threshold falls through to UNGATED', () => {
  const res = evaluateRestrictions({ title: 'Some Obscure Movie', category: 'DVD', msrp: 19.99 });
  assertEqual(res.status, 'UNGATED', 'status');
});

// --- Unknown / default outcomes --------------------------------------------

test('unverifiable metadata returns UNKNOWN, not UNGATED', () => {
  const res = evaluateRestrictions({ title: 'Unknown Item' });
  assertEqual(res.status, 'UNKNOWN', 'status');
  assertEqual(res.canSell, null, 'canSell');
});

test('missing title alone counts as unverified', () => {
  assertEqual(evaluateRestrictions({}).status, 'UNKNOWN', 'status');
});

test('an unrecognised title with a publisher is UNGATED', () => {
  const res = evaluateRestrictions({ title: 'Some Indie Novel', publisher: 'Small Press Books', category: 'Books' });
  assertEqual(res.status, 'UNGATED', 'status');
  assertEqual(res.canSell, true, 'canSell');
  assertTrue(typeof res.reason === 'string' && res.reason.length > 0, 'has a reason');
});

// --- Summary ---------------------------------------------------------------

console.log('');
if (failures.length === 0) {
  console.log(`✅ ${passed} passed\n`);
} else {
  console.log(`❌ ${failures.length} failed, ${passed} passed\n`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log('');
  process.exitCode = 1;
}
