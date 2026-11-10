import type { Diagram } from '@pipeline-view/core';
import { PipelineView, type NodeRendererEntry } from '@pipeline-view/react';
import { processSymbols } from '@pipeline-view/symbols';
import { useEffect, useRef, useState } from 'react';
import { WhatToTry } from '../../components/WhatToTry';
import { ReadingCard, UnitCard } from './Cards';
import { createPlant, reactNodesModel, readingSymbol, unitSymbol, type ReadingData } from './model';
import '../demo.css';
import './react-nodes.css';

const symbols = [...processSymbols, readingSymbol, unitSymbol];

/**
 * React components per node type. Reading cards size themselves from their content (their label); the live
 * value has a fixed-width slot so ticks don't resize them. Cards whose size is all live data are better
 * off with sizing: 'fixed'.
 */
const nodeRenderers: Record<string, NodeRendererEntry> = {
  'demo/reading': { component: ReadingCard, sizing: 'content' },
  'demo/unit': UnitCard,
};

/** `?static`: no ticking, for the visual test. */
const STATIC = new URLSearchParams(location.search).has('static');

const push = (h: number[], v: number) => [...h.slice(1), v];

export function ReactNodesDemo() {
  const [model] = useState(reactNodesModel);
  const [running, setRunning] = useState(!STATIC);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [tick, setTick] = useState(0);
  const [long, setLong] = useState(false);
  const diagram = useRef<Diagram | null>(null);

  // Live values at 1 Hz through setNodeDataBatch: only the nodes in the batch re-render.
  useEffect(() => {
    if (!running) return;
    const plant = createPlant();
    const id = setInterval(() => {
      const d = diagram.current;
      if (!d) return;
      const { tick: t, changed, state } = plant.next();
      const nodes = new Map(d.toJSON().nodes.map((n) => [n.id, n]));
      const reading = (id: string, value: number) => {
        const prev = nodes.get(id)?.data as ReadingData | undefined;
        return prev ? { data: { value, history: push(prev.history, value) } } : undefined;
      };
      const batch: Parameters<Diagram['setNodeDataBatch']>[0] = {};
      for (const id of changed) {
        const u =
          id === 'FT101'
            ? reading(id, state.flow)
            : id === 'TT102'
              ? reading(id, state.outlet)
              : id === 'LT101'
                ? reading(id, state.level)
                : id === 'E1'
                  ? { data: { inlet: state.inlet, outlet: state.outlet } }
                  : id === 'T1'
                    ? { data: { level: state.level / 100 } }
                    : undefined;
        if (u) batch[id] = u;
      }
      d.setNodeDataBatch(batch);
      setTick(t);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  /** Content sizing: a longer label widens the card, and the library moves its port and reroutes. */
  const toggleLong = () => {
    const d = diagram.current;
    if (!d) return;
    const next = !long;
    setLong(next);
    d.setNodeData('TT102', { label: next ? 'Exchanger outlet temperature' : 'Outlet temp' });
  };

  return (
    <>
      <h1>React nodes</h1>
      <p className="lede">
        Nodes can be React components. The cards below are rendered by your components inside the
        node&apos;s box; the library still draws the ports, routes the lines and handles selection.
        They mix freely with the SVG symbols, and a data tick re-renders only the cards it touched.
      </p>
      <WhatToTry
        steps={[
          <>
            Watch the <b>renders</b> counters: FT-101 updates every second, TT-102 every 2 s, LT-101
            every 3 s. Each card re-renders only when its own data changes.
          </>,
          <>
            Click <b>Long label</b>: the TT-102 card grows to fit its text, and the library moves
            its port and reroutes the signal line.
          </>,
          <>
            Click a card to select it: the selection outline comes from the component&apos;s props.
          </>,
          <>
            Switch to <b>Edit</b> and drag a card or the exchanger: ports and lines follow, as for
            any symbol.
          </>,
        ]}
      />
      <div className="demo-toolbar" role="toolbar" aria-label="React nodes">
        <button
          type="button"
          className="demo-btn"
          aria-pressed={running}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? 'Pause data' : 'Resume data'}
        </button>
        <button type="button" className="demo-btn" aria-pressed={long} onClick={toggleLong}>
          Long label
        </button>
        <span className="editor-sep" aria-hidden />
        <button
          type="button"
          className="demo-btn"
          aria-pressed={mode === 'edit'}
          onClick={() => setMode((m) => (m === 'edit' ? 'view' : 'edit'))}
        >
          Edit
        </button>
        <span className="demo-status" aria-live="polite">
          {running ? `Tick ${tick}` : 'Paused'}
        </span>
      </div>
      <div className="demo-canvas demo-canvas-wide" data-testid="react-nodes-canvas">
        <PipelineView
          model={model}
          mode={mode}
          symbols={symbols}
          nodeRenderers={nodeRenderers}
          options={{ ariaLabel: 'Plant with React node cards' }}
          style={{ height: '100%' }}
          onReady={(d) => {
            diagram.current = d;
            (window as unknown as { __diagram?: Diagram }).__diagram = d; // for tests and the console
          }}
        />
      </div>
    </>
  );
}
