/**
 * Assembles dist/*.d.ts and dist/styles.css from the workspace packages' builds.
 *  - index.d.ts   = core's bundled declarations
 *  - symbols.d.ts = symbols' declarations, with '@pipeline-view/core' rewritten to this package
 *  - react.d.ts   = react's declarations, likewise
 * Pointing the subpaths at '.' (instead of inlining core's types into each) keeps a single declaration of
 * classes such as Diagram, so a Diagram from './react' is the same type as one from '.'.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const ws = join(pkgDir, '..');
const self = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name;
const dist = join(pkgDir, 'dist');

const rewrite = (src) => {
  const text = readFileSync(src, 'utf8');
  const out = text.replace(/(['"])@pipeline-view\/core\1/g, `'${self}'`);
  const leftover = out.match(/@pipeline-view\/[a-z-]+/);
  if (leftover) throw new Error(`${src} still references ${leftover[0]}`);
  return out;
};

copyFileSync(join(ws, 'core/dist/index.d.ts'), join(dist, 'index.d.ts'));
writeFileSync(join(dist, 'symbols.d.ts'), rewrite(join(ws, 'symbols/dist/index.d.ts')));
writeFileSync(join(dist, 'react.d.ts'), rewrite(join(ws, 'react/dist/index.d.ts')));
copyFileSync(join(ws, 'core/dist/styles.css'), join(dist, 'styles.css'));
console.log('dist: index.d.ts, symbols.d.ts, react.d.ts, styles.css');
