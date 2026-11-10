import type { DiagramModel, SymbolDef } from '@pipeline-view/core';

/**
 * Demo 1: the Figma "Editable process diagram" (file 3hN8q7S6TeBeKY7LKoiHgK, node 1:21), at 1:1 design
 * units (the Figma frame is drawn at 0.78 zoom). Coordinates are copied from the frame so the result can
 * be compared with the design side by side.
 */
export const FRAME = { width: 1176, height: 585 };

// Text annotation positions are baselines: Figma text-box top + 13 (13px labels), + 11 (area), + 12 (legend).

/** Invisible off-page terminal, so pipes can start or end at the frame edge. Shows registerSymbol in use. */
export const terminal: SymbolDef = {
  type: 'demo/terminal',
  name: 'Off-page terminal',
  category: 'Demo',
  size: { width: 12, height: 12 },
  ports: [
    { id: 'in', position: { x: 0, y: 6 }, direction: 'left' },
    { id: 'out', position: { x: 12, y: 6 }, direction: 'right' },
  ],
  svg: '',
};

/**
 * Reading card annotation data. Live values live on the anchored node (`node.data[reading]`), because the
 * overlay passes `{ ...node.data, ...annotation.data }` to the renderer and re-calls it on every data tick.
 */
export interface CardData extends Record<string, unknown> {
  tag: string;
  unit: string;
  decimals: number;
  /** Key of the live reading in the anchored node's data. */
  reading: string;
}

/** A live reading stored in node data by the simulator. */
export interface Reading {
  value: number;
  status: 'normal' | 'warning' | 'alarm' | 'stale';
}

const card = (id: string, node: string, x: number, y: number, tag: string, unit: string) => ({
  id,
  kind: 'html' as const,
  renderer: 'readingCard',
  anchor: { node },
  position: { x, y },
  size: { width: 160, height: 92 },
  leader: true,
  data: { tag, unit, decimals: 1, reading: id } satisfies CardData,
});

