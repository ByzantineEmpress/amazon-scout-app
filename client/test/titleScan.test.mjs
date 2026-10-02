/**
 * Tests for the title/author guess used to prefill a search for books that predate ISBN.
 *
 * The fixtures mimic the shape the ML Kit module returns: blocks -> lines, each line carrying
 * a frame. Typography is the signal - a title is set larger than anything around it - so the
 * fixtures give the title line a taller frame, as a real title page would.
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

// titleScan.js has no imports, so its source can be evaluated after dropping `export`.
const source = fs.readFileSync(path.join(here, '..', 'src', 'services', 'titleScan.js'), 'utf8');
const { linesFromBlocks, guessTitleAndAuthor, guessItemName, cleanItemText, findModelNumber } = new Function(
  `${source.replace(/^export /gm, '')}\nreturn { linesFromBlocks, guessTitleAndAuthor, guessItemName, cleanItemText, findModelNumber };`
)();

/** Build a block array the way the OCR module shapes one. */
function blockOf(lines) {
  return [{ text: lines.map((l) => l.text).join('\n'), blocks: undefined, lines }];
}

function line(text, top, height) {
  return { text, frame: { left: 0, top, right: 400, bottom: top + height }, elements: [] };
}

console.log('\ntitleScan.js\n');

test('the tallest line is taken as the title', () => {
  const guess = guessTitleAndAuthor(
    blockOf([
      line('CHARLES SCRIBNER S SONS', 10, 12),
      line('THE GREAT GATSBY', 40, 46),
      line('by F. Scott Fitzgerald', 100, 18)
    ])
  );
  assertEqual(guess.title, 'THE GREAT GATSBY', 'title');
});

test('a "by ..." line supplies the author, with the prefix removed', () => {
  const guess = guessTitleAndAuthor(
    blockOf([line('THE GREAT GATSBY', 40, 46), line('by F. Scott Fitzgerald', 100, 18)])
  );
  assertEqual(guess.author, 'F. Scott Fitzgerald', 'author');
});

test('a name-shaped line works when there is no "by"', () => {
  const guess = guessTitleAndAuthor(
    blockOf([line('THE GREAT GATSBY', 40, 46), line('F. Scott Fitzgerald', 100, 18)])
  );
  assertEqual(guess.author, 'F. Scott Fitzgerald', 'author');
});

test('publisher and legal boilerplate is ignored', () => {
  const guess = guessTitleAndAuthor(
    blockOf([
      line('COPYRIGHT 1925', 5, 10),
      line('ALL RIGHTS RESERVED', 20, 10),
      line('THE GREAT GATSBY', 60, 46),
      line('by F. Scott Fitzgerald', 120, 18),
      line('A NOVEL', 150, 12)
    ])
  );
  assertEqual(guess.title, 'THE GREAT GATSBY', 'title');
  assertEqual(guess.author, 'F. Scott Fitzgerald', 'author');
});

test('the title line is never returned as its own author', () => {
  const guess = guessTitleAndAuthor(blockOf([line('GATSBY', 40, 46)]));
  assertEqual(guess.title, 'GATSBY', 'title');
  assertEqual(guess.author, '', 'author');
});

test('missing geometry still yields the first line rather than throwing', () => {
  const guess = guessTitleAndAuthor([
    { lines: [{ text: 'THE GREAT GATSBY' }, { text: 'by F. Scott Fitzgerald' }] }
  ]);
  assertEqual(guess.title, 'THE GREAT GATSBY', 'title');
  assertEqual(guess.author, 'F. Scott Fitzgerald', 'author');
});

test('nothing usable returns empty strings, not a crash', () => {
  for (const input of [[], null, undefined, [{ lines: [] }], [{ lines: [{ text: '   ' }] }]]) {
    const guess = guessTitleAndAuthor(input);
    assertEqual(guess.title, '', `title for ${JSON.stringify(input)}`);
    assertEqual(guess.author, '', `author for ${JSON.stringify(input)}`);
  }
});

test('linesFromBlocks skips blanks and survives odd shapes', () => {
  assertEqual(linesFromBlocks(null).length, 0, 'null');
  assertEqual(linesFromBlocks([{ lines: [{ text: '  ' }, { text: 'ok' }] }]).length, 1, 'blanks skipped');
  assertEqual(linesFromBlocks([{}, { lines: [{ text: 'ok' }] }]).length, 1, 'block without lines');
});

// --- guessing an item name from packaging ------------------------------------

test('a box reads as brand, product and sub-name in reading order', () => {
  // The shape of a toy box front: the product name large, the small print everywhere.
  const box = blockOf([
    line('LEGO', 10, 60),
    line('Star Wars', 80, 55),
    line('Millennium Falcon', 145, 50),
    line('AGES 8+', 400, 30),
    line('613 pcs', 430, 28),
    line('MADE IN CHINA', 460, 24),
    line('www.lego.com', 490, 22),
    line('WARNING: CHOKING HAZARD', 520, 26)
  ]);
  assertEqual(guessItemName(box), 'LEGO Star Wars Millennium Falcon', 'name');
});

test('a warning bigger than the product name does not win', () => {
  // Safety text is often set large; it is still not what the item is called.
  const toy = blockOf([
    line('WARNING: CHOKING HAZARD - Small parts', 5, 70),
    line('NERF N-Strike Elite', 100, 45),
    line('Ages 6+', 160, 20)
  ]);
  assertEqual(guessItemName(toy), 'NERF N-Strike Elite', 'name');
});

