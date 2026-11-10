import { afterEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { DiagramOptions } from '../diagram/types';
import type { DiagramModel, LinkModel, NodeModel } from '../model/types';
import type { WorkerLike } from '../routing/worker-client';
import { type RoutingJob, type RoutingReply, runRoutingJob } from '../routing/worker-protocol';
import type { SymbolDef } from '../symbols/types';

const valve: SymbolDef = {
  type: 't/valve',
  name: 'Valve',
  category: 'T',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left' },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right' },
  ],
};

/** 20 × 17 valves, chained row by row: 323 links, above the default threshold of 300. */
function scene(): DiagramModel {
  const nodes: NodeModel[] = [];
  const links: LinkModel[] = [];
  for (let r = 0; r < 17; r++)
    for (let c = 0; c < 20; c++) {
      nodes.push({
        id: `n${r}-${c}`,
        type: 't/valve',
        position: { x: c * 90, y: r * 70 + (c % 2) * 15 },
      });
      if (c > 0)
        links.push({
          id: `l${r}-${c}`,
          from: { node: `n${r}-${c - 1}`, port: 'out' },
          to: { node: `n${r}-${c}`, port: 'in' },
          kind: 'process',
        });
    }
  return { version: 2, nodes, links };
}

/** In-process stand-in for the Worker (the pattern from routing/worker.test.ts). */
function fakeWorker(answer: (job: RoutingJob) => RoutingReply | null = runRoutingJob) {
  const jobs: RoutingJob[] = [];
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(job) {
      jobs.push(job);
      setTimeout(() => {
        const reply = answer(job);
        if (reply) w.onmessage?.({ data: reply } as MessageEvent<RoutingReply>);
      }, 0);
    },
    terminate: vi.fn(),
  };
  return { w, jobs };
}

const containers: HTMLElement[] = [];
afterEach(() => {
  for (const c of containers.splice(0)) c.remove();
});
const mount = (opts: DiagramOptions, model = scene()) => {
  const c = document.createElement('div');
  document.body.append(c);
  containers.push(c);
  const d = new Diagram({ symbols: [valve], fitOnLoad: 'never', ...opts });
  d.load(model);
  d.mount(c);
  d.renderer!.flush();
  return d;
};
const settle = () => new Promise((r) => setTimeout(r, 10));

describe('routing in a Web Worker (FR-55)', () => {
  it('draws placeholders, then adopts routes identical to main-thread routing', async () => {
    const { w, jobs } = fakeWorker();
    const d = mount({ routingWorker: { createWorker: () => w } });
    expect(jobs).toHaveLength(1);
    expect(d.getLinkPath('l3-4')).toHaveLength(2); // straight placeholder
    await settle();
    const sync = mount({});
    for (const id of ['l0-1', 'l3-4', 'l16-19'])
      expect(d.getLinkPath(id)).toEqual(sync.getLinkPath(id));
    // The adopted routes let later edits re-route incrementally, as if routed on the main thread.
    d.update((tx) => tx.updateNode('n5-5', { position: { x: 450, y: 380 } }));
    sync.update((tx) => tx.updateNode('n5-5', { position: { x: 450, y: 380 } }));
    expect(d.getLinkPath('l5-5')).toEqual(sync.getLinkPath('l5-5'));
    d.destroy();
    sync.destroy();
  });

  it('keeps links re-routed on the main thread while the job was pending', async () => {
    const { w } = fakeWorker();
    const d = mount({ routingWorker: { createWorker: () => w } });
    d.update((tx) => tx.updateNode('n2-2', { position: { x: 180, y: 400 } }));
    const edited = d.getLinkPath('l2-2');
    expect(edited!.length).toBeGreaterThan(2); // routed for real, not a placeholder
    await settle();
    expect(d.getLinkPath('l2-2')).toEqual(edited);
    expect(d.getLinkPath('l9-9')!.length).toBeGreaterThanOrEqual(2);
    d.destroy();
  });

  it('re-routes pending links around a node that moved while the job was in flight', async () => {
    const { w } = fakeWorker();
    const d = mount({ routingWorker: { createWorker: () => w } });
    // Drop node n1-5 right onto the straight path of l0-3 (row 0, between n0-2 and n0-3).
    d.update((tx) => tx.updateNode('n1-5', { position: { x: 215, y: 0 } }));
    await settle();
    const box = { x: 215 - 4, y: 0 - 4, x2: 255 + 4, y2: 20 + 4 };
    const pts = d.getLinkPath('l0-3')!;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      const crosses = maxX > box.x && minX < box.x2 && maxY > box.y && minY < box.y2;
      expect(crosses, `segment ${i} of l0-3 crosses the moved node`).toBe(false);
    }
    d.destroy();
  });

  it('drops a result that arrives after a newer load', async () => {
    const replies: (() => void)[] = [];
    const { w } = fakeWorker((job) => {
      // Hold the first reply back until after the reload.
      if (replies.length === 0) {
        replies.push(() =>
          w.onmessage?.({ data: runRoutingJob(job) } as MessageEvent<RoutingReply>),
        );
        return null;
      }
      return runRoutingJob(job);
    });
    const d = mount({ routingWorker: { createWorker: () => w } });
    const smaller = scene();
    smaller.links = smaller.links.slice(0, 310);
    d.load(smaller);
    d.renderer!.flush();
    await settle(); // the second job is answered; the first is still held back
    replies[0]!(); // now the stale reply for the first document arrives
    await settle();
    expect(d.getLinkPath('l16-19')).toBeUndefined(); // not in the new document
    expect(d.getLinkPath('l0-1')!.length).toBeGreaterThanOrEqual(2);
    d.destroy();
  });

  it('falls back to main-thread routing when the worker fails', async () => {
    const { w } = fakeWorker((job) => ({ id: job.id, ok: false, error: 'boom' }));
    const d = mount({ routingWorker: { createWorker: () => w } });
    await settle();
    const sync = mount({});
    expect(d.getLinkPath('l3-4')).toEqual(sync.getLinkPath('l3-4'));
    d.destroy();
    sync.destroy();
  });

  it('is not used below the threshold, and terminates on destroy', async () => {
    const create = vi.fn(() => fakeWorker().w);
    const small = scene();
    small.links = small.links.slice(0, 50);
    const d = mount({ routingWorker: { createWorker: create } }, small);
    expect(create).not.toHaveBeenCalled();
    expect(d.getLinkPath('l0-1')!.length).toBeGreaterThanOrEqual(2);
    d.destroy();

    const { w } = fakeWorker();
    const big = mount({ routingWorker: { createWorker: () => w } });
    await settle();
    big.destroy();
    expect(w.terminate).toHaveBeenCalled();
  });
});
