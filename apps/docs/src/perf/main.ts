/**
 * NFR-1 stress scene: 500 nodes, 1,000 links, 2,000 live values per tick (4 per node) and 100 live
 * HTML cards, rendered by the plain core API (no framework overhead), at 1:1 with the library.
 * The measuring hooks are on window.__pv for e2e/perf.spec.ts. Open /perf.html?run to see a 1 Hz feed.
 */
import { Diagram, type DiagramModel, type LinkModel, type NodeModel } from '@pipeline-view/core';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import '@pipeline-view/core/styles.css';

const COLS = 25;
const ROWS = 20;
const DX = 220;
const DY = 180;
const TYPES = [
  'gas/gate-valve',
  'gas/ball-valve',
  'gas/globe-valve',
  'gas/needle-valve',
  'process/control-valve',
];
const STATUSES = ['normal', 'normal', 'normal', 'warning', 'alarm', 'stale'];

function buildModel(): DiagramModel {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      nodes.push({
        id: `n${i}`,
        type: TYPES[i % TYPES.length]!,
        position: { x: c * DX, y: r * DY },
        label: `V-${100 + i}`,
        data: { open: true, value: 0, pressure: 0, temp: 0 },
      });
    }
  }
  const link = (a: number, b: number, kind: string) =>
    links.push({
      id: `l${links.length}`,
      from: { node: `n${a}`, port: 'out' },
      to: { node: `n${b}`, port: 'in' },
      kind,
    });
  // Rows (480), columns (475), then diagonals until exactly 1,000 links.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS - 1; c++) link(r * COLS + c, r * COLS + c + 1, 'process');
  for (let r = 0; r < ROWS - 1; r++)
    for (let c = 0; c < COLS; c++) link(r * COLS + c, (r + 1) * COLS + c, 'signal');
  for (let k = 0; links.length < 1000; k++) {
    const r = k % (ROWS - 1);
    const c = (k * 7) % (COLS - 1);
    link(r * COLS + c, (r + 1) * COLS + c + 1, 'process');
  }
  const annotations = Array.from({ length: 100 }, (_, k) => ({
    id: `card${k}`,
    kind: 'html' as const,
    renderer: 'card',
    position: { x: 0, y: -40 },
    size: { width: 90, height: 28 },
    anchor: { node: `n${k * 5}` },
  }));
  return { version: 1, nodes, links, annotations };
}

const t0 = performance.now();
const diagram = new Diagram({
  symbols: [...gasSymbols, ...processSymbols],
  htmlRenderers: {
    card: (el, item) => {
      el.textContent = `${Number(item.data?.value ?? 0).toFixed(1)} bar`;
      el.className = 'pv-overlay-item perf-card';
    },
  },
});
diagram.mount(document.getElementById('plant')!);
diagram.load(buildModel());
diagram.renderer!.flush();
diagram.overlay!.flush();
diagram.zoomToFit();
const loadMs = performance.now() - t0;

let seq = 0;
/** One 1 Hz data tick: 2,000 values (4 per node) with statuses. Returns its main-thread time in ms. */
function tick(): number {
  seq++;
  const updates: Record<string, { data: Record<string, unknown>; status: string }> = {};
  for (let i = 0; i < ROWS * COLS; i++) {
    const v = Math.sin(seq / 3 + i) * 5 + 5;
    updates[`n${i}`] = {
      data: { open: (seq + i) % 7 !== 0, value: v, pressure: v * 1.3, temp: 20 + v },
      status: STATUSES[(seq + i) % STATUSES.length]!,
    };
  }
  const start = performance.now();
  diagram.setNodeDataBatch(updates);
  // The work the next animation frame would do, done synchronously so it's measurable.
  diagram.renderer!.flush();
  diagram.overlay!.flush();
  return performance.now() - start;
}

/** Drags node n312 (mid-scene) by `steps` preview moves. Returns the per-move time (update + reroute + render). */
function drag(steps = 20): number[] {
  const n = diagram.store.nodes.get('n312')!;
  const times: number[] = [];
  for (let s = 1; s <= steps; s++) {
    const start = performance.now();
    diagram.preview((tx) =>
      tx.updateNode('n312', { position: { x: n.position.x + s * 3, y: n.position.y + s * 2 } }),
    );
    diagram.renderer!.flush();
    diagram.overlay!.flush();
    times.push(performance.now() - start);
  }
  diagram.cancelPreview();
  diagram.renderer!.flush();
  return times;
}

/** Pans and zooms every animation frame for `ms`. Returns the frame intervals. */
function panZoom(ms = 2000): Promise<number[]> {
  return new Promise((resolve) => {
    const start = diagram.getViewport();
    const deltas: number[] = [];
    let last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      deltas.push(now - last);
      last = now;
      const t = (now - t0) / 1000;
      diagram.setViewport({
        x: start.x + Math.sin(t * 2) * 300,
        y: start.y + Math.cos(t * 2) * 200,
        zoom: start.zoom * (1.5 + Math.sin(t) * 0.5),
      });
      if (now - t0 < ms) requestAnimationFrame(frame);
      else resolve(deltas.slice(1));
    };
    requestAnimationFrame(frame);
  });
}

const counts = {
  nodes: diagram.store.nodes.size,
  links: diagram.store.links.size,
  annotations: diagram.store.annotations.size,
  valuesPerTick: diagram.store.nodes.size * 4,
};
Object.assign(window, { __pv: { diagram, tick, drag, panZoom, loadMs, counts } });

if (new URLSearchParams(location.search).has('run')) setInterval(tick, 1000);
