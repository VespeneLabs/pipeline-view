import { Code } from '../components/Code';

const INSTALL = `# .npmrc: the package is on GitHub Packages (see the README for the token)
@vespenelabs:registry=https://npm.pkg.github.com

pnpm add @vespenelabs/pipeline-view`;

const VANILLA = `import { Diagram, type DiagramModel } from '@vespenelabs/pipeline-view';
import { gasSymbols, processSymbols } from '@vespenelabs/pipeline-view/symbols';
import '@vespenelabs/pipeline-view/styles.css';

const model: DiagramModel = {
  version: 2,
  nodes: [
    { id: 'P101', type: 'process/pump', position: { x: 0, y: 40 }, label: 'P101' },
    { id: 'XV1', type: 'gas/ball-valve', position: { x: 180, y: 60 }, label: 'XV-1' },
    { id: 'PT1', type: 'gas/pressure-transmitter', position: { x: 340, y: 0 }, data: { loop: 101 } },
  ],
  links: [
    { id: 'l1', kind: 'process', from: { node: 'P101', port: 'discharge' }, to: { node: 'XV1', port: 'in' } },
    { id: 'l2', kind: 'signal', from: { node: 'PT1', port: 'signal' }, to: { node: 'XV1', port: 'out' } },
  ],
};

const diagram = new Diagram({ symbols: [...gasSymbols, ...processSymbols], mode: 'view' });
diagram.mount(document.getElementById('plant')!);
diagram.load(model);
diagram.zoomToFit({ padding: 24 });`;

const LIVE = `// Live values: no undo entry, no re-routing, no modelChange event.
socket.onmessage = (msg) => {
  const { tag, value } = JSON.parse(msg.data);
  diagram.setNodeData(tag, { value }, value > 8 ? 'alarm' : 'normal');
};

// Or many at once, once per tick:
diagram.setNodeDataBatch({
  XV1: { data: { open: false } },
  P101: { data: { running: true }, status: 'normal' },
});`;

const EVENTS = `diagram.on('nodeClick', ({ item }) => openDetails(item.id));
diagram.on('selectionChange', ({ selection }) => console.log(selection));`;

const SSR = `// Next.js / Remix: importing is safe on the server; mount only in the browser.
useEffect(() => {
  const d = new Diagram({ symbols: gasSymbols });
  d.mount(ref.current!);
  d.load(model);
  return () => d.destroy();
}, []);`;

export function GettingStarted() {
  return (
    <article className="prose">
      <h1>Getting started</h1>
      <p className="lede">
        pipeline-view renders interactive process and P&amp;ID diagrams: live monitoring screens and
        diagram editors. It draws the diagram and exposes hooks; data transport, alarm logic and
        equipment write-back stay in your app.
      </p>

      <h2>Install</h2>
      <Code>{INSTALL}</Code>
      <p>
        One package with subpaths: <code>@vespenelabs/pipeline-view</code> (the core, no runtime
        dependencies), <code>/symbols</code> (tree-shakable, so you can import single symbols like{' '}
        <code>gateValve</code>), <code>/react</code>, <code>/testing</code> and{' '}
        <code>/styles.css</code>. It&apos;s published privately to GitHub Packages; the README
        explains the access token.
      </p>

      <h2>Your first diagram</h2>
      <p>
        A diagram is plain JSON: nodes reference a symbol <code>type</code>, and links connect named
        ports. Pipes are routed orthogonally around nodes automatically.
      </p>
      <Code>{VANILLA}</Code>

      <h2>Push live data</h2>
      <p>
        The library never fetches data. Push values from MQTT, OPC UA, WebSockets or polling through
        the high-frequency path. <code>status</code> is a free-form string that ends up as a{' '}
        <code>data-status</code> attribute you style yourself (see <a href="#/theming">Theming</a>
        ).
      </p>
      <Code>{LIVE}</Code>

      <h2>React to the operator</h2>
      <p>
        Clicks, selection and context menus arrive as typed events. Commands to equipment only ever
        leave the library as events; your app decides what to do with them.
      </p>
      <Code>{EVENTS}</Code>

      <h2>Server rendering</h2>
      <p>
        Every entry point is safe to import during SSR, and CI checks this by importing them in
        plain Node with no DOM. <code>new Diagram()</code>, <code>load()</code>,{' '}
        <code>update()</code> and the other model APIs run on the server too. Only{' '}
        <code>mount()</code> and export need a browser. With React,{' '}
        <code>&lt;PipelineView&gt;</code> server-renders an empty host element and creates the
        diagram in an effect on the client, so no extra guard is needed. With the vanilla API, mount
        in an effect:
      </p>
      <Code>{SSR}</Code>

      <h2>Next steps</h2>
      <ul>
        <li>
          <a href="#/gallery">Symbol gallery</a>: every built-in symbol with its ports.
        </li>
        <li>
          <a href="#/custom-symbols">Custom symbols</a>: add your own industry pack.
        </li>
        <li>
          <a href="#/theming">Theming</a>: tokens, dark mode and status styling.
        </li>
        <li>
          <a href="#/controlled-guide">Controlled mode with Zustand</a>: keep the document in your
          own store.
        </li>
        <li>
          <a href="#/testing">Testing</a>: test your app&apos;s diagrams with Vitest or Jest.
        </li>
      </ul>
    </article>
  );
}
