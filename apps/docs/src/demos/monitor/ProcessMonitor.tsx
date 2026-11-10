import type { Diagram, DiagramModel } from '@pipeline-view/core';
import { PipelineView, type ReactRenderer } from '@pipeline-view/react';
import { processSymbols } from '@pipeline-view/symbols';
import { useEffect, useRef, useState } from 'react';
import { FRAME, monitorModel, terminal, type CardData, type Reading } from './model';
import { PumpState, ReadingCard } from './ReadingCard';
import { createSimulator } from './simulator';
import './monitor.css';

/** React overlay renderers. The overlay re-renders them on every data tick with the merged node data. */
const renderers: Record<string, ReactRenderer> = {
  readingCard: ({ data }) => {
    const d = (data ?? {}) as CardData & Record<string, Reading | undefined>;
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
  },
  pumpState: ({ data }) => <PumpState running={data?.running === true} />,
};

const symbols = [...processSymbols, terminal];

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
  const diagramRef = useRef<Diagram | null>(null);
  const [model] = useState(initialModel);
  const [running, setRunning] = useState(!STATIC);
  const [flow, setFlow] = useState(!STATIC);
  const [selected, setSelected] = useState<string | null>('FCV101');
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState<Diagram | null>(null);
  // Runs after PipelineView's own effects of the same commit, so after it has loaded the model (a load
  // clears the selection). The Figma frame shows FCV101 selected.
  useEffect(() => {
    if (ready?.toJSON().nodes.some((n) => n.id === 'FCV101')) {
      ready.setSelection([{ kind: 'node', id: 'FCV101' }]);
    }
  }, [ready]);

  /** 1:1 with the Figma frame when it fits, otherwise zoom to fit. */
  const frameView = (d: Diagram) => {
    const w = d.view?.root.clientWidth ?? FRAME.width;
    if (w >= FRAME.width) d.setViewport({ x: (w - FRAME.width) / 2, y: 0, zoom: 1 });
    else d.zoomToFit({ padding: 8 });
  };

  const resize = useRef<ResizeObserver | null>(null);
  const onReady = (d: Diagram) => {
    diagramRef.current = d;
    (window as unknown as { __diagram?: Diagram }).__diagram = d; // for tests and the console
    frameView(d);
    setReady(d);
    resize.current?.disconnect();
    resize.current = new ResizeObserver(() => frameView(d));
    if (d.view) resize.current.observe(d.view.root);
  };
  useEffect(() => () => resize.current?.disconnect(), []);

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

  // Flow animation toggle. Driven by the loaded diagram (`ready`), and it only touches links that exist, so it
  // is safe under StrictMode's double effects and before or after any load.
  useEffect(() => {
    if (!ready) return;
    const links = ready.toJSON().links.filter((l) => !!l.data?.flowing !== flow);
    if (!links.length) return;
    ready.update(
      (tx) => {
        for (const l of links) tx.updateLink(l.id, { data: { ...l.data, flowing: flow } });
      },
      { undoable: false },
    );
  }, [ready, flow]);

  const node = selected ? monitorModel.nodes.find((n) => n.id === selected) : undefined;

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
      <div className="monitor-frame" data-testid="monitor-canvas">
        <PipelineView
          model={model}
          mode="view"
          symbols={symbols}
          renderers={renderers}
          fitOnLoad={false}
          options={{ ariaLabel: 'Mix and transfer process monitor' }}
          onReady={onReady}
          onSelectionChange={({ selection }) =>
            setSelected(selection[0]?.kind === 'node' ? selection[0].id : null)
          }
          style={{ width: '100%', height: '100%' }}
        />
      </div>
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
