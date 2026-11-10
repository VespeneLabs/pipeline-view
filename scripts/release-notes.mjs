#!/usr/bin/env node
/**
 * Prints GitHub Release notes for a version: the "## <version>" section of each package CHANGELOG.md
 * (written by `changeset version`). Usage: node scripts/release-notes.mjs 1.0.0 [rootDir]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2]?.replace(/^v/, '');
if (!version) {
  console.error('usage: release-notes.mjs <version> [rootDir]');
  process.exit(2);
}
const root = resolve(process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const PACKAGES = ['core', 'symbols', 'react'];

/** The body of the "## <version>" section, up to the next "## " heading. */
export function section(changelog, v) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${v}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

const parts = [`Packages: ${PACKAGES.map((p) => `\`@pipeline-view/${p}@${version}\``).join(', ')}.`, ''];
let found = 0;
for (const p of PACKAGES) {
  const file = join(root, 'packages', p, 'CHANGELOG.md');
  const body = existsSync(file) ? section(readFileSync(file, 'utf8'), version) : null;
  if (body) found++;
  parts.push(`## @pipeline-view/${p}`, '', body || '_No changes._', '');
}
parts.push('Install from the attached tarballs: `npm install ./pipeline-view-core-' + version + '.tgz …`');
if (found === 0) {
  console.error(`No CHANGELOG section "## ${version}" found. Did you run \`pnpm changeset version\`?`);
  process.exit(1);
}
console.log(parts.join('\n'));
