import { spawnSync } from 'node:child_process';

// EDITOR is an executable path; a wrapper script can supply editor flags.
export function launchEditor(editor, file, cwd, spawn = spawnSync) {
  return spawn(editor, [file], { cwd, stdio: 'inherit' }).status === 0;
}
