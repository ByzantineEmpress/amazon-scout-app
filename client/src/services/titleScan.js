/**
 * Best-effort reading of a title and author from text recognised on a book.
 *
 * This is only used to prefill a search box for books that predate ISBN (1970), which have no
 * number on them to read. Both fields are editable in the UI, so the goal here is a decent
 * first guess - not a correct answer. Anything cleverer would still be wrong sometimes, and a
 * user correcting a prefilled field is faster than a user typing one from scratch.
 *
 * The OCR module returns blocks -> lines -> elements, each with a bounding box. Typography is
 * what gives the guess its shape: a title is set larger than anything else on a title page, so
 * the tallest line wins, ties going to the one nearest the top.
 */

/** Lines that are page furniture rather than a title. */
const NOISE = /^(isbn|copyright|all rights reserved|printed in|first published|a novel|penguin|bantam|signet|dell|avon|ballantine|pocket books)\b/i;

/** An author line usually announces itself. */
const AUTHOR_PREFIX = /^by[\s.:]+/i;

/** Or it looks like a personal name: a few capitalised words, nothing else. */
const NAME_LIKE = /^[A-Z][A-Za-z'’.-]*(?:\s+(?:[A-Z]\.?|[A-Z][A-Za-z'’.-]*)){0,3}$/;

/** Flatten the OCR block structure into lines carrying just enough geometry. */
export function linesFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];

  const lines = [];
  for (const block of blocks) {
    for (const line of block?.lines || []) {
      const text = String(line?.text ?? '').trim();
      if (!text) continue;
      const frame = line?.frame || {};
      const top = Number.isFinite(frame.top) ? frame.top : 0;
      const bottom = Number.isFinite(frame.bottom) ? frame.bottom : top;
      lines.push({ text, top, height: Math.max(0, bottom - top) });
    }
  }
  return lines;
}

/**
 * Guess a title and author. Returns empty strings when there is nothing usable, so callers can
 * simply leave their fields blank.
 */
export function guessTitleAndAuthor(blocks) {
  const lines = linesFromBlocks(blocks).filter((line) => !NOISE.test(line.text));
  if (lines.length === 0) return { title: '', author: '' };

  const byProminence = [...lines].sort((a, b) => b.height - a.height || a.top - b.top);
  const titleLine = byProminence[0];

  // An explicit "by ..." line wins; otherwise take the first name-shaped line that is not the
  // title itself.
  const prefixed = lines.find((line) => AUTHOR_PREFIX.test(line.text) && line !== titleLine);
  const nameLike = lines.find(
    (line) => line !== titleLine && NAME_LIKE.test(line.text) && line.text.length > 2
  );
  const authorLine = prefixed || nameLike;

  return {
    title: titleLine.text,
    author: authorLine ? authorLine.text.replace(AUTHOR_PREFIX, '').trim() : ''
  };
}
