/**
 * Messages between the main thread and the routing Web Worker (FR-55). Plain JSON, so they cross
 * postMessage without custom cloning.
 */
import type { Rect } from '../model/types';
import { OrthogonalRouter } from './router';
import type { RouteRequest, RouteResult, RouterOptions } from './types';

export interface RoutingJob {
  id: number;
  obstacles: [string, Rect][];
  requests: RouteRequest[];
  options?: RouterOptions;
}

export type RoutingReply =
  { id: number; ok: true; results: RouteResult[] } | { id: number; ok: false; error: string };

/** Routes one job from scratch, exactly like a main-thread full pass (same order, same spreading). */
export function runRoutingJob(job: RoutingJob): RoutingReply {
  try {
    const router = new OrthogonalRouter(job.options);
    router.setObstacles(new Map(job.obstacles));
    return { id: job.id, ok: true, results: router.route(job.requests) };
  } catch (e) {
    return { id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
