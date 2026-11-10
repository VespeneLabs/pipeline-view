/**
 * Routing Web Worker entry (FR-55). Created by `createRoutingWorker()`; hosts whose bundler needs its own
 * worker syntax can load this file directly and pass the Worker in.
 */
import { type RoutingJob, runRoutingJob } from './worker-protocol';

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<RoutingJob>) => void) | null;
  postMessage(msg: unknown): void;
};
scope.onmessage = (e) => scope.postMessage(runRoutingJob(e.data));
