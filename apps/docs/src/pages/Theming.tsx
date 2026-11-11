import { Code } from '../components/Code';

interface Token {
  name: string;
  light: string;
  dark: string;
  use: string;
  swatch?: boolean;
}

/** The --pv-* tokens defined by @vespenelabs/pipeline-view/styles.css (values from the Figma reference). */
const TOKENS: Token[] = [
  { name: '--pv-bg', light: '#ffffff', dark: '#0e171c', use: 'Canvas background', swatch: true },
  { name: '--pv-border', light: '#d8e1e5', dark: '#2a3a43', use: 'Frame border', swatch: true },
  {
    name: '--pv-grid',
    light: '#eef2f4',
    dark: '#172229',
    use: 'Grid lines (off by default)',
    swatch: true,
  },
  { name: '--pv-line', light: '#637783', dark: '#8a9eaa', use: 'Process lines', swatch: true },
  {
    name: '--pv-line-signal',
    light: '#637783',
    dark: '#8a9eaa',
    use: 'Instrument signal lines',
    swatch: true,
  },
  { name: '--pv-line-width', light: '2.4px', dark: '2.4px', use: 'Link stroke width' },
  { name: '--pv-line-signal-dash', light: '4 5', dark: '4 5', use: 'Signal dash pattern' },
  { name: '--pv-line-electrical-dash', light: '10 7', dark: '10 7', use: 'Electrical signal dash' },
  {
    name: '--pv-line-pneumatic-dash',
    light: 'none',
    dark: 'none',
    use: 'Pneumatic dash (core draws paired // ticks instead)',
  },
  {
    name: '--pv-tick-spacing',
    light: '40',
    dark: '40',
    use: 'Distance between pneumatic tick pairs (unitless)',
  },
  {
    name: '--pv-arrow-size',
    light: '10',
    dark: '10',
    use: 'Flow-direction chevron size (unitless)',
  },
  {
    name: '--pv-flow-color',
    light: 'var(--pv-line)',
    dark: 'var(--pv-line)',
    use: 'Flow animation dashes',
  },
  { name: '--pv-flow-dash', light: '8 12', dark: '8 12', use: 'Flow animation dash pattern' },
  { name: '--pv-junction-radius', light: '4.8', dark: '4.8', use: 'Branch dot radius (unitless)' },
  { name: '--pv-jump-radius', light: '8', dark: '8', use: 'Line-jump hop radius (unitless)' },
  {
    name: '--pv-leader-line',
    light: 'var(--pv-line-signal)',
    dark: 'var(--pv-line-signal)',
    use: 'Card leader lines',
  },
  {
    name: '--pv-link-label-ink',
    light: 'var(--pv-ink)',
    dark: 'var(--pv-ink)',
    use: 'Link label text',
  },
  {
    name: '--pv-link-label-bg',
    light: 'var(--pv-bg)',
    dark: 'var(--pv-bg)',
    use: 'Halo behind link labels (keeps them readable over lines)',
  },
  {
    name: '--pv-symbol-stroke',
    light: '#334d5b',
    dark: '#b9c8d0',
    use: 'Symbol linework (currentColor)',
    swatch: true,
  },
  { name: '--pv-symbol-stroke-width', light: '2.4px', dark: '2.4px', use: 'Symbol stroke width' },
  {
    name: '--pv-symbol-fill',
    light: 'var(--pv-bg)',
    dark: 'var(--pv-bg)',
    use: 'Knockout fills inside symbols',
  },
  {
    name: '--pv-level-fill',
    light: 'var(--pv-line)',
    dark: 'var(--pv-line)',
    use: 'Tank level fill',
  },
  { name: '--pv-level-opacity', light: '0.18', dark: '0.28', use: 'Tank level fill opacity' },
  { name: '--pv-ink', light: '#192d38', dark: '#e3ebef', use: 'Labels', swatch: true },
  { name: '--pv-muted', light: '#596c77', dark: '#93a6b1', use: 'Secondary text', swatch: true },
  {
    name: '--pv-selection',
    light: '#185ac7',
    dark: '#6ea8ff',
    use: 'Selection outline and label',
    swatch: true,
  },
  {
    name: '--pv-selection-bg',
    light: '#eef4ff',
    dark: '#15243a',
    use: 'Selection fill',
    swatch: true,
  },
  {
    name: '--pv-card-bg',
    light: '#f5f8f9',
    dark: '#152129',
    use: 'HTML card background',
    swatch: true,
  },
  {
    name: '--pv-card-border',
    light: '#d8e1e5',
    dark: '#2a3a43',
    use: 'HTML card border',
    swatch: true,
  },
  { name: '--pv-selection-radius', light: '6px', dark: '6px', use: 'Selection box radius' },
  {
    name: '--pv-focus-ring',
    light: '#185ac7',
    dark: '#6ea8ff',
    use: 'Keyboard focus ring',
    swatch: true,
  },
  { name: '--pv-radius', light: '6px', dark: '6px', use: 'Card radius' },
  { name: '--pv-frame-radius', light: '10px', dark: '10px', use: 'Diagram frame radius' },
  { name: '--pv-font-size-label', light: '14px', dark: '14px', use: 'Node labels (SemiBold)' },
  { name: '--pv-font-size-small', light: '12px', dark: '12px', use: 'Area labels, legends, cards' },
  { name: '--pv-font', light: 'Inter, system-ui, sans-serif', dark: '', use: 'All diagram text' },
  {
    name: '--pv-issue-error',
    light: '#c62828',
    dark: '#ff6b6b',
    use: 'Problem marker badge: error',
    swatch: true,
  },
  {
    name: '--pv-issue-warning',
    light: '#b26a00',
    dark: '#f0a830',
    use: 'Problem marker badge: warning',
    swatch: true,
  },
  {
    name: '--pv-issue-info',
    light: '#1f6fb2',
    dark: '#6ea8ff',
    use: 'Problem marker badge: info',
    swatch: true,
  },
  {
    name: '--pv-issue-ink',
    light: '#ffffff',
    dark: '#0e171c',
    use: 'Icon on a badge',
    swatch: true,
  },
  {
    name: '--pv-issue-badge-ring',
    light: 'var(--pv-bg)',
    dark: 'var(--pv-bg)',
    use: 'Ring that separates a badge from lines',
  },
  {
    name: '--pv-diff-added',
    light: '#1b873f',
    dark: '#4cc274',
    use: 'Compare: added items',
    swatch: true,
  },
  {
    name: '--pv-diff-removed',
    light: '#c62828',
    dark: '#ff6b6b',
    use: 'Compare: removed items (ghosts)',
    swatch: true,
  },
  {
    name: '--pv-diff-moved',
    light: '#1f6fb2',
    dark: '#6ea8ff',
    use: 'Compare: moved items',
    swatch: true,
  },
  {
    name: '--pv-diff-changed',
    light: '#b26a00',
    dark: '#f0a830',
    use: 'Compare: changed items',
    swatch: true,
  },
  {
    name: '--pv-diff-ghost-opacity',
    light: '0.35',
    dark: '0.35',
    use: 'Opacity of removed-item ghosts',
  },
];

