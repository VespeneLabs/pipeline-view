import type { DataRecord, NodeModel, PortDef, Size, SymbolDef } from '@pipeline-view/core';
import { PIPING, group } from '../shared';

/** Data bound by the header: how many inlets (left) and outlets (right) it has. */
export interface HeaderData extends DataRecord {
  inlets?: number;
  outlets?: number;
  /** Draw a block valve on every outlet stub, for a valve manifold. Size and ports stay the same. */
  valves?: boolean;
}

const PITCH = 24;
const WIDTH = 40;

function count(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 32) : fallback;
}

function counts(data: HeaderData | undefined): [inlets: number, outlets: number] {
  return [count(data?.inlets, 1), count(data?.outlets, 3)];
}

function sizeOf(inlets: number, outlets: number): Size {
  return { width: WIDTH, height: Math.max(72, (Math.max(inlets, outlets) + 1) * PITCH) };
}

/** Port i of n, spread evenly over the height. */
const at = (i: number, n: number, height: number) => Math.round(((i + 1) / (n + 1)) * height);

function draw(inlets: number, outlets: number, valves = false): string {
  const { height } = sizeOf(inlets, outlets);
  // With valves, the body moves left inside the same box, so the outlet stubs have room for them.
  const x = valves ? 5 : 13;
  let stubs = '';
  let bodies = '';
  for (let i = 0; i < inlets; i++) stubs += `M0 ${at(i, inlets, height)}H${x}`;
  for (let i = 0; i < outlets; i++) {
    const y = at(i, outlets, height);
    stubs += `M${x + 14} ${y}H40`;
    // A valve body (two triangles tip to tip) over the stub, between the header and the port.
    if (valves) bodies += `M23 ${y - 6}L37 ${y + 6}V${y - 6}L23 ${y + 6}Z`;
  }
  return group(
    `<rect x="${x}" y="2" width="14" height="${height - 4}" rx="6" ` +
      'style="fill:var(--pv-symbol-fill,var(--pv-bg,Canvas))"/>' +
      `<path d="${stubs}"/>` +
      (bodies && `<path d="${bodies}" style="fill:var(--pv-symbol-fill,var(--pv-bg,Canvas))"/>`),
  );
}

const svg = /* @__PURE__ */ draw(1, 3);

/**
 * Header / manifold: a slim body with inlets on the left and outlets on the right. The counts come
 * from `data.inlets` / `data.outlets` (1–32, default 1 and 3); the body grows with the larger count.
 * Ports are `in-1..n` and `out-1..n`, labelled with their index just outside the body, above the pipe.
 * `data.valves: true` draws a block valve on every outlet, for a valve manifold; nothing else changes.
 */
export const header: SymbolDef<HeaderData> = {
  type: 'process/header',
  name: 'Header / manifold',
  category: PIPING,
  size: (node: NodeModel<HeaderData>) => sizeOf(...counts(node.data)),
  ports: (node: NodeModel<HeaderData>) => {
    const [inlets, outlets] = counts(node.data);
    const { height } = sizeOf(inlets, outlets);
    const ports: PortDef[] = [];
    for (let i = 0; i < inlets; i++)
      ports.push({
        id: `in-${i + 1}`,
        position: { x: 0, y: at(i, inlets, height) },
        direction: 'left',
        role: 'in',
        label: String(i + 1),
        labelPlacement: 'outside',
      });
    for (let i = 0; i < outlets; i++)
      ports.push({
        id: `out-${i + 1}`,
        position: { x: WIDTH, y: at(i, outlets, height) },
        direction: 'right',
        role: 'out',
        label: String(i + 1),
        labelPlacement: 'outside',
      });
    return ports;
  },
  svg,
  render: ({ data }) => {
    const [inlets, outlets] = counts(data);
    const valves = data.valves === true;
    return inlets === 1 && outlets === 3 && !valves ? svg : draw(inlets, outlets, valves);
  },
  keywords: ['header', 'manifold', 'distribution', 'collector', 'branch', 'valve manifold'],
};
