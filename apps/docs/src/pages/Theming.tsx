import { Code } from '../components/Code';

interface Token {
  name: string;
  light: string;
  dark: string;
  use: string;
  swatch?: boolean;
}

/** The --pv-* tokens defined by @pipeline-view/core/styles.css (values from the Figma reference). */
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
  { name: '--pv-radius', light: '6px', dark: '6px', use: 'Card and selection radius' },
  { name: '--pv-font', light: 'Inter, system-ui, sans-serif', dark: '', use: 'All diagram text' },
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
// ...or set data-theme="dark" on any ancestor element.`;

const STATUS = `/* status is free-form: the library only writes data-status="<value>". */
[data-status='alarm'] { color: #b62f38; }
[data-status='warning'] { color: #9a5900; }
[data-status='stale'] { opacity: 0.55; }

/* Per-medium pipe colours belong to your app, not the library. */
.pv-link[data-kind='process'][data-medium='gas'] { stroke: #c9a227; }`;

export function Theming() {
  return (
    <article className="prose">
      <h1>Theming</h1>
      <p className="lede">
        Every visual value is a CSS custom property, so restyling needs no JavaScript. Symbols draw
        with <code>currentColor</code>; recolouring them is one token.
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
