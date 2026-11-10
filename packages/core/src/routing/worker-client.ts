/**
 * Off-main-thread full routing (FR-55). Incremental re-routes during a drag stay on the main thread
 * (about 1 ms); only the initial or full pass, tens of ms at 1,000 links, is worth moving.
 * Nothing is created at import time, so this module is safe during SSR.
 */
import type { Rect } from '../model/types';
import type { RouteRequest, RouteResult, RouterOptions } from './types';
import type { RoutingJob, RoutingReply } from './worker-protocol';

/** The part of a Worker the client uses (lets tests and hosts pass their own). */
export interface WorkerLike {
  postMessage(msg: RoutingJob): void;
  onmessage: ((e: MessageEvent<RoutingReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface RoutingWorkerOptions {
  /**
   * Creates the worker. Default: `new Worker(new URL('./routing.worker.js', import.meta.url), { type:
   * 'module' })`. Pass your bundler's worker import when it needs one (for example Vite's `?worker`).
   */
  createWorker?: () => WorkerLike;
}

export interface RoutingWorker {
  /**
   * Routes every request from scratch off the main thread. Starting a new job supersedes the previous one:
   * its promise rejects with an `AbortError`.
   */
  routeAll(
    obstacles: [string, Rect][],
    requests: RouteRequest[],
    options?: RouterOptions,
  ): Promise<RouteResult[]>;
  terminate(): void;
}

const abortError = (msg: string) => Object.assign(new Error(msg), { name: 'AbortError' });

export function createRoutingWorker(opts: RoutingWorkerOptions = {}): RoutingWorker {
  const worker =
    opts.createWorker?.() ??
    (new Worker(new URL('./routing.worker.js', import.meta.url), {
      type: 'module',
    }) as unknown as WorkerLike);
  let nextId = 1;
  let pending: { id: number; resolve(r: RouteResult[]): void; reject(e: Error): void } | null =
    null;

  worker.onmessage = (e) => {
    const reply = e.data;
    if (!pending || reply.id !== pending.id) return; // superseded: drop the late result
    const p = pending;
    pending = null;
    if (reply.ok) p.resolve(reply.results);
    else p.reject(new Error(`Routing worker failed: ${reply.error}`));
  };
  worker.onerror = (e) => {
    const p = pending;
    pending = null;
    p?.reject(new Error(`Routing worker error: ${e.message}`));
  };

  return {
    routeAll(obstacles, requests, options) {
      pending?.reject(abortError('Superseded by a newer routing job'));
      const id = nextId++;
      return new Promise<RouteResult[]>((resolve, reject) => {
        pending = { id, resolve, reject };
        worker.postMessage({ id, obstacles, requests, ...(options ? { options } : {}) });
      });
    },
    terminate() {
      pending?.reject(abortError('Routing worker terminated'));
      pending = null;
      worker.terminate();
    },
  };
}