export const monitorModel: DiagramModel = {
  version: 1,
  meta: { title: 'Mix & transfer', source: 'figma:3hN8q7S6TeBeKY7LKoiHgK/1:21' },
  nodes: [
    { id: 'SRC-SOFT', type: 'demo/terminal', position: { x: 10, y: 159 } },
    { id: 'SRC-STEAM', type: 'demo/terminal', position: { x: 88, y: 82 } },
    { id: 'TO-MPHE', type: 'demo/terminal', position: { x: 1120, y: 514 } },
    {
      id: 'MHWT',
      type: 'process/tank',
      position: { x: 170, y: 105 },
      label: 'MHWT',
      data: { level: 0.62, 'TI-101': { value: 14.0, status: 'normal' } satisfies Reading },
    },
    {
      id: 'MPAT',
      type: 'process/conical-tank',
      position: { x: 840, y: 105 },
      label: 'MPAT',
      data: { level: 0.35, 'FI-103': { value: 1.1, status: 'normal' } satisfies Reading },
    },
    {
      id: 'MRM',
      type: 'process/conical-tank',
      position: { x: 500, y: 320 },
      label: 'MRM',
      data: { level: 0.48 },
    },
    {
      id: 'MHT',
      type: 'process/conical-tank',
      position: { x: 900, y: 320 },
      label: 'MHT',
      data: { level: 0.71, 'TI-102': { value: 12.9, status: 'warning' } satisfies Reading },
    },
    {
      id: 'P03',
      type: 'process/pump',
      position: { x: 300, y: 128 },
      label: 'P03',
      data: { running: true },
    },
    {
      id: 'P102',
      type: 'process/pump',
      position: { x: 680, y: 443 },
      label: 'P102',
      data: { running: true },
    },
    {
      id: 'FCV101',
      type: 'process/control-valve',
      position: { x: 780, y: 335 },
      label: 'FCV101',
      data: { open: true, 'FI-101': { value: 2.1, status: 'alarm' } satisfies Reading },
    },
  ],
  links: [
    {
      id: 'soft-water',
      kind: 'process',
      from: { node: 'SRC-SOFT', port: 'out' },
      to: { node: 'MHWT', port: 'in' },
      data: { flowing: true },
    },
    {
      id: 'steam',
      kind: 'process',
      from: { node: 'SRC-STEAM', port: 'out' },
      to: { node: 'MHWT', port: 'top' },
      data: { flowing: true },
    },
    {
      id: 'mhwt-p03',
      kind: 'process',
      from: { node: 'MHWT', port: 'out' },
      to: { node: 'P03', port: 'suction' },
      data: { flowing: true },
    },
    {
      id: 'p03-mrm',
      kind: 'process',
      from: { node: 'P03', port: 'discharge' },
      to: { node: 'MRM', port: 'top' },
      routing: 'manual',
      waypoints: [
        { x: 440, y: 131 },
        { x: 440, y: 300 },
        { x: 550, y: 300 },
      ],
      data: { flowing: true },
    },
    {
      id: 'additive',
      kind: 'process',
      from: { node: 'MPAT', port: 'bottom' },
      to: { node: 'MRM', port: 'out' },
      routing: 'manual',
      waypoints: [
        { x: 890, y: 270 },
        { x: 610, y: 270 },
        { x: 610, y: 380 },
      ],
      data: { flowing: true },
    },
    {
      id: 'mrm-p102',
      kind: 'process',
      from: { node: 'MRM', port: 'bottom' },
      to: { node: 'P102', port: 'suction' },
      routing: 'manual',
      waypoints: [{ x: 550, y: 480 }],
      data: { flowing: true },
    },
    {
      id: 'p102-fcv',
      kind: 'process',
      from: { node: 'P102', port: 'discharge' },
      to: { node: 'FCV101', port: 'in' },
      routing: 'manual',
      waypoints: [
        { x: 770, y: 446 },
        { x: 770, y: 380 },
      ],
      data: { flowing: true },
    },
    {
      id: 'fcv-mht',
      kind: 'process',
      from: { node: 'FCV101', port: 'out' },
      to: { node: 'MHT', port: 'in' },
      data: { flowing: true },
    },
    {
      id: 'to-mphe',
      kind: 'process',
      from: { node: 'MHT', port: 'bottom' },
      to: { node: 'TO-MPHE', port: 'in' },
      routing: 'manual',
      waypoints: [{ x: 950, y: 520 }],
      data: { flowing: true },
    },
  ],
  annotations: [
    card('TI-101', 'MHWT', 308, -15, 'TI-101 · MHWT', '°C'),
    card('FI-103', 'MPAT', 132, 3, 'FI-103 · Additive', 'kg/h'),
    card('FI-101', 'FCV101', -136, -34, 'FI-101 · Feed flow', 'kg/h'),
    card('TI-102', 'MHT', 100, 20, 'TI-102 · MHT', '°C'),
    {
      id: 'P03-state',
      kind: 'html',
      renderer: 'pumpState',
      anchor: { node: 'P03' },
      position: { x: 0, y: 98 },
      size: { width: 80, height: 17 },
    },
    {
      id: 'P102-state',
      kind: 'html',
      renderer: 'pumpState',
      anchor: { node: 'P102' },
      position: { x: 0, y: 98 },
      size: { width: 80, height: 17 },
    },
    {
      id: 'area',
      kind: 'text',
      variant: 'area',
      text: '02 / MIX & TRANSFER',
      position: { x: 450, y: 292 },
    },
    {
      id: 'lbl-steam',
      kind: 'text',
      variant: 'label',
      text: 'Steam supply',
      position: { x: 24, y: 90 },
    },
    {
      id: 'lbl-soft',
      kind: 'text',
      variant: 'label',
      text: 'Soft water',
      position: { x: 24, y: 145 },
    },
    {
      id: 'lbl-additive',
      kind: 'text',
      variant: 'label',
      text: 'Additive dosing',
      position: { x: 804, y: 90 },
    },
    {
      id: 'lbl-mphe',
      kind: 'text',
      variant: 'label',
      text: 'To MPHE-02',
      position: { x: 1015, y: 548 },
    },
    {
      id: 'legend',
      kind: 'text',
      variant: 'legend',
      text: 'Solid line  Process flow     - - -  Instrument signal',
      position: { x: 24, y: 564 },
    },
  ],
};