test('numbers, prices and codes alone yield nothing', () => {
  // Better to prefill an empty box than to search for a barcode.
  const codes = blockOf([
    line('0 12345 67890 5', 10, 40),
    line('$19.99', 60, 30),
    line('UPC 012345678905', 100, 25)
  ]);
  assertEqual(guessItemName(codes), '', 'no name');
});

test('small print is not mistaken for a product name', () => {
  const item = blockOf([line('Vintage Camera', 100, 20), line('Tested Working', 130, 8)]);
  assertEqual(guessItemName(item), 'Vintage Camera', 'only the prominent line');
});

test('a sub-name joins when it is set at a similar size', () => {
  const game = blockOf([line('MONOPOLY', 20, 65), line('Classic Edition', 100, 40)]);
  assertEqual(guessItemName(game), 'MONOPOLY Classic Edition', 'joined');
});

test('trademark marks are stripped, other punctuation is kept', () => {
  const box = blockOf([line('FUNKO®', 10, 50), line('POP! Vinyl', 70, 45)]);
  assertEqual(guessItemName(box), 'FUNKO POP! Vinyl', 'marks removed');
  assertEqual(cleanItemText('  ™  '), '', 'nothing left');
});

test('a very long single line is capped rather than discarded', () => {
  const long = blockOf([line(`Ultra ${'x'.repeat(120)}`, 10, 50)]);
  const guess = guessItemName(long);
  if (guess.length === 0 || guess.length > 70) {
    throw new Error(`expected a capped name, got length ${guess.length}`);
  }
});

test('nothing usable yields an empty name', () => {
  for (const input of [[], null, undefined, [{ lines: [] }], [{ lines: [{ text: '   ' }] }]]) {
    assertEqual(guessItemName(input), '', `name for ${JSON.stringify(input)}`);
  }
});

// --- model numbers, for items with no name to read ---------------------------

test('a labelled model number is taken even when it is only digits', () => {
  // "Model 1914" is a real Xbox controller revision, and it is how the listing is titled.
  assertEqual(findModelNumber(blockOf([line('Model No. 1914', 10, 30)])), '1914', 'labelled number');
  assertEqual(findModelNumber(blockOf([line('MODEL: CUH-ZCT2U', 10, 30)])), 'CUH-ZCT2U', 'labelled code');
  assertEqual(findModelNumber(blockOf([line('M/N: CFI-ZCT1W', 10, 30)])), 'CFI-ZCT1W', 'm/n form');
});

test('an unlabelled model number is found in the small print', () => {
  // The usual place: a sticker on the underside, set far smaller than everything else.
  const controller = blockOf([
    line('SONY', 10, 60),
    line('MADE IN CHINA', 400, 14),
    line('CFI-ZCT1W', 430, 12),
    line('DC 5V 800mA', 460, 12)
  ]);
  assertEqual(findModelNumber(controller), 'CFI-ZCT1W', 'small print wins over nothing');
});

test('compliance marks are not mistaken for model numbers', () => {
  const box = blockOf([line('EN71', 10, 30), line('ASTM F963', 50, 28), line('RoHS', 90, 26)]);
  assertEqual(findModelNumber(box), '', 'standards rejected');
});

test('a label pointing elsewhere is not a model number', () => {
  assertEqual(findModelNumber(blockOf([line('MODEL: SEE BOTTOM', 10, 30)])), '', 'no value');
  assertEqual(findModelNumber(blockOf([])), '', 'nothing');
  assertEqual(findModelNumber(null), '', 'null');
});

test('a bare device reads as maker plus model, which is what a listing looks like', () => {
  // No product name anywhere: a logo and a sticker is all a loose controller offers.
  const controller = blockOf([
    line('SONY', 10, 60),
    line('CUH-ZCT2U', 430, 12)
  ]);
  assertEqual(guessItemName(controller), 'SONY CUH-ZCT2U', 'maker and model');
});

test('a model number is not appended to a descriptive name', () => {
  // eBay ANDs its terms, so an extra token could exclude every listing that omits it.
  const box = blockOf([
    line('LEGO', 10, 60),
    line('Star Wars', 80, 55),
    line('Millennium Falcon', 145, 50),
    line('EN71', 400, 30)
  ]);
  assertEqual(guessItemName(box), 'LEGO Star Wars Millennium Falcon', 'name left alone');
});

test('a photo of nothing but compliance marks reads as nothing', () => {
  // Otherwise the query becomes "EN71 ASTM F963 RoHS", which finds neither the item nor anything
  // else - the user should be sent to the label instead.
  const marks = blockOf([
    line('EN71', 10, 30),
    line('ASTM F963', 50, 28),
    line('RoHS Compliant', 90, 26),
    line('CE', 130, 24)
  ]);
  assertEqual(guessItemName(marks), '', 'no name');
  assertEqual(findModelNumber(marks), '', 'no model');
});

test('a model number is used alone when nothing else is readable', () => {
  const sticker = blockOf([line('CUH-ZCT2U', 10, 14)]);
  assertEqual(guessItemName(sticker), 'CUH-ZCT2U', 'model only');
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
