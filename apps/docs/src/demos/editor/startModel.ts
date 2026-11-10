import type { DiagramModel } from '@pipeline-view/core';

/**
 * Fixed starting diagram with stable ids, so the editor e2e specs are deterministic.
 * P1.discharge and XV1.in are left free on purpose: connecting them is the "connect" test.
 * Below the original row: a manifold with per-node ports (M1) and a locked tank on a locked line (T9).
 */
export const editorStartModel: DiagramModel = {
  version: 2,
  nodes: [
    { id: 'P1', type: 'process/pump', position: { x: 40, y: 160 }, label: 'P1' },
    {
      id: 'XV1',
      type: 'gas/gate-valve',
      position: { x: 260, y: 183 },
      label: 'XV1',
      data: { open: true },
    },
    {
      id: 'T1',
      type: 'process/tank',
      position: { x: 480, y: 120 },
      label: 'T1',
      data: { level: 0.4 },
    },
    {
      id: 'PT1',
      type: 'gas/pressure-transmitter',
      position: { x: 700, y: 60 },
      label: 'PT1',
      data: { loop: 101 },
    },
    {
      id: 'M1',
      type: 'demo/manifold',
      position: { x: 300, y: 340 },
      label: 'M1',
      data: { inputs: 3, outputs: 2 },
    },
    {
      id: 'P2',
      type: 'process/pump',
      position: { x: 60, y: 360 },
      label: 'P2',
    },
    {
      id: 'T9',
      type: 'process/tank',
      position: { x: 520, y: 330 },
      label: 'T9 (locked)',
      locked: true,
      data: { level: 0.7 },
    },
  ],
  links: [
    {
      id: 'l1',
      kind: 'process',
      from: { node: 'XV1', port: 'out' },
      to: { node: 'T1', port: 'in' },
    },
    {
      id: 'l2',
      kind: 'process',
      from: { node: 'P2', port: 'discharge' },
      to: { node: 'M1', port: 'in-3' },
    },
    {
      id: 'l3',
      kind: 'process',
      from: { node: 'M1', port: 'out-2' },
      to: { node: 'T9', port: 'in' },
      locked: true,
    },
  ],
  annotations: [
    {
      id: 'hint',
      kind: 'text',
      variant: 'area',
      text: 'Drag symbols in, connect ports, press R to rotate',
      position: { x: 40, y: 40 },
    },
  ],
};
