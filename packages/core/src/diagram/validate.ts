/**
 * Connection validation (FR-41, FR-42): port roles, link limits, direction and the host hook, with
 * explained refusals. DOM-free, so the editor, `connect()` and hosts' own forms share one rule set.
 */
import type { LinkAttach, LinkEnd, LinkKind, NodeModel } from '../model/types';
import type { PortDef } from '../symbols/types';
import { findPort } from '../symbols/resolve';
import type { Diagram } from './diagram';
import type {
  ConnectAttach,
  ConnectContext,
  ConnectResult,
  RefusalCode,
  RefusalContext,
  RefusalEnds,
  ValidationResult,
} from './types';
import { type Graph, buildGraph, flowPathIn } from '../graph/graph';

export type ConnectCheck =
  /** Allowed. `from` / `to` are in flow order (outlet → inlet), which may swap the arguments. */
  | { ok: true; from: LinkEnd; to: LinkEnd; fromAttach?: LinkAttach; toAttach?: LinkAttach }
  | ({
      ok: false;
      code: RefusalCode;
      reason: string;
      detail?: Record<string, unknown>;
    } & Partial<RefusalEnds>); // the ends in flow order (and as dragged, when different)

/** Default English messages for the built-in codes. Hosts replace them with `refusalMessages`. */
const DEFAULT_REASONS: Record<string, (ctx: RefusalContext) => string> = {
  'missing-port': () => 'That port does not exist.',
  'same-port': () => 'A port cannot connect to itself.',
  'self-loop': () => 'A node cannot connect to itself.',
  'kind-not-accepted': (c) => `This port does not accept ${c.kind} links.`,
  direction: () => 'Links must run from an outlet to an inlet.',
  'port-full': (c) =>
    c.detail?.port
      ? `Port ${String(c.detail.port)} already has the maximum number of links.`
      : 'This port already has the maximum number of links.',
  duplicate: () => 'These ports are already connected.',
  'max-links-between-nodes': () => 'These nodes are already connected.',
  cycle: () => 'This link would create a cycle.',
  'attach-missing-link': () => 'That link does not exist.',
  'attach-locked': () => 'This link is locked.',
  refused: () => 'This connection is not allowed.',
};

/** True when links of `kind` must run outlet → inlet (`DiagramOptions.directed`, FR-41). */
export function isDirected(diagram: Diagram, kind: LinkKind): boolean {
  const d = diagram.options.directed;
  if (!d) return false;
  if (d === true) return true;
  return !d.kinds || d.kinds.includes(kind);
}

const role = (p: PortDef) => p.role ?? 'both';
const portKey = (e: LinkEnd) => `${e.node}\u0000${e.port}`;

/**
 * Number of links on each port, for `maxLinks` checks. Build it once per gesture. An end drawn on
 * another link (`fromAttach` / `toAttach`) doesn't land on its port, so it isn't counted.
 */
export function portLinkCounts(diagram: Diagram): Map<string, number> {
  const counts = new Map<string, number>();
  const links = diagram.store.links;
  for (const l of links.values()) {
    for (const [e, attach] of [
      [l.from, l.fromAttach],
      [l.to, l.toAttach],
    ] as const) {
      if (attach && links.has(attach.link)) continue;
      counts.set(portKey(e), (counts.get(portKey(e)) ?? 0) + 1);
    }
  }
  return counts;
}

/** Keys of linked port pairs in both directions, for the duplicate check. Build it once per gesture. */
export function linkedPairs(diagram: Diagram): Set<string> {
  const set = new Set<string>();
  for (const l of diagram.store.links.values()) {
    set.add(`${portKey(l.from)}\u0001${portKey(l.to)}`);
    set.add(`${portKey(l.to)}\u0001${portKey(l.from)}`);
  }
  return set;
}

export interface ConnectIndexes {
  counts?: Map<string, number>;
  pairs?: Set<string>;
  /** Links per unordered node pair, for `maxLinksBetweenNodes`. */
  between?: Map<string, number>;
  /** Flow graph of the `noCycles` kinds, for the cycle check. */
  graph?: Graph;
}

