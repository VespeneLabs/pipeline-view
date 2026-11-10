import { describe, expect, it } from 'vitest';
import { createRouter } from './router';
import { generateScene, requestsFor } from './test-scene';
import { type WorkerLike, createRoutingWorker } from './worker-client';
import { type RoutingJob, type RoutingReply, runRoutingJob } from './worker-protocol';

const { nodes, links } = generateScene(120, 220, 11);
const requests = requestsFor(nodes, links);
const obstacles = [...nodes] as [string, { x: number; y: number; width: number; height: number }][];

describe('runRoutingJob (worker side)', () => {
  it('gives exactly the routes of a main-thread full pass', () => {
    const main = createRouter();
    main.setObstacles(nodes);
    const expected = main.route(requests);
    const reply = runRoutingJob({ id: 7, obstacles, requests });
    expect(reply).toEqual({ id: 7, ok: true, results: expected });
  });

  it('reports failures instead of throwing', () => {
    const reply = runRoutingJob({
      id: 1,
      obstacles,
      requests: [{ linkId: 'x', from: null, to: null } as never],
    });
    expect(reply).toMatchObject({ id: 1, ok: false });
  });
});

describe('adoptRoutes', () => {
  it('lets a main-thread router continue incrementally as if it had routed itself', () => {
    const own = createRouter();
    own.setObstacles(nodes);
    const results = own.route(requests);

    const adopted = createRouter();
    adopted.setObstacles(nodes);
    adopted.adoptRoutes(requests, results);

    // A node moves: both report the same affected links and re-route them identically.
    const id = links[0]!.from.node;
    const r = nodes.get(id)!;
    const moved = { ...r, x: r.x + 37, y: r.y + 21 };
    const live = new Map(nodes).set(id, moved);
    const a = own.updateObstacle(id, moved).sort();
    const b = adopted.updateObstacle(id, moved).sort();
    expect(b).toEqual(a);
    const again = requestsFor(
      live,
      links.filter((l) => a.includes(l.id)),
    );
    expect(adopted.route(again)).toEqual(own.route(again));
  });
});

/** An in-process stand-in for a Web Worker that answers asynchronously. */
function fakeWorker(answer: (job: RoutingJob) => RoutingReply | null = runRoutingJob) {
  const posted: RoutingJob[] = [];
  let terminated = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(job) {
      posted.push(job);
      queueMicrotask(() => {
        const reply = answer(job);
        if (reply) w.onmessage?.({ data: reply } as MessageEvent<RoutingReply>);
      });
    },
    terminate() {
      terminated = true;
    },
  };
  return { w, posted, isTerminated: () => terminated };
}

describe('createRoutingWorker (main side)', () => {
  it('resolves a job with the worker results', async () => {
    const { w, posted } = fakeWorker();
    const rw = createRoutingWorker({ createWorker: () => w });
    const results = await rw.routeAll(obstacles, requests, { clearance: 12 });
    expect(results).toHaveLength(requests.length);
    expect(posted[0]).toMatchObject({ id: 1, options: { clearance: 12 } });
  });

  it('supersedes an older job: it rejects with AbortError and its late reply is dropped', async () => {
    const replies: RoutingReply[] = [];
    // Hold replies until we release them, newest first.
    const { w } = fakeWorker((job) => {
      replies.push(runRoutingJob(job));
      return null;
    });
    const rw = createRoutingWorker({ createWorker: () => w });
    const first = rw.routeAll(obstacles, requests.slice(0, 5));
    const second = rw.routeAll(obstacles, requests.slice(0, 3));
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    // Deliver the stale reply first, then the current one.
    w.onmessage!({ data: replies[0]! } as MessageEvent<RoutingReply>);
    w.onmessage!({ data: replies[1]! } as MessageEvent<RoutingReply>);
    expect(await second).toHaveLength(3);
  });

  it('rejects on worker errors and on terminate', async () => {
    const { w, isTerminated } = fakeWorker(() => null);
    const rw = createRoutingWorker({ createWorker: () => w });
    const job = rw.routeAll(obstacles, requests);
    w.onerror!({ message: 'boom' } as ErrorEvent);
    await expect(job).rejects.toThrow('Routing worker error: boom');
    const job2 = rw.routeAll(obstacles, requests);
    rw.terminate();
    await expect(job2).rejects.toMatchObject({ name: 'AbortError' });
    expect(isTerminated()).toBe(true);
  });

  it('surfaces a failed job as a rejection', async () => {
    const { w } = fakeWorker((job) => ({ id: job.id, ok: false, error: 'bad input' }));
    const rw = createRoutingWorker({ createWorker: () => w });
    await expect(rw.routeAll(obstacles, requests)).rejects.toThrow('bad input');
  });
});