const OVERRIDE = `/* Brand the diagram: override any token on the container or an ancestor. */
.plant-view {
  --pv-line: #3a6f8f;
  --pv-symbol-stroke: #1f3b4d;
  --pv-font: 'IBM Plex Sans', sans-serif;
}`;

const FORCE = `// Follows prefers-color-scheme by default ('auto').
new Diagram({ theme: 'dark' });
diagram.setTheme('light');
// ...or set data-theme="dark" on any ancestor element.

// Optional background grid, drawn with --pv-grid:
new Diagram({ grid: { size: 20, snap: true, visible: true } });`;

const STATUS = `/* status is free-form: the library only writes data-status="<value>".
   Scope to .pv-node / .pv-overlay-item so the rules win regardless of stylesheet order. */
.pv-node[data-status='alarm'] { color: #b62f38; }
.pv-node[data-status='warning'] { color: #9a5900; }
.pv-node[data-status='stale'] { opacity: 0.55; }
.pv-overlay-item[data-status='alarm'] { outline: 2px solid #b62f38; }

/* Per-medium pipe colours belong to your app, not the library. */
.pv-link[data-kind='process'][data-medium='gas'] { stroke: #c9a227; }`;

export function Theming() {
  return (
    <article className="prose">
      <h1>Theming</h1>
      <p className="lede">
        Every visual value is a CSS custom property, so restyling needs no JavaScript. Import{' '}
        <code>@vespenelabs/pipeline-view/styles.css</code> once; its tokens have zero specificity,
        so any rule of yours wins. Symbols draw with <code>currentColor</code>; recolouring them is
        one token.
      </p>

      <h2>Light and dark</h2>
      <Code>{FORCE}</Code>

      <h2>Tokens</h2>
      <p>The swatches follow the theme you have selected in the sidebar.</p>
      <div className="table-wrap">
        <table className="token-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Light</th>
              <th>Dark</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            {TOKENS.map((t) => (
              <tr key={t.name}>
                <td>
                  {t.swatch && (
                    <span className="swatch" style={{ background: `var(${t.name})` }} aria-hidden />
                  )}
                  <code>{t.name}</code>
                </td>
                <td>
                  <code>{t.light}</code>
                </td>
                <td>{t.dark && <code>{t.dark}</code>}</td>
                <td>{t.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Overriding tokens</h2>
      <Code>{OVERRIDE}</Code>

      <h2>Status styling</h2>
      <p>
        The library has no alarm model. It writes a node's or link's <code>status</code> to{' '}
        <code>data-status</code> and leaves the meaning to you. The process monitor demo uses four
        example states: normal, warning, alarm and stale. Always pair colour with shape or text so
        states never rely on colour alone.
      </p>
      <Code>{STATUS}</Code>
    </article>
  );
}
