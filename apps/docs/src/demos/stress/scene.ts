import type { DiagramModel, LinkModel, NodeModel } from '@pipeline-view/core';

/** Symbol mix: every type has left `in` and right `out` ports, plus one bound value. */
const TYPES = [
  { type: 'gas/gate-valve', bind: 'open' },
  { type: 'gas/ball-valve', bind: 'open' },
  { type: 'process/tank', bind: 'level' },
  { type: 'gas/globe-valve', bind: 'open' },
  { type: 'process/control-valve', bind: 'open' },
] as const;

export const COLS = 25;
export const ROWS = 20;
const DX = 220;
const DY = 190;

/**
 * NFR-1 scene: 500 nodes (25 x 20 grid) and 1,000 links. Each node carries four values that change every tick
 * (its symbol binding plus three plain data fields): 2,000 values in total.
 */
export function generateScene(): DiagramModel {
  const nodes: NodeModel[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const t = TYPES[(r * 3 + c) % TYPES.length]!;
      nodes.push({
        id: `n${i}`,
        type: t.type,
        position: { x: c * DX, y: r * DY + (c % 2) * 24 },
        label: `N${String(i).padStart(3, '0')}`,
        data: { [t.bind]: t.bind === 'level' ? 0.5 : true, v1: 0, v2: 0, v3: 0 },
      });
    }
  }
  const links: LinkModel[] = [];
  const link = (a: number, b: number, kind = 'process') =>
    links.push({
      id: `l${links.length}`,
      kind,
      from: { node: `n${a}`, port: 'out' },
      to: { node: `n${b}`, port: 'in' },
    });
  // 24 x 20 = 480 horizontal runs.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c + 1 < COLS; c++) link(r * COLS + c, r * COLS + c + 1);
  // 25 x 19 = 475 links to the row below, which the router has to take around nodes.
  for (let r = 0; r + 1 < ROWS; r++)
    for (let c = 0; c < COLS; c++) link(r * COLS + c, (r + 1) * COLS + c);
  // 45 diagonal signal links fill up to 1,000.
  for (let k = 0; links.length < 1000; k++) {
    const r = k % (ROWS - 1);
    const c = (k * 7) % (COLS - 1);
    link(r * COLS + c, (r + 1) * COLS + c + 1, 'signal');
  }
  return { version: 1, nodes, links };
}

/** Values for one tick: four per node, deterministic in `tick`. */
export function tickValues(model: DiagramModel, tick: number) {
  const updates: Record<string, { data: Record<string, unknown>; status?: string }> = {};
  model.nodes.forEach((n, i) => {
    const phase = (tick + i) % 20;
    const data: Record<string, unknown> = {
      v1: tick + i,
      v2: phase / 20,
      v3: (tick * 31 + i) % 97,
    };
    if (n.type === 'process/tank') data.level = 0.15 + 0.7 * Math.abs(Math.sin((tick + i) / 7));
    else data.open = phase < 15;
    updates[n.id] = { data, status: phase === 0 ? 'alarm' : phase < 3 ? 'warning' : 'normal' };
  });
  return updates;
}
