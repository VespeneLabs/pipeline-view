#!/usr/bin/env node
/** Fails unless every publishable package.json version equals the tag (vX.Y.Z → X.Y.Z). */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tag = process.argv[2] ?? '';
const version = tag.replace(/^v/, '');
let ok = /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
if (!ok) console.error(`Tag "${tag}" is not vX.Y.Z[-pre]`);
for (const p of ['core', 'symbols', 'react']) {
  const pkg = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', p, 'package.json'),
      'utf8',
    ),
  );
  if (pkg.version !== version) {
    console.error(`${pkg.name} is ${pkg.version}, tag says ${version}`);
    ok = false;
  }
}
if (ok) console.log(`All packages at ${version}`);
process.exit(ok ? 0 : 1);
