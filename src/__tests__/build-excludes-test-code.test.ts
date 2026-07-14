import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards against test-only source leaking into the published build (#217).
 *
 * The stale `tsconfig.json` exclude pointed at a path that no longer matched
 * `test-helpers.ts`, so it (and the `.compile-test.ts` brand guards) shipped
 * into `dist/`. `tsconfig.build.json` now excludes test code by pattern; this
 * test asks tsc which files that config would compile and fails if any test
 * module is still in the program.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tscEntry = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');

function buildProgramSrcFiles(): string[] {
  const out = execFileSync(
    process.execPath,
    [tscEntry, '-p', 'tsconfig.build.json', '--listFilesOnly'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((abs) => path.relative(repoRoot, abs).split(path.sep).join('/'))
    .filter((rel) => rel.startsWith('src/'));
}

const TEST_CODE = [
  /\.test\.ts$/,
  /\.compile-test\.ts$/,
  /(^|\/)test-helpers\.ts$/,
  /(^|\/)__tests__\//,
];

describe('build output excludes test code (#217)', () => {
  it('the build tsconfig compiles no test-only modules from src', () => {
    const files = buildProgramSrcFiles();
    // Guard against a vacuous pass: if the build config ever compiled nothing,
    // `leaked` would be empty while the real build is broken.
    expect(files).toContain('src/index.ts');
    const leaked = files.filter((f) => TEST_CODE.some((re) => re.test(f)));
    expect(leaked).toEqual([]);
  }, 60_000);
});
