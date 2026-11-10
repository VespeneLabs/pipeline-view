import { Code } from '../components/Code';

const INSTALL = `pnpm add @pipeline-view/core @pipeline-view/symbols`;

const VANILLA = `import { Diagram, type DiagramModel } from '@pipeline-view/core';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import '@pipeline-view/core/styles.css';

const model: DiagramModel = {
  version: 1,
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
        <code>@pipeline-view/core</code> has no runtime dependencies.{' '}
        <code>@pipeline-view/symbols</code> is tree-shakable, so you can import single symbols like{' '}
        <code>gateValve</code> instead of whole packs.
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
      <p>Every package is safe to import during SSR. Create and mount the diagram on the client.</p>
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
      </ul>
    </article>
  );
}
