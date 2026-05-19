/**
 * Run markdown-link-check once for README, CHANGELOG, and every *.md under docs/.
 * Avoids per-file `npx` invocations (slow / flaky under registry hiccups).
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} dir @returns {string[]} */
function walkMarkdownFiles(dir) {
  const out = [];
  try {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkMarkdownFiles(p));
      else if (ent.isFile() && ent.name.endsWith('.md')) out.push(p);
    }
  } catch {
    // missing or unreadable dir
  }
  return out;
}

const paths = ['README.md', 'CHANGELOG.md', ...walkMarkdownFiles('docs')];

const shell = process.platform === 'win32';
const r = spawnSync(
  'npx',
  ['--yes', 'markdown-link-check@3', '-c', '.markdown-link-check.json', ...paths],
  { stdio: 'inherit', shell }
);

process.exit(r.status === null ? 1 : r.status);
