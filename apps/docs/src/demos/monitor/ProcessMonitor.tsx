import {
  Diagram,
  type DataRecord,
  type DiagramModel,
  type HtmlRenderer,
  type ItemRef,
} from '@pipeline-view/core';
import { processSymbols } from '@pipeline-view/symbols';
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FRAME, monitorModel, terminal, type CardData, type Reading } from './model';
import { PumpState, ReadingCard } from './ReadingCard';
import { createSimulator } from './simulator';
import './monitor.css';

/** Mounts a React tree into an overlay slot. The overlay re-calls renderers on every data tick with the same element. */
function reactRenderer(render: (data: DataRecord) => React.ReactNode): HtmlRenderer {
  const roots = new WeakMap<HTMLElement, Root>();
  return (el, item) => {
    let root = roots.get(el);
    const first = !root;
    if (!root) roots.set(el, (root = createRoot(el)));
    root.render(render(item.data ?? {}));
    if (!first) return;
    return () => {
      roots.delete(el);
      const r = root;
      queueMicrotask(() => r.unmount());
    };
  };
}

const renderers: Record<string, HtmlRenderer> = {
  readingCard: reactRenderer((data) => {
    const d = data as CardData & Record<string, Reading | undefined>;
    const r = d[d.reading] ?? { value: Number.NaN, status: 'stale' as const };
    return (
      <ReadingCard
        tag={d.tag}
        unit={d.unit}
        decimals={d.decimals}
        value={r.value}
        status={r.status}
      />
    );
  }),
  pumpState: reactRenderer((data) => <PumpState running={data.running === true} />),
};

/**
 * `?static` shows the Figma reference state: simulator paused on the design's values, no flow animation and
 * no tank levels (the design has neither). Used for the side-by-side check and the visual test.
 */
const STATIC = new URLSearchParams(location.search).has('static');

function initialModel(): DiagramModel {
  if (!STATIC) return monitorModel;
  const m = structuredClone(monitorModel);
  for (const n of m.nodes) {
    if (!n.data) continue;
    delete n.data.level;
    // The design draws running pumps with an open impeller; keep the "Running" text via the annotation.
    if (n.type === 'process/pump') delete n.data.running;
  }
  for (const a of m.annotations ?? [])
    if (a.kind === 'html' && a.renderer === 'pumpState') a.data = { running: true };
  for (const l of m.links) l.data = { ...l.data, flowing: false };
  return m;
}

export function ProcessMonitor() {
  const host = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<Diagram | null>(null);
  const [running, setRunning] = useState(!STATIC);
  const [flow, setFlow] = useState(!STATIC);
  const [selected, setSelected] = useState<ItemRef | null>({ kind: 'node', id: 'FCV101' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const d = new Diagram({
      symbols: [...processSymbols, terminal],
      htmlRenderers: renderers,
      mode: 'view',
      ariaLabel: 'Mix and transfer process monitor',
    });
    d.mount(host.current!);
    d.load(initialModel());
    d.setSelection([{ kind: 'node', id: 'FCV101' }]);
    const fit = () => {
      const w = host.current?.clientWidth ?? FRAME.width;
      if (w >= FRAME.width) d.setViewport({ x: (w - FRAME.width) / 2, y: 0, zoom: 1 });
      else d.zoomToFit({ padding: 8 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host.current!);
    const off = d.on('selectionChange', ({ selection }) => setSelected(selection[0] ?? null));
    diagramRef.current = d;
    return () => {
      ro.disconnect();
      off();
      d.destroy();
      diagramRef.current = null;
    };
  }, []);

  // Simulated plant data at 1 Hz through the live-data path (no undo, no re-routing).
  useEffect(() => {
    if (!running) return;
    const sim = createSimulator(7);
    const id = setInterval(() => {
      const d = diagramRef.current;
      if (!d) return;
      const t = sim.next();
      const r = t.readings;
      d.setNodeDataBatch({
        MHWT: { data: { level: t.levels.MHWT, 'TI-101': r['TI-101'] } },
        MPAT: { data: { level: t.levels.MPAT, 'FI-103': r['FI-103'] } },
        MRM: { data: { level: t.levels.MRM } },
        MHT: { data: { level: t.levels.MHT, 'TI-102': r['TI-102'] } },
        FCV101: { data: { 'FI-101': r['FI-101'] } },
        P03: { data: { running: t.pumps.P03 } },
        P102: { data: { running: t.pumps.P102 } },
      });
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const firstFlow = useRef(true);
  useEffect(() => {
    const d = diagramRef.current;
    if (!d || firstFlow.current) {
      firstFlow.current = false;
      return;
    }
    d.update(
      (tx) => {
        for (const l of monitorModel.links)
          tx.updateLink(l.id, { data: { ...l.data, flowing: flow } });
      },
      { undoable: false },
    );
  }, [flow]);

  const node =
    selected?.kind === 'node' ? monitorModel.nodes.find((n) => n.id === selected.id) : undefined;

  return (
    <>
      <h1>Process monitor</h1>
      <p className="lede">
        The Figma &ldquo;Editable process diagram&rdquo; rebuilt with pipeline-view. Values come
        from a simulated data source at 1&nbsp;Hz through <code>setNodeDataBatch</code>; the reading
        cards are React components in the HTML overlay. Statuses are example states owned by this
        demo.
      </p>
      <div className="monitor-toolbar" role="toolbar" aria-label="Demo controls">
        <button type="button" aria-pressed={running} onClick={() => setRunning((v) => !v)}>
          {running ? 'Pause data' : 'Resume data'}
        </button>
        <button type="button" aria-pressed={flow} onClick={() => setFlow((v) => !v)}>
          Flow animation
        </button>
        <button
          type="button"
          onClick={() => diagramRef.current?.zoomToFit({ padding: 16, animate: true })}
        >
          Fit
        </button>
        <span className="monitor-tick" aria-live="off">
          {running ? `Tick ${tick}` : 'Paused'}
        </span>
      </div>
      <div className="monitor-frame" ref={host} data-testid="monitor-canvas" />
      <div className="monitor-details" aria-live="polite">
        {node ? (
          <>
            <strong>{node.label ?? node.id}</strong> <code>{node.type}</code> selected. A host app
            would open its detail panel here.
          </>
        ) : (
          'Click a piece of equipment to select it.'
        )}
      </div>
    </>
  );
}
