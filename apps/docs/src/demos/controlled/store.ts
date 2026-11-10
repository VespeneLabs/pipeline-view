import type { DiagramModel, HistoryAdapter, HistoryEntry } from '@pipeline-view/core';
import { createStore } from 'zustand/vanilla';

/**
 * The host app's document store. The diagram never owns the document here: it reports every edit
 * (onModelChange) and the store hands the new version back through the `model` prop.
 *
 * Undo history lives here too, as the patches the diagram pushes through the HistoryAdapter.
 */
export interface DocState {
  doc: DiagramModel;
  /** Entries the diagram pushed: one per undoable edit. */
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Mirrors diagram.isDirty(), refreshed on every change and on save. */
  dirty: boolean;
  savedAt: string | null;
  setDoc(doc: DiagramModel, dirty: boolean): void;
  markSaved(): void;
  /** The diagram's view of the history: it calls these, the store keeps the stacks. */
  history: HistoryAdapter;
}

export const startDoc: DiagramModel = {
  version: 2,
  nodes: [
    {
      id: 'T1',
      type: 'process/tank',
      position: { x: 0, y: 0 },
      label: 'T-101',
      data: { level: 0.7 },
    },
    { id: 'P1', type: 'process/pump', position: { x: 200, y: 24 }, label: 'P-101' },
    { id: 'V1', type: 'process/control-valve', position: { x: 380, y: 19 }, label: 'FCV-101' },
    {
      id: 'T2',
      type: 'process/tank',
      position: { x: 580, y: 0 },
      label: 'T-102',
      data: { level: 0.3 },
    },
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
  ],
};

export function createDocStore(doc: DiagramModel = startDoc) {
  return createStore<DocState>()((set, get) => ({
    doc,
    past: [],
    future: [],
    dirty: false,
    savedAt: null,
    setDoc: (next, dirty) => set({ doc: next, dirty }),
    markSaved: () => set({ dirty: false, savedAt: new Date().toLocaleTimeString() }),
    history: {
      push: (entry) => set((s) => ({ past: [...s.past, entry], future: [] })),
      undo: () => {
        const entry = get().past.at(-1);
        if (entry) set((s) => ({ past: s.past.slice(0, -1), future: [entry, ...s.future] }));
        return entry;
      },
      redo: () => {
        const entry = get().future[0];
        if (entry) set((s) => ({ past: [...s.past, entry], future: s.future.slice(1) }));
        return entry;
      },
      canUndo: () => get().past.length > 0,
      canRedo: () => get().future.length > 0,
    },
  }));
}

export type DocStore = ReturnType<typeof createDocStore>;

/** An edit made outside the diagram, e.g. by another user or a server: a new version of the document. */
export function renameFromOutside(doc: DiagramModel): DiagramModel {
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === 'P1' ? { ...n, label: n.label === 'P-101' ? 'P-101 (spare)' : 'P-101' } : n,
    ),
  };
}

export function addFromOutside(doc: DiagramModel): DiagramModel {
  const n = doc.nodes.filter((x) => x.id.startsWith('PI')).length + 1;
  const id = `PI${n}`;
  return {
    ...doc,
    nodes: [
      ...doc.nodes,
      {
        id,
        type: 'process/pump',
        position: { x: 200 + 140 * (n - 1), y: 200 },
        label: `P-${200 + n}`,
      },
    ],
  };
}
