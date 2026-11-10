import type { DiagramModel } from '@pipeline-view/core';

/**
 * Fixed starting diagram with stable ids, so the editor e2e specs are deterministic.
 * P1.discharge and XV1.in are left free on purpose: connecting them is the "connect" test.
 */
export const editorStartModel: DiagramModel = {
  version: 1,
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
  ],
  links: [
    {
      id: 'l1',
      kind: 'process',
      from: { node: 'XV1', port: 'out' },
      to: { node: 'T1', port: 'in' },
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
