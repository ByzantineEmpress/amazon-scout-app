import assert from 'node:assert/strict';
import { launchEditor } from '../../scripts/editor.mjs';

const calls = [];
const filename = '/tmp/project $(touch unexpected)/release notes.md';
const result = launchEditor('/path to/editor', filename, '/tmp/project', (...args) => {
  calls.push(args);
  return { status: 0 };
});
assert.equal(result, true);
assert.deepEqual(calls, [['/path to/editor', [filename], { cwd: '/tmp/project', stdio: 'inherit' }]]);
assert.equal(launchEditor('missing', filename, '/tmp', () => ({ status: null })), false);
console.log('releaseEditor tests passed');
