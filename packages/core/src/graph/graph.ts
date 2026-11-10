/**
 * Graph helpers over a diagram's links (FR-49). Links are directed from `from` to `to` (flow order).
 * DOM-free and pure: they work on a saved model as well as on a live Diagram, for example on a server.
 */
import type { DiagramModel, LinkKind, LinkModel, NodeModel } from '../model/types';

/** A model, or anything with a model store (a Diagram). */
export type GraphSource =
  | Pick<DiagramModel, 'nodes' | 'links'>
  | { store: { nodes: Map<string, NodeModel>; links: Map<string, LinkModel> } };

export interface GraphFilter {
  /** Only follow links of these kinds. Default: all kinds. */
  kinds?: LinkKind[];
}

export interface WalkOptions extends GraphFilter {
  /**
   * Whether to continue past a node. The node itself is still included; returning false stops the walk
   * there (for example at a measuring point or a closed valve). Default: always continue.
   */
  through?: (node: NodeModel) => boolean;
}

/** A built adjacency view, reusable for many queries (see `flowPathIn`). */
export interface Graph {
  nodes: Map<string, NodeModel>;
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

export function buildGraph(src: GraphSource, filter: GraphFilter = {}): Graph {
  const nodes = new Map<string, NodeModel>();
  let links: Iterable<LinkModel>;
  if ('store' in src) {
    for (const [id, n] of src.store.nodes) nodes.set(id, n);
    links = src.store.links.values();
  } else {
    for (const n of src.nodes) nodes.set(n.id, n);
    links = src.links;
  }
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const id of nodes.keys()) {
    out.set(id, []);
    inc.set(id, []);
  }
  for (const l of links) {
    if (filter.kinds && !filter.kinds.includes(l.kind)) continue;
    if (!nodes.has(l.from.node) || !nodes.has(l.to.node)) continue;
    out.get(l.from.node)!.push(l.to.node);
    inc.get(l.to.node)!.push(l.from.node);
  }
  return { nodes, out, in: inc };
}

function walk(
  g: Graph,
  start: string,
  edges: Map<string, string[]>,
  through?: WalkOptions['through'],
): string[] {
  const seen = new Set<string>([start]);
  const order: string[] = [];
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    for (const next of edges.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      order.push(next);
      const node = g.nodes.get(next)!;
      if (!through || through(node)) stack.push(next);
    }
  }
  return order;
}

/** Nodes reachable against the flow from `nodeId` (its sources), nearest first by discovery. */
export function upstreamOf(src: GraphSource, nodeId: string, opts: WalkOptions = {}): string[] {
  const g = buildGraph(src, opts);
  return g.nodes.has(nodeId) ? walk(g, nodeId, g.in, opts.through) : [];
}

/** Nodes reachable along the flow from `nodeId` (its consumers). */
export function downstreamOf(src: GraphSource, nodeId: string, opts: WalkOptions = {}): string[] {
  const g = buildGraph(src, opts);
  return g.nodes.has(nodeId) ? walk(g, nodeId, g.out, opts.through) : [];
}

/**
 * Node ids in flow order (every link points forward), or null when the graph has a cycle.
 * Unconnected nodes keep their model order.
 */
export function topologicalOrder(src: GraphSource, filter: GraphFilter = {}): string[] | null {
  const g = buildGraph(src, filter);
  const indeg = new Map<string, number>();
  for (const [id, ins] of g.in) indeg.set(id, ins.length);
  const queue = [...g.nodes.keys()].filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    order.push(id);
    for (const next of g.out.get(id)!) {
      const d = indeg.get(next)! - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order.length === g.nodes.size ? order : null;
}

/**
 * Groups of nodes that lie on a cycle (strongly connected components with more than one node, or a node
 * linked to itself). Each group lists its node ids; an acyclic graph returns [].
 */
export function findCycles(src: GraphSource, filter: GraphFilter = {}): string[][] {
  const g = buildGraph(src, filter);
  // Iterative Tarjan.
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  for (const root of g.nodes.keys()) {
    if (idx.has(root)) continue;
    const work: { id: string; i: number }[] = [{ id: root, i: 0 }];
    idx.set(root, index);
    low.set(root, index++);
    stack.push(root);
    onStack.add(root);
    while (work.length) {
      const top = work[work.length - 1]!;
      const succ = g.out.get(top.id)!;
      if (top.i < succ.length) {
        const w = succ[top.i++]!;
        if (!idx.has(w)) {
          idx.set(w, index);
          low.set(w, index++);
          stack.push(w);
          onStack.add(w);
          work.push({ id: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(top.id, Math.min(low.get(top.id)!, idx.get(w)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(top.id)!));
      if (low.get(top.id) === idx.get(top.id)) {
        const comp: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          comp.push(w);
        } while (w !== top.id);
        const selfLoop = comp.length === 1 && g.out.get(comp[0]!)!.includes(comp[0]!);
        if (comp.length > 1 || selfLoop) out.push(comp.reverse());
      }
    }
  }
  return out;
}

/** Groups of nodes connected by links in either direction. Every node is in exactly one group. */
export function connectedComponents(src: GraphSource, filter: GraphFilter = {}): string[][] {
  const g = buildGraph(src, filter);
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of g.nodes.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const comp = [start];
    for (let i = 0; i < comp.length; i++) {
      const id = comp[i]!;
      for (const n of [...g.out.get(id)!, ...g.in.get(id)!]) {
        if (seen.has(n)) continue;
        seen.add(n);
        comp.push(n);
      }
    }
    out.push(comp);
  }
  return out;
}

/**
 * A path from `from` to `to` along the flow, as node ids including both ends, or null. Used to explain
 * a `cycle` refusal: adding to → from would close this path into a loop.
 */
export function flowPath(
  src: GraphSource,
  from: string,
  to: string,
  filter: GraphFilter = {},
): string[] | null {
  return flowPathIn(buildGraph(src, filter), from, to);
}

/** `flowPath` on a prebuilt graph. */
export function flowPathIn(g: Graph, from: string, to: string): string[] | null {
  if (!g.nodes.has(from) || !g.nodes.has(to)) return null;
  const prev = new Map<string, string>();
  const queue = [from];
  const seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    if (id === to) {
      const path = [to];
      for (let p = to; p !== from;) path.unshift((p = prev.get(p)!));
      return path;
    }
    for (const n of g.out.get(id)!) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, id);
      queue.push(n);
    }
  }
  return null;
}
