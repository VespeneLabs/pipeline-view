import type { Diagram } from '@pipeline-view/core';
import { PipelineView } from '@pipeline-view/react';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import { useEffect, useRef, useState } from 'react';
import { generateScene, tickValues } from './scene';
import './stress.css';

const symbols = [...gasSymbols, ...processSymbols];
const BUDGET = { tickMs: 4, fps: 55, dragRouteMs: 16 };

interface Stats {
  fps: number;
  tick: number;
  /** Main-thread time of setNodeDataBatch (sync part). */
  batchMs: number;
  /** Renderer flush of the last data-only frame. */
  dataFlushMs: number;
  /** First full flush after load, including routing all links. */
  loadFlushMs: number;
}

/** Internal render metrics. Not public API; this page is a perf harness. */
const metrics = (d: Diagram) =>
  (d as unknown as { renderer?: { metrics: { lastFlushMs: number; lastDataFlushMs: number } } })
    .renderer?.metrics;

/** Average and minimum frame rate while the viewport pans and zooms for `ms`. */
function panTest(d: Diagram, ms = 3000): Promise<{ avgFps: number; minFps: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const base = d.getViewport();
    let last = start;
    let frames = 0;
    let worst = Infinity;
    const step = (now: number) => {
      const t = (now - start) / ms;
      if (frames > 0) worst = Math.min(worst, 1000 / Math.max(1, now - last));
      last = now;
      frames++;
      d.setViewport({
        x: base.x - 600 * Math.sin(t * Math.PI * 2),
        y: base.y - 300 * Math.sin(t * Math.PI),
        zoom: base.zoom * (1 + 0.5 * Math.sin(t * Math.PI)),
      });
      if (now - start < ms) requestAnimationFrame(step);
      else {
        d.setViewport(base);
        resolve({ avgFps: Math.round((frames * 1000) / (now - start)), minFps: Math.round(worst) });
      }
    };
    requestAnimationFrame(step);
  });
}

export function StressTest() {
  const [model] = useState(generateScene);
  const diagram = useRef<Diagram | null>(null);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState<Stats>({
    fps: 0,
    tick: 0,
    batchMs: 0,
    dataFlushMs: 0,
    loadFlushMs: 0,
  });
  const [pan, setPan] = useState<{ avgFps: number; minFps: number } | null>(null);
  const tickRef = useRef(0);

  // One rAF loop measures frame rate and drives the 1 Hz data tick.
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();
    let lastTick = windowStart;
    let batchMs = 0;
    const mountedAt = performance.now();
    let loadMs = 0;
    const loop = () => {
      const now = performance.now();
      frames++;
      const d = diagram.current;
      if (d && running && now - lastTick >= 1000) {
        lastTick = now;
        const t0 = performance.now();
        d.setNodeDataBatch(tickValues(model, ++tickRef.current));
        batchMs = performance.now() - t0;
      }
      const m = d && metrics(d);
      // The largest flush in the first seconds is the initial render, which routes every link.
      if (m && now - mountedAt < 5000) loadMs = Math.max(loadMs, m.lastFlushMs);
      if (now - windowStart >= 1000) {
        // Snapshot the values now: the state updater runs later, after the counters reset.
        const next = {
          fps: Math.round((frames * 1000) / (now - windowStart)),
          tick: tickRef.current,
          batchMs,
          dataFlushMs: m?.lastDataFlushMs ?? 0,
          loadFlushMs: loadMs,
        };
        setStats(next);
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [model, running]);

  const onReady = (d: Diagram) => {
    diagram.current = d;
    // Hook for automated perf checks (Playwright, the console).
    (window as unknown as { __stress?: unknown }).__stress = {
      diagram: d,
      nodes: model.nodes.length,
      links: model.links.length,
      /** Full cost of one data tick: the batch plus the render and overlay flushes it schedules. */
      tick: () => {
        const t0 = performance.now();
        d.setNodeDataBatch(tickValues(model, ++tickRef.current));
        const internals = d as unknown as {
          renderer?: { flush(): void };
          overlay?: { flush(): void };
        };
        internals.renderer?.flush();
        internals.overlay?.flush();
        return performance.now() - t0;
      },
      panTest: (ms?: number) => panTest(d, ms),
      metrics: () => ({ ...metrics(d) }),
    };
  };

  const runPan = async () => {
    if (diagram.current) setPan(await panTest(diagram.current));
  };

  const ok = (v: number, limit: number, lower = false) =>
    v === 0 ? undefined : (lower ? v >= limit : v <= limit) ? 'ok' : 'over';

  return (
    <>
      <h1>Stress test</h1>
      <p className="lede">
        {model.nodes.length} nodes, {model.links.length} links and {model.nodes.length * 4} values
        updating at 1&nbsp;Hz (PRD NFR-1). Budgets: data tick ≤ {BUDGET.tickMs}&nbsp;ms, pan and
        zoom ≥ {BUDGET.fps}&nbsp;fps. Measure in a production build (
        <code>pnpm build && pnpm preview</code>
        ).
      </p>
      <div className="stress-toolbar">
        <button type="button" aria-pressed={running} onClick={() => setRunning((v) => !v)}>
          {running ? 'Pause data' : 'Resume data'}
        </button>
        <button type="button" onClick={runPan}>
          Run pan/zoom test (3 s)
        </button>
        <button
          type="button"
          onClick={() => diagram.current?.zoomToFit({ padding: 24, animate: true })}
        >
          Fit
        </button>
      </div>
      <dl className="stress-stats" data-testid="stress-stats">
        <div>
          <dt>Frame rate</dt>
          <dd data-state={ok(stats.fps, BUDGET.fps, true)}>{stats.fps} fps</dd>
        </div>
        <div>
          <dt>Data ticks</dt>
          <dd data-testid="stress-ticks">{stats.tick}</dd>
        </div>
        <div>
          <dt>setNodeDataBatch</dt>
          <dd data-state={ok(stats.batchMs, BUDGET.tickMs)}>{stats.batchMs.toFixed(2)} ms</dd>
        </div>
        <div>
          <dt>Data render flush</dt>
          <dd data-state={ok(stats.dataFlushMs, BUDGET.tickMs)}>
            {stats.dataFlushMs.toFixed(2)} ms
          </dd>
        </div>
        <div>
          <dt>Initial render + routing</dt>
          <dd>{stats.loadFlushMs.toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Pan/zoom test</dt>
          <dd data-state={pan ? ok(pan.minFps, BUDGET.fps, true) : undefined}>
            {pan ? `${pan.avgFps} avg / ${pan.minFps} min fps` : 'not run'}
          </dd>
        </div>
      </dl>
      <div className="stress-frame">
        <PipelineView
          model={model}
          mode="view"
          symbols={symbols}
          onReady={onReady}
          options={{ ariaLabel: 'Stress test diagram, 500 nodes' }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </>
  );
}
