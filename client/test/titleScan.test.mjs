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
const { linesFromBlocks, guessTitleAndAuthor } = new Function(
  `${source.replace(/^export /gm, '')}\nreturn { linesFromBlocks, guessTitleAndAuthor };`
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

console.log('');
if (failures.length === 0) {
  console.log(`PASS: ${passed} passed\n`);
} else {
  console.log(`FAIL: ${failures.length} failed, ${passed} passed\n`);
  for (const name of failures) console.log(`   - ${name}`);
  console.log('');
  process.exitCode = 1;
}