/** Number of links per unordered node pair (any ports, any direction). */
export function linksBetweenNodes(diagram: Diagram): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of diagram.store.links.values()) {
    const k = nodePairKey(l.from.node, l.to.node);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const nodePairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** The kinds `noCycles` applies to, or null when it's off. An empty list means every kind. */
function cycleKinds(diagram: Diagram): LinkKind[] | null {
  const n = diagram.options.noCycles;
  if (!n) return null;
  return n === true ? [] : (n.kinds ?? []);
}

/**
 * Validates a connection between two ports. Built-in checks run first (unless
 * `canConnectOrder: 'before-builtins'`), in this order: missing port, same port, self-loop, kind,
 * direction, port full (from, then to), duplicate, links between nodes, cycle. Then the host's
 * `canConnect`. The first refusal wins.
 * Pass prebuilt `indexes` when checking many candidates during one gesture.
 *
 * `attach` says which ends of the new link are drawn on another link. Such an end must name an
 * existing, unlocked link; it is exempt from its port's `maxLinks`, since it doesn't land on the port.
 * Everything else, including `canConnect` (which gets the attachment as context), applies as usual.
 *
 * Notes on the order: `maxLinksBetweenNodes` counts links between the two nodes in BOTH directions and
 * runs before the cycle check, so with `maxLinksBetweenNodes: 1` a reverse link B→A next to an existing
 * A→B reports `max-links-between-nodes`, not `cycle`. Refusal contexts (`refusalMessages`,
 * `connectRejected`, the returned `from` / `to`) are always in flow order; `dragFrom` / `dragTo` give the
 * drag order when it differs.
 */
export function validateConnect(
  diagram: Diagram,
  from: LinkEnd,
  to: LinkEnd,
  kind: LinkKind,
  indexes: ConnectIndexes = {},
  attach: ConnectAttach = {},
): ConnectCheck {
  const opts = diagram.options;
  const a = diagram.store.nodes.get(from.node);
  const b = diagram.store.nodes.get(to.node);
  const pa = a && findPort(diagram.symbols.get(a.type), a, from.port);
  const pb = b && findPort(diagram.symbols.get(b.type), b, to.port);
  // Flow order (outlet → inlet): an inlet can start the drag, or the drag can end on an outlet, but the
  // link, the checks below, the host hook and every refusal context all see source → target.
  const swap =
    !!pa &&
    !!pb &&
    ((role(pa) === 'in' && role(pb) !== 'in') || (role(pb) === 'out' && role(pa) !== 'out'));
  const src = swap ? to : from;
  const dst = swap ? from : to;
  const ends = { from: src, to: dst, ...(swap ? { dragFrom: from, dragTo: to } : {}) };
  // The attachments follow their ends into flow order.
  const srcAttach = swap ? attach.toAttach : attach.fromAttach;
  const dstAttach = swap ? attach.fromAttach : attach.toAttach;
  const hostOf = (a: LinkAttach | undefined) => a && diagram.store.links.get(a.link);
  const refuse = (code: RefusalCode, detail?: Record<string, unknown>, reason?: string) =>
    refusal(diagram, code, { ...ends, kind, ...(detail ? { detail } : {}) }, reason);
  // Read only after the missing-port check below.
  const ps = (swap ? pb : pa)!;
  const pd = (swap ? pa : pb)!;

  const runHook = (): ConnectCheck | null => {
    if (!opts.canConnect || !a || !b) return null;
    const na = swap ? b : a;
    const nb = swap ? a : b;
    const end = srcAttach ? 'from' : 'to';
    const at = srcAttach ?? dstAttach;
    const host = hostOf(at);
    const ctx: ConnectContext = at && host ? { attach: { end, link: host, at: at.at } } : {};
    const r = opts.canConnect(
      { node: na, port: src.port },
      { node: nb, port: dst.port },
      kind,
      ctx,
    );
    return fromValidation(diagram, r, { ...ends, kind });
  };

  if (opts.canConnectOrder === 'before-builtins') {
    const h = runHook();
    if (h && !h.ok) return h;
  }

  if (!a || !b || !pa || !pb) {
    return refuse('missing-port', {
      node: !pa ? from.node : to.node,
      port: !pa ? from.port : to.port,
    });
  }
  for (const a of [srcAttach, dstAttach]) {
    if (!a) continue;
    const host = hostOf(a);
    if (!host) return refuse('attach-missing-link', { link: a.link });
    if (host.locked) return refuse('attach-locked', { link: a.link });
  }
  if (from.node === to.node && from.port === to.port) return refuse('same-port');
  if (opts.noSelfLoops && from.node === to.node) return refuse('self-loop', { node: from.node });
  for (const [end, p] of [
    [from, pa],
    [to, pb],
  ] as const) {
    if (p.accepts && !p.accepts.includes(kind)) {
      return refuse('kind-not-accepted', { node: end.node, port: end.port, accepts: p.accepts });
    }
  }

  const wrongWay =
    (role(ps) === 'in' && role(pd) === 'in') || (role(ps) === 'out' && role(pd) === 'out');
  if (wrongWay && isDirected(diagram, kind)) {
    return refuse('direction', { fromRole: role(pa), toRole: role(pb) });
  }

  const counts = indexes.counts ?? portLinkCounts(diagram);
  for (const [end, p, attached] of [
    [src, ps, srcAttach],
    [dst, pd, dstAttach],
  ] as const) {
    if (attached) continue;
    if (p.maxLinks !== undefined && (counts.get(portKey(end)) ?? 0) >= p.maxLinks) {
      return refuse('port-full', { node: end.node, port: end.port, maxLinks: p.maxLinks });
    }
  }
  const pairs = indexes.pairs ?? linkedPairs(diagram);
  if (pairs.has(`${portKey(src)}\u0001${portKey(dst)}`)) return refuse('duplicate');

  // Whole-graph rules (FR-49).
  const maxBetween = opts.maxLinksBetweenNodes;
  if (maxBetween !== undefined) {
    const between = indexes.between ?? linksBetweenNodes(diagram);
    if ((between.get(nodePairKey(src.node, dst.node)) ?? 0) >= maxBetween) {
      return refuse('max-links-between-nodes', { nodes: [src.node, dst.node], max: maxBetween });
    }
  }
  const kinds = cycleKinds(diagram);
  if (kinds && (kinds.length === 0 || kinds.includes(kind))) {
    const graph = indexes.graph ?? buildGraph(diagram, kinds.length ? { kinds } : {});
    // The new link dst ← src closes a loop if dst already reaches src along the flow.
    const path = flowPathIn(graph, dst.node, src.node);
    if (path) return refuse('cycle', { cycleNodes: path });
  }

  if (opts.canConnectOrder !== 'before-builtins') {
    const h = runHook();
    if (h && !h.ok) return h;
  }
  return {
    ok: true,
    from: src,
    to: dst,
    ...(srcAttach ? { fromAttach: srcAttach } : {}),
    ...(dstAttach ? { toAttach: dstAttach } : {}),
  };
}

/** Builds a refusal with the final (possibly host-localized) message. */
export function refusal(
  diagram: Diagram,
  code: RefusalCode,
  ctx: RefusalContext,
  fallbackReason?: string,
): Extract<ConnectCheck, { ok: false }> {
  const reason =
    diagram.options.refusalMessages?.(code, ctx) ??
    fallbackReason ??
    DEFAULT_REASONS[code]?.(ctx) ??
    DEFAULT_REASONS.refused!(ctx);
  return {
    ok: false,
    code,
    reason,
    ...(ctx.detail ? { detail: ctx.detail } : {}),
    from: ctx.from,
    to: ctx.to,
    ...(ctx.dragFrom ? { dragFrom: ctx.dragFrom, dragTo: ctx.dragTo } : {}),
  };
}

/** Turns a host hook result into a check: `true` allows, anything else refuses with a code. */
export function fromValidation(
  diagram: Diagram,
  r: ValidationResult,
  ctx: RefusalContext,
): ConnectCheck | null {
  if (r === true) return null;
  if (r === false) return refusal(diagram, 'refused', ctx);
  return refusal(
    diagram,
    r.code ?? 'refused',
    { ...ctx, ...(r.detail ? { detail: r.detail } : {}) },
    r.reason,
  );
}

/** Resolves a node's port for callers that only have ids. */
export function portOf(diagram: Diagram, node: NodeModel, port: string): PortDef | undefined {
  return findPort(diagram.symbols.get(node.type), node, port);
}

/** Every index `validateConnect` uses, built once for a gesture that checks many candidates. */
export function connectIndexes(diagram: Diagram): ConnectIndexes {
  const kinds = cycleKinds(diagram);
  return {
    counts: portLinkCounts(diagram),
    pairs: linkedPairs(diagram),
    ...(diagram.options.maxLinksBetweenNodes !== undefined
      ? { between: linksBetweenNodes(diagram) }
      : {}),
    ...(kinds ? { graph: buildGraph(diagram, kinds.length ? { kinds } : {}) } : {}),
  };
}

/**
 * Validates and, if allowed, adds the link in flow order as one undo step (FR-54). The id is
 * `${kind}_N`, the first free one. Shared by `diagram.connect()` and the editor.
 */
export function connectLink(
  diagram: Diagram,
  from: LinkEnd,
  to: LinkEnd,
  kind: LinkKind = 'process',
  attach: ConnectAttach = {},
): ConnectResult {
  const check = validateConnect(diagram, from, to, kind, {}, attach);
  if (!check.ok) return check;
  let n = 1;
  while (diagram.store.links.has(`${kind}_${n}`)) n++;
  const id = `${kind}_${n}`;
  diagram.update((tx) =>
    tx.addLink({
      id,
      from: { ...check.from },
      to: { ...check.to },
      kind,
      ...(check.fromAttach ? { fromAttach: { ...check.fromAttach } } : {}),
      ...(check.toAttach ? { toAttach: { ...check.toAttach } } : {}),
    }),
  );
  return { ok: true, id };
}
