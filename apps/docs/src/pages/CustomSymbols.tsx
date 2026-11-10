import { type SymbolDef } from '@pipeline-view/core';
import { Code } from '../components/Code';
import { SymbolCard } from './Gallery';

/** Example from a non-gas industry: proves the core stays industry-neutral. */
const uvReactor: SymbolDef = {
  type: 'water/uv-reactor',
  name: 'UV reactor',
  category: 'Water treatment',
  size: { width: 120, height: 60 },
  ports: [
    { id: 'in', position: { x: 0, y: 30 }, direction: 'left', accepts: ['process'] },
    { id: 'out', position: { x: 120, y: 30 }, direction: 'right', accepts: ['process'] },
  ],
  render: ({ data }) => `
    <g fill="none" stroke="currentColor" stroke-width="2">
      <path d="M0 30H16M104 30H120"/>
      <rect x="16" y="12" width="88" height="36" rx="18"/>
      ${[40, 60, 80].map((x) => `<path d="M${x} 20V40" ${data.lampsOn ? 'stroke-width="4"' : ''}/>`).join('')}
    </g>`,
  keywords: ['disinfection', 'ultraviolet'],
};

const DEF = `import { registerSymbol, type SymbolDef } from '@vespenelabs/pipeline-view';

export const uvReactor: SymbolDef = {
  type: 'water/uv-reactor',          // always namespaced: '<pack>/<name>'
  name: 'UV reactor',
  category: 'Water treatment',        // palette group
  size: { width: 120, height: 60 },   // local coordinates, unrotated
  ports: [
    { id: 'in', position: { x: 0, y: 30 }, direction: 'left', accepts: ['process'] },
    { id: 'out', position: { x: 120, y: 30 }, direction: 'right', accepts: ['process'] },
  ],
  // Static markup works too: svg: '<path .../>'
  render: ({ data }) => \`
    <g fill="none" stroke="currentColor" stroke-width="2">
      <path d="M0 30H16M104 30H120"/>
      <rect x="16" y="12" width="88" height="36" rx="18"/>
      \${[40, 60, 80].map((x) => \`<path d="M\${x} 20V40" \${data.lampsOn ? 'stroke-width="4"' : ''}/>\`).join('')}
    </g>\`,
};

registerSymbol(uvReactor);                 // globally...
new Diagram({ symbols: [uvReactor] });     // ...or per diagram`;

const PACK = `// water-pack/index.ts: one module per symbol keeps the pack tree-shakable.
export { uvReactor } from './uv-reactor';
export { clarifier } from './clarifier';
export const waterSymbols = [uvReactor, clarifier];
export const registerWaterSymbols = (registry = globalSymbols) => registry.register(...waterSymbols);`;

export function CustomSymbols() {
  return (
    <article className="prose">
      <h1>Custom symbols</h1>
      <p className="lede">
        The built-in gas pack is just a list of <code>SymbolDef</code> objects. Your own symbols are
        registered the same way and behave exactly like built-in ones: ports, routing, rotation,
        palette and theming.
      </p>

      <h2>Anatomy of a symbol</h2>
      <div className="example-row">
        <SymbolCard def={uvReactor} showPorts />
      </div>
      <Code>{DEF}</Code>

      <h2>Rules that keep symbols themeable</h2>
      <ul>
        <li>
          Draw with <code>stroke=&quot;currentColor&quot;</code> and never hard-code colours. Use{' '}
          <code>var(--pv-symbol-fill)</code> for knockout fills.
        </li>
        <li>
          Return inner markup only: no <code>&lt;svg&gt;</code> wrapper, no <code>id</code>{' '}
          attributes (a symbol appears many times on a page).
        </li>
        <li>
          Place every port inside <code>size</code>, at the end of its pipe stub, with the{' '}
          <code>direction</code> a pipe leaves in. Use <code>accepts</code> to restrict link kinds.
        </li>
        <li>
          Escape any text you take from <code>data</code> before putting it into markup.
        </li>
        <li>
          <code>render()</code> runs on live-data ticks, so keep it cheap: precompute static parts.
        </li>
      </ul>

      <h2>Shipping an industry pack</h2>
      <Code>{PACK}</Code>
    </article>
  );
}
