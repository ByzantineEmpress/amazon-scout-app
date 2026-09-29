#!/usr/bin/env node
/**
 * Cuts a release: bumps the version, scaffolds the release notes, validates everything,
 * then commits, tags and pushes -- which is what triggers the GitHub Actions APK build.
 *
 *   npm run release -- 1.0.9
 *   npm run release -- 1.0.9 --dry-run    # do all the local work, touch no git history
 *   npm run release -- 1.0.9 --no-edit    # never open an editor; fail if notes are a stub
 *
 * Why it is this careful:
 *  - A pushed tag is hard to walk back, so it refuses to run on a dirty tree or off main.
 *  - The release workflow refuses to build without release-notes/v<version>.md, and the app
 *    renders the first three lines of that file in its "update available" card, so the script
 *    scaffolds the file from release-notes/_template.md and will not ship while it still
 *    contains the template marker.
 *  - The in-app updater compares the release tag against app.json's expo.version, so both
 *    version files are bumped together and the workflow independently re-checks them.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = path.join(root, 'client', 'app.json');
const CLIENT_PKG = path.join(root, 'client', 'package.json');
const TEMPLATE = path.join(root, 'release-notes', '_template.md');
const TEMPLATE_MARKER = '<!-- TODO:';

const rel = (p) => path.relative(root, p).split(path.sep).join('/');

function die(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// --- arguments ---------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const positional = argv.filter((a) => !a.startsWith('--'));
const dryRun = flags.includes('--dry-run');
const noEdit = flags.includes('--no-edit');

const KNOWN_FLAGS = ['--dry-run', '--no-edit'];
const unknown = flags.find((f) => !KNOWN_FLAGS.includes(f));
if (unknown) die(`Unknown option ${unknown}. Known options: ${KNOWN_FLAGS.join(', ')}`);

const version = positional[0];
if (!version) {
  die('Usage: npm run release -- <version>\n\n  e.g. npm run release -- 1.0.9\n       npm run release -- 1.0.9 --dry-run');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  die(`Version must look like 1.0.9 -- three numbers, no leading "v". Got: ${version}`);
}

const notesPath = path.join(root, 'release-notes', `v${version}.md`);

// --- git helpers -------------------------------------------------------------

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...opts }).trim();
}

function gitQuiet(args) {
  const res = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return { ok: res.status === 0, out: (res.stdout || '').trim() };
}

/** Numeric component compare. Returns 1, 0 or -1. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// --- preflight ---------------------------------------------------------------

function preflight() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') {
    die(`Refusing to release from branch "${branch}". Switch to main first.`);
  }

  const dirty = git(['status', '--porcelain']);
  if (dirty) {
    die(`Working tree is not clean:\n\n${dirty}\n\nCommit or stash first — a release tag is hard to walk back.`);
  }

  if (gitQuiet(['rev-parse', '--verify', `refs/tags/v${version}`]).ok) {
    die(`Tag v${version} already exists. Pick the next version number.`);
  }

  const current = JSON.parse(readFileSync(APP_JSON, 'utf8')).expo.version;
  // Re-running for a version already staged in the working tree is fine (the tree would not be
  // clean in that case anyway), but a *lower* number or a repeat of a released one is not.
  if (current !== version && compareVersions(version, current) <= 0) {
    die(
      `Version ${version} must be higher than the current ${current}.\n\n` +
        `The in-app update checker only offers an update when the release tag is a higher\n` +
        `version than the installed app, so reusing or lowering a number means users are\n` +
        `never told about this release.`
    );
  }
  return current;
}

// --- steps -------------------------------------------------------------------

function bumpVersion(current) {
  for (const file of [APP_JSON, CLIENT_PKG]) {
    const before = readFileSync(file, 'utf8');
    const after = before.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
    if (after === before && current !== version) {
      die(`Could not find a "version" field to update in ${rel(file)}.`);
    }
    writeFileSync(file, after);
  }

  // Self-check: never trust the regex alone.
  const appVersion = JSON.parse(readFileSync(APP_JSON, 'utf8')).expo.version;
  const pkgVersion = JSON.parse(readFileSync(CLIENT_PKG, 'utf8')).version;
  if (appVersion !== version || pkgVersion !== version) {
    die(`Version bump check failed: app.json is ${appVersion}, package.json is ${pkgVersion}, expected ${version}.`);
  }
  console.log(`  bumped client/app.json and client/package.json to ${version}`);
}

function scaffoldNotes() {
  if (existsSync(notesPath)) {
    console.log(`  release notes already exist: ${rel(notesPath)}`);
    return;
  }
  if (!existsSync(TEMPLATE)) die(`Missing template: ${rel(TEMPLATE)}`);
  copyFileSync(TEMPLATE, notesPath);
  console.log(`  created ${rel(notesPath)} from the template`);
}

function openEditor(file) {
  const editors = process.env.EDITOR
    ? [process.env.EDITOR]
    : process.platform === 'win32'
      ? ['notepad']
      : ['nano', 'vi'];

  for (const editor of editors) {
    const res = spawnSync(`${editor} "${file}"`, { cwd: root, shell: true, stdio: 'inherit' });
    if (res.status === 0) return true;
    console.log(`  (could not launch "${editor}")`);
  }
  return false;
}

function ensureNotesWritten() {
  let body = readFileSync(notesPath, 'utf8');
  if (!body.includes(TEMPLATE_MARKER)) {
    console.log('  release notes look written');
    return body;
  }

  if (noEdit) {
    die(
      `${rel(notesPath)} is still the template.\n\n` +
        `Write it, then re-run this command. (Remove the "${TEMPLATE_MARKER}" line.)\n` +
        `The app shows the first three lines of it when it offers the update.`
    );
  }

  console.log(`\n  Opening ${rel(notesPath)} — save and close it when you are done.\n`);
  if (!openEditor(notesPath)) {
    die(`Could not launch an editor. Set the EDITOR environment variable, or edit\n${rel(notesPath)} by hand and re-run.`);
  }

  body = readFileSync(notesPath, 'utf8');
  if (body.includes(TEMPLATE_MARKER)) {
    die(`${rel(notesPath)} still contains the template marker "${TEMPLATE_MARKER}". Remove it, then re-run.`);
  }
  console.log('  release notes written');
  return body;
}

function runTests() {
  console.log('\n  running tests...');
  const res = spawnSync('npm test', { cwd: root, shell: true, stdio: 'inherit' });
  if (res.status !== 0) die('Tests failed. Fix them before releasing.');
}

function ship(notesBody) {
  const files = [rel(APP_JSON), rel(CLIENT_PKG), rel(notesPath)];
  const steps = [
    ['git add', ['add', ...files]],
    ['git commit', ['commit', '-m', `Release v${version}`, '-m', notesBody.trim()]],
    ['git tag', ['tag', `v${version}`]],
    ['git push', ['push', 'origin', 'HEAD']],
    ['git push tag', ['push', 'origin', `v${version}`]],
  ];

  console.log('');
  for (const [label, args] of steps) {
    if (dryRun) {
      console.log(`  [dry-run] would run: ${label} ${args.filter((a) => !a.includes('\n')).join(' ')}`);
      continue;
    }
    if (label === 'git commit') console.log('  committing with the release notes as the message');
    execFileSync('git', args, { cwd: root, stdio: 'inherit' });
  }
}

function actionsUrl() {
  const remote = gitQuiet(['remote', 'get-url', 'origin']).out;
  const m = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/actions` : null;
}

// --- run ---------------------------------------------------------------------

console.log(`\n⚡ Amazon Scout release${dryRun ? ' (dry run)' : ''}: v${version}\n`);

const currentVersion = preflight();
console.log(`  current version: ${currentVersion}`);
bumpVersion(currentVersion);
scaffoldNotes();
const notesBody = ensureNotesWritten();
runTests();
ship(notesBody);

const url = actionsUrl();
if (dryRun) {
  console.log(
    `\n✔ Dry run complete — nothing was committed, tagged or pushed.\n\n` +
      `  Inspect the changes, then undo them with:\n` +
      `    git checkout -- client/app.json client/package.json\n` +
      `    rm release-notes/v${version}.md\n\n` +
      `  Run for real with:  npm run release -- ${version}\n`
  );
} else {
  console.log(
    `\n✔ Released v${version}.\n\n` +
      `  GitHub Actions is building the signed APK (~8 minutes)${url ? `:\n    ${url}` : ''}\n` +
      `  It will fail if the tag and app.json disagree, or if ${rel(notesPath)} is missing —\n` +
      `  both are already checked here, so a failure means something else needs a look.\n`
  );
}
