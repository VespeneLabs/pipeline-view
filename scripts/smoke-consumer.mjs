#!/usr/bin/env node
/**
 * Consumer smoke test for @vespenelabs/pipeline-view (run after `pnpm build`):
 *  1. `pnpm pack` the package and install the tarball into a fresh temp project (npm, like a consumer would),
 *  2. typecheck imports of '.', './symbols', './react', './testing' and './styles.css' (TypeScript, NodeNext resolution),
 *     including that a Diagram from './react' is the same type as one from '.',
 *  3. at runtime in Node: symbols registered through './symbols' are visible to a Diagram from '.'
 *     (one shared core instance), and every subpath resolves.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'packages/pipeline-view');
const work = mkdtempSync(join(tmpdir(), 'pv-consumer-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run('pnpm', ['pack', '--pack-destination', work], pkgDir);
const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
console.log(`\nconsumer project: ${work} (${tgz})`);

writeFileSync(
  join(work, 'package.json'),
  JSON.stringify({ name: 'consumer', private: true, type: 'module' }, null, 2),
);
run(
  'npm',
  [
    'install',
    '--no-audit',
    '--no-fund',
    `./${tgz}`,
    'react@19',
    'react-dom@19',
    'typescript@5',
    '@types/react@19',
  ],
  work,
);

writeFileSync(
  join(work, 'check.ts'),
  `import { Diagram, type DiagramModel, type SymbolDef } from '@vespenelabs/pipeline-view';
import { gasSymbols, registerGasSymbols, gateValve } from '@vespenelabs/pipeline-view/symbols';
import { PipelineView, useSelection, type PipelineViewProps } from '@vespenelabs/pipeline-view/react';
import { createTestDiagram, expectLink, type DiagramLike } from '@vespenelabs/pipeline-view/testing';
import '@vespenelabs/pipeline-view/styles.css';

const model: DiagramModel = { version: 1, nodes: [], links: [] };
const defs: SymbolDef[] = [...gasSymbols, gateValve];
registerGasSymbols();
const d = new Diagram({ symbols: defs });
d.load(model);

// The React bindings hand out the same Diagram type as the root entry (one declaration, not a copy).
type ReadyArg = Parameters<NonNullable<PipelineViewProps['onReady']>>[0];
const fromReact: ReadyArg = d;
const back: Diagram = fromReact;
// ./testing takes the same Diagram type too.
const forTests: DiagramLike = d;
void createTestDiagram;
void expectLink;
export { PipelineView, useSelection, back, forTests };
`,
);
writeFileSync(join(work, 'css.d.ts'), "declare module '*.css';\n");
writeFileSync(
  join(work, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        skipLibCheck: false,
        jsx: 'react-jsx',
      },
      files: ['check.ts', 'css.d.ts'],
    },
    null,
    2,
  ),
);
run('npx', ['tsc', '-p', '.'], work);
console.log(
  '✔ types: ., ./symbols, ./react, ./testing, ./styles.css (NodeNext), shared Diagram type',
);

writeFileSync(
  join(work, 'run.mjs'),
  `import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const core = await import('@vespenelabs/pipeline-view');
const symbols = await import('@vespenelabs/pipeline-view/symbols');
const react = await import('@vespenelabs/pipeline-view/react');
const testing = await import('@vespenelabs/pipeline-view/testing');
if (typeof testing.createTestDiagram !== 'function') throw new Error('createTestDiagram missing');
symbols.registerGasSymbols();
const d = new core.Diagram();
if (!d.symbols.get('gas/gate-valve')) throw new Error('symbols registered via ./symbols are not visible from "." (two core instances?)');
if (core.globalSymbols.list().length < 50) throw new Error('globalSymbols not shared');
if (typeof react.PipelineView !== 'object' && typeof react.PipelineView !== 'function') throw new Error('PipelineView missing');
const css = fileURLToPath(import.meta.resolve('@vespenelabs/pipeline-view/styles.css'));
if (!existsSync(css)) throw new Error('styles.css does not resolve');
console.log('✔ runtime: one shared core instance across subpaths; styles.css resolves');
`,
);
run('node', ['run.mjs'], work);
console.log('\nConsumer smoke test OK');
