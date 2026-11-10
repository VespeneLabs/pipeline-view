#!/usr/bin/env node
/**
 * Release readiness check for the publishable packages (run after `pnpm build`):
 *  1. `pnpm pack` each package,
 *  2. the tarball contains only package.json, README.md, LICENSE and dist/ (with JS + .d.ts),
 *  3. workspace: ranges were rewritten to real versions,
 *  4. types resolve for ESM consumers (@arethetypeswrong/cli, esm-only profile).
 * Usage: node scripts/check-packages.mjs [--out <dir>]   (tarballs are kept in <dir> when given)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The single published package. The @pipeline-view/* workspace packages are private and bundled into it.
const PACKAGES = [
  {
    dir: 'packages/pipeline-view',
    extra: [
      'dist/styles.css',
      'dist/symbols.js',
      'dist/symbols.d.ts',
      'dist/react.js',
      'dist/react.d.ts',
    ],
    attwExclude: ['styles.css'],
  },
];
// CHANGELOG.md appears after `changeset version` and is always packed by npm/pnpm.
const ALLOWED = /^package\/(package\.json|README\.md|CHANGELOG\.md|LICENSE|dist\/.+)$/;

const outArg = process.argv.indexOf('--out');
const out =
  outArg > -1 ? resolve(process.argv[outArg + 1]) : mkdtempSync(join(tmpdir(), 'pv-pack-'));
mkdirSync(out, { recursive: true });

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  ✖ ${msg}`);
};

for (const pkg of PACKAGES) {
  const cwd = join(root, pkg.dir);
  const name = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).name;
  console.log(`\n${name}`);
  const before = new Set(readdirSync(out));
  run('pnpm', ['pack', '--pack-destination', out], { cwd });
  const tarball = readdirSync(out).find((f) => f.endsWith('.tgz') && !before.has(f));
  if (!tarball) {
    fail('pnpm pack produced no tarball');
    continue;
  }
  const tgz = join(out, tarball);
  const files = run('tar', ['-tzf', tgz]).trim().split('\n');
  console.log(`  ${tarball}: ${files.length} files`);

  for (const f of files) if (!ALLOWED.test(f)) fail(`unexpected file in tarball: ${f}`);
  for (const f of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
    ...pkg.extra,
  ]) {
    if (!files.includes(`package/${f}`)) fail(`missing ${f}`);
  }

  const manifest = JSON.parse(run('tar', ['-xzOf', tgz, 'package/package.json']));
  for (const field of ['dependencies', 'peerDependencies']) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
      if (String(range).startsWith('workspace:')) fail(`${field}.${dep} still "${range}"`);
      if (dep.startsWith('@pipeline-view/'))
        fail(`${field}.${dep}: workspace packages must be bundled, not depended on`);
    }
  }
  for (const key of [
    'description',
    'keywords',
    'homepage',
    'repository',
    'license',
    'exports',
    'publishConfig',
  ]) {
    if (!manifest[key]) fail(`package.json is missing "${key}"`);
  }

  const attwArgs = [tgz, '--profile', 'esm-only', '--format', 'ascii'];
  if (pkg.attwExclude.length) attwArgs.push('--exclude-entrypoints', ...pkg.attwExclude);
  try {
    run('pnpm', ['exec', 'attw', ...attwArgs], { cwd: root });
    console.log('  ✔ types resolve (attw, esm-only)');
  } catch (e) {
    fail(`attw reported problems:\n${e.stdout || e.message}`);
  }
}

console.log(failed ? '\nPackage check FAILED' : `\nAll packages OK (tarballs in ${out})`);
process.exit(failed ? 1 : 0);
