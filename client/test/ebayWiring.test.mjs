/**
 * Wiring guards for the eBay comps data path.
 *
 * This file exists because of a real bug: sell-through was fetched by the service, parsed by
 * ebayHtml.js and rendered by the UI, but never copied into component state - so the feature
 * silently did nothing. Every layer had its own passing test; nothing tested the joints, and the
 * components here have no render tests that could have caught it.
 *
 * So these assertions are about the shape of the wiring:
 *
 *  1. the service still produces the fields the UI displays,
 *  2. each component stores the response WHOLE (spread) rather than re-listing its fields, which
 *     is what makes a new service field reach the UI without a second place to remember it, and
 *  3. the spread comes after the defaults, so a default cannot mask a value the service returned.
 *
 * They are guards, not proof: they fail loudly when someone reverts to hand-listing the response,
 * and that is the whole claim.
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

function assertTrue(condition, label) {
  if (!condition) throw new Error(label);
}

const read = (relative) => fs.readFileSync(path.join(here, '..', relative), 'utf8');

/**
 * Code without its comments, so an assertion cannot be satisfied by a comment that merely
 * mentions the thing being asserted. Only whole-line `//` comments are stripped, which leaves
 * strings such as URLs intact.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/** Fields the sold-comps response carries and the UI reads. */
const RESPONSE_FIELDS = ['price', 'matchedBy', 'sellThrough', 'soldCount', 'activeCount'];

/** The components that display a comps response, and the state each keeps it in. */
const CONSUMERS = [
  { file: 'src/components/ScanResultModal.js', state: 'ebayData', setter: 'setEbayData' },
  { file: 'src/components/ItemCompsModal.js', state: 'comps', setter: 'setComps' }
];

/**
 * True when the response is kept whole - either spread into a new state object alongside some
 * defaults, or stored as-is. Both are fine; what is not fine is re-listing its fields.
 */
function storesResponseWhole(source, setter) {
  return /\.\.\.res\b/.test(source) || new RegExp(`${setter}\\(\\s*res\\b`).test(source);
}

console.log('\nebayWiring\n');

test('the service still produces every field the UI displays', () => {
  const service = stripComments(read('src/services/ebayService.js'));
  for (const field of RESPONSE_FIELDS) {
    assertTrue(
      service.includes(field),
      `ebayService.js no longer mentions "${field}": renamed (update the UI and this list) or dropped (the UI is reading nothing)`
    );
  }
});

test('each component stores the comps response whole rather than re-listing fields', () => {
  for (const { file, setter } of CONSUMERS) {
    const source = stripComments(read(file));
    assertTrue(
      storesResponseWhole(source, setter),
      `${file} neither spreads the service response nor stores it whole. Hand-listing its fields ` +
        `is exactly how sell-through came to be fetched, parsed and rendered while never reaching ` +
        `the screen - with every layer's own test passing.`
    );
  }
});

test('each component still reads the sell-through figures', () => {
  for (const { file, state } of CONSUMERS) {
    const source = stripComments(read(file));
    assertTrue(
      new RegExp(`\\b${state}\\??\\.sellThrough\\b`).test(source) ||
        /sellThroughBand\(/.test(source),
      `${file} no longer reads the sell-through figures, so the display has been removed or renamed`
    );
  }
});

test('where defaults are used, the response spread follows them', () => {
  for (const { file } of CONSUMERS) {
    const source = stripComments(read(file));
    const spreadAt = source.indexOf('...res');
    if (spreadAt === -1) continue; // stores the response as-is; nothing can mask it

    const defaultsAt = source.indexOf('currencyPrefix');
    assertTrue(
      defaultsAt > -1 && defaultsAt < spreadAt,
      `${file} spreads the response before its defaults, so a hardcoded default would win over ` +
        `the value the service returned`
    );
  }
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
