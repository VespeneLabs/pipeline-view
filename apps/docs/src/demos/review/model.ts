import type { DiagramModel, Issue, IssueMap } from '@pipeline-view/core';

/** The version "saved earlier": what the comparison measures against. */
export const savedModel: DiagramModel = {
  version: 2,
  nodes: [
    {
      id: 'T1',
      type: 'process/tank',
      position: { x: 0, y: 40 },
      label: 'T-101',
      data: { level: 0.6 },
    },
    { id: 'P1', type: 'process/pump', position: { x: 200, y: 64 }, label: 'P-101' },
    { id: 'V1', type: 'process/control-valve', position: { x: 380, y: 59 }, label: 'FCV-101' },
    {
      id: 'T2',
      type: 'process/tank',
      position: { x: 580, y: 40 },
      label: 'T-102',
      data: { level: 0.4 },
    },
    { id: 'XV1', type: 'gas/gate-valve', position: { x: 740, y: 280 }, label: 'XV-201' },
  ],
  links: [
    {
      id: 'l1',
      from: { node: 'T1', port: 'out' },
      to: { node: 'P1', port: 'suction' },
      kind: 'process',
    },
    {
      id: 'l2',
      from: { node: 'P1', port: 'discharge' },
      to: { node: 'V1', port: 'in' },
      kind: 'process',
    },
    {
      id: 'l3',
      from: { node: 'V1', port: 'out' },
      to: { node: 'T2', port: 'in' },
      kind: 'process',
    },
    {
      id: 'l4',
      from: { node: 'T2', port: 'bottom' },
      to: { node: 'XV1', port: 'in' },
      kind: 'process',
    },
  ],
};

/**
 * The working copy: P-101 moved, FCV-101 retagged, XV-201 removed, a second pump added (its discharge
 * left open) and an untagged cone tank fed straight from T-102.
 */
export const workingModel: DiagramModel = {
  version: 2,
  nodes: [
    savedModel.nodes[0]!,
    { ...savedModel.nodes[1]!, position: { x: 200, y: 120 } },
    { ...savedModel.nodes[2]!, label: 'FCV-101A' },
    savedModel.nodes[3]!,
    { id: 'P2', type: 'process/pump', position: { x: 560, y: 300 }, label: 'P-102' },
    { id: 'T3', type: 'process/conical-tank', position: { x: 820, y: 40 } },
  ],
  links: [
    savedModel.links[0]!,
    savedModel.links[1]!,
    savedModel.links[2]!,
    {
      id: 'l5',
      from: { node: 'T2', port: 'bottom' },
      to: { node: 'P2', port: 'suction' },
      kind: 'process',
    },
    {
      id: 'l6',
      from: { node: 'T2', port: 'out' },
      to: { node: 'T3', port: 'in' },
      kind: 'process',
    },
  ],
};

/** Ports that must be connected, per symbol type. Demo rules: real apps bring their own. */
const REQUIRED: Record<string, { ports: string[]; severity: Issue['severity'] }> = {
  'process/pump': { ports: ['suction', 'discharge'], severity: 'error' },
  'process/control-valve': { ports: ['in', 'out'], severity: 'warning' },
};

const PORT_NAMES: Record<string, string> = {
  suction: 'Suction',
  discharge: 'Discharge',
  in: 'Inlet',
  out: 'Outlet',
};

const isTank = (type: string | undefined) => !!type && /tank$/.test(type);

/** "T-101", or "untagged conical tank" for a node without a label. */
export const nameOf = (n: { label?: string; type: string }) =>
  n.label ?? `untagged ${n.type.split('/')[1]?.replace(/-/g, ' ') ?? 'item'}`;

/**
 * A tiny host-side validator, the kind of thing an app runs before saving. The library only displays the
 * result (setIssues): it has no opinion about what is valid.
 */
export function validate(model: DiagramModel): IssueMap {
  const nodes: Record<string, Issue[]> = {};
  const links: Record<string, Issue[]> = {};
  const add = (into: Record<string, Issue[]>, id: string, issue: Issue) =>
    (into[id] ??= []).push(issue);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const connected = new Set(
    model.links.flatMap((l) => [`${l.from.node}.${l.from.port}`, `${l.to.node}.${l.to.port}`]),
  );
  for (const n of model.nodes) {
    const rule = REQUIRED[n.type];
    for (const port of rule?.ports ?? []) {
      if (!connected.has(`${n.id}.${port}`)) {
        add(nodes, n.id, {
          severity: rule!.severity,
          message: `${PORT_NAMES[port] ?? port} is not connected.`,
          code: 'open-port',
        });
      }
    }
    if (!n.label)
      add(nodes, n.id, { severity: 'info', message: 'Untagged equipment.', code: 'no-tag' });
  }
  for (const l of model.links) {
    const a = byId.get(l.from.node);
    const b = byId.get(l.to.node);
    if (isTank(a?.type) && isTank(b?.type)) {
      add(links, l.id, {
        severity: 'warning',
        message: `No isolation valve between ${nameOf(a!)} and ${nameOf(b!)}.`,
        code: 'no-valve',
      });
    }
  }
  return { nodes, links };
}

/** "T-101" for a node, "T-101 → P-101" for a link, from whichever model still has the item. */
export function describeItem(kind: 'node' | 'link', id: string, ...models: DiagramModel[]): string {
  const node = (nid: string) => {
    for (const m of models) {
      const n = m.nodes.find((x) => x.id === nid);
      if (n) return nameOf(n);
    }
    return nid;
  };
  if (kind === 'node') return node(id);
  for (const m of models) {
    const l = m.links.find((x) => x.id === id);
    if (l) return `${node(l.from.node)} → ${node(l.to.node)}`;
  }
  return id;
}
