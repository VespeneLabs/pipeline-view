import { nodeSize, type DeleteRequest, type NodeModel } from '@pipeline-view/core';
import { useDiagram, useDiagramEvent, useSelection } from '@pipeline-view/react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ManifoldData } from './manifold';

// ---------------------------------------------------------------------------------------- rules

export interface Rules {
  /** Process lines run outlet → inlet (ports with roles: the manifold). */
  directed: boolean;
  noCycles: boolean;
  noSelfLoops: boolean;
  /** Ask before deleting (onBeforeDelete with a Promise). */
  confirmDeletes: boolean;
}

export const NO_RULES: Rules = {
  directed: false,
  noCycles: false,
  noSelfLoops: false,
  confirmDeletes: false,
};

const RULE_LABELS: Record<keyof Rules, [string, string]> = {
  directed: ['Directed process lines', 'outlet → inlet; the manifold has in/out ports'],
  noCycles: ['No cycles', 'refuse a process line that closes a loop'],
  noSelfLoops: ['No self-loops', 'refuse a line from a node to itself'],
  confirmDeletes: ['Confirm deletes', 'onBeforeDelete returns a Promise'],
};

export function RulesPanel({ rules, onChange }: { rules: Rules; onChange(r: Rules): void }) {
  return (
    <section className="editor-panel" aria-labelledby="rules-h" data-testid="rules">
      <h2 id="rules-h">Rules</h2>
      {(Object.keys(RULE_LABELS) as (keyof Rules)[]).map((k) => (
        <label key={k} className="editor-check">
          <input
            type="checkbox"
            checked={rules[k]}
            data-testid={`rule-${k}`}
            onChange={(e) => onChange({ ...rules, [k]: e.target.checked })}
          />
          <span>
            {RULE_LABELS[k][0]}
            <small>{RULE_LABELS[k][1]}</small>
          </span>
        </label>
      ))}
      <p className="editor-note">
        Connection rules are diagram options, read when the diagram is created: changing them
        re-creates it with the current document and view.
      </p>
    </section>
  );
}

// --------------------------------------------------------------------------------------- toasts

const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** Short-lived messages: refusals from connectRejected, and errors from the inspector. */
export function Toasts({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const push = (text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="editor-toasts" role="status" aria-live="polite" data-testid="toasts">
        {items.map((t) => (
          <div key={t.id} className="editor-toast">
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Shows why a connection was refused (FR-42). Drops on empty canvas are cancels and don't fire. */
export function RefusalToasts() {
  const toast = useToast();
  useDiagramEvent('connectRejected', (e) => toast(`Not connected: ${e.reason}`));
  useDiagramEvent('changeDropped', () =>
    toast('The approved delete was skipped: the diagram changed while you were deciding.'),
  );
  return null;
}

// -------------------------------------------------------------------------------- confirm dialog

export interface ConfirmRequest {
  items: DeleteRequest;
  resolve(ok: boolean): void;
}

/** The app's own confirmation, shown while an onBeforeDelete Promise is pending (FR-43). */
export function ConfirmDialog({ request }: { request: ConfirmRequest | null }) {
  if (!request) return null;
  const { nodes, links } = request.items;
  const what = [
    nodes.length && `${nodes.length} node${nodes.length > 1 ? 's' : ''}`,
    links.length && `${links.length} line${links.length > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' and ');
  return (
    <div className="editor-dialog-backdrop">
      <div
        className="editor-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-h"
        data-testid="confirm-dialog"
      >
        <h2 id="confirm-h">Delete {what}?</h2>
        <p>
          {[...nodes, ...links].join(', ')}. Lines attached to deleted nodes go with them. You can
          undo this.
        </p>
        <div className="editor-dialog-actions">
          <button type="button" onClick={() => request.resolve(false)} autoFocus>
            Cancel
          </button>
          <button type="button" className="danger" onClick={() => request.resolve(true)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ inspector

export function Inspector() {
  const d = useDiagram();
  const selection = useSelection();
  const toast = useToast();
  const [, bump] = useState(0);
  useDiagramEvent('modelChange', () => bump((n) => n + 1));
  const ref = selection.length === 1 ? selection[0]! : null;
  // Public API only (the store is internal); a toJSON() per render is cheap at this size.
  const doc = d?.toJSON();
  const node = ref?.kind === 'node' ? doc?.nodes.find((n) => n.id === ref.id) : undefined;
  const link = ref?.kind === 'link' ? doc?.links.find((l) => l.id === ref.id) : undefined;

  const edit = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      // e.g. removing a port that carries a locked line: the transaction is refused and rolled back.
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  if (!d || (!node && !link)) {
    return (
      <section className="editor-panel" aria-labelledby="insp-h" data-testid="inspector">
        <h2 id="insp-h">Inspector</h2>
        <p className="editor-note">Select one node or line.</p>
      </section>
    );
  }

  const m = node?.type === 'demo/manifold' ? ((node.data ?? {}) as ManifoldData) : null;
  const setCount = (key: 'inputs' | 'outputs', value: number) =>
    edit(() =>
      d.update((tx) =>
        tx.updateNode(node!.id, {
          data: { ...node!.data, [key]: Math.max(1, Math.min(8, value)) },
        }),
      ),
    );

  return (
    <section className="editor-panel" aria-labelledby="insp-h" data-testid="inspector">
      <h2 id="insp-h">{node ? (node.label ?? node.id) : `Line ${link!.id}`}</h2>
      {m && (
        <div className="editor-steppers">
          {(['inputs', 'outputs'] as const).map((k) => (
            <div key={k} className="editor-stepper">
              <span>{k === 'inputs' ? 'Inlets' : 'Outlets'}</span>
              <button
                type="button"
                aria-label={`Fewer ${k}`}
                data-testid={`${k}-minus`}
                onClick={() => setCount(k, (m[k] ?? (k === 'inputs' ? 2 : 1)) - 1)}
              >
                −
              </button>
              <output data-testid={`${k}-count`}>{m[k] ?? (k === 'inputs' ? 2 : 1)}</output>
              <button
                type="button"
                aria-label={`More ${k}`}
                data-testid={`${k}-plus`}
                onClick={() => setCount(k, (m[k] ?? (k === 'inputs' ? 2 : 1)) + 1)}
              >
                +
              </button>
            </div>
          ))}
          <p className="editor-note">
            Ports come from the node&apos;s data. Removing one removes its line in the same undo
            step; a locked line refuses.
          </p>
        </div>
      )}
      <label className="editor-check">
        <input
          type="checkbox"
          data-testid="locked"
          checked={!!(node ?? link)!.locked}
          onChange={(e) =>
            edit(() =>
              d.update((tx) =>
                node
                  ? tx.updateNode(node.id, { locked: e.target.checked })
                  : tx.updateLink(link!.id, { locked: e.target.checked }),
              ),
            )
          }
        />
        <span>
          Locked
          <small>can&apos;t be moved, deleted or reconnected</small>
        </span>
      </label>
    </section>
  );
}

// --------------------------------------------------------------------------------- host palette

export const EQUIPMENT_MIME = 'application/x-demo-equipment';

const HOST_ITEMS: { type: string; label: string }[] = [
  { type: 'process/pump', label: 'Pump' },
  { type: 'process/control-valve', label: 'Control valve' },
  { type: 'demo/manifold', label: 'Manifold' },
];

/**
 * Your own palette, outside the library: HTML5 drag and drop with your own MIME type (acceptDrop), and
 * buttons that start placement mode (startPlacement) for keyboard and touch users.
 */
export function HostPalette() {
  const d = useDiagram();
  useEffect(() => {
    if (!d) return;
    let n = 0;
    return d.acceptDrop({
      mimeType: EQUIPMENT_MIME,
      toNode: (dt, point): NodeModel | null => {
        const { type, label } = JSON.parse(dt.getData(EQUIPMENT_MIME)) as {
          type: string;
          label: string;
        };
        const def = d.symbols.get(type);
        if (!def) return null;
        const size = nodeSize(def);
        n++;
        return {
          id: `${type.split('/')[1]}_${n}`,
          type,
          label: `${label} ${n}`,
          position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
        };
      },
    });
  }, [d]);
  return (
    <section className="editor-panel" aria-labelledby="host-h" data-testid="host-palette">
      <h2 id="host-h">Your palette</h2>
      <ul className="editor-host-items">
        {HOST_ITEMS.map((it) => (
          <li key={it.type}>
            <span
              draggable
              className="editor-host-item"
              data-testid={`host-${it.type}`}
              onDragStart={(e) => {
                e.dataTransfer.setData(EQUIPMENT_MIME, JSON.stringify(it));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            >
              ⠿ {it.label}
            </span>
            <button
              type="button"
              data-testid={`place-${it.type}`}
              onClick={() => d?.startPlacement(it.type, { label: it.label })}
            >
              Place…
            </button>
          </li>
        ))}
      </ul>
      <p className="editor-note">
        Drag an item in, or press <b>Place…</b>: move with the mouse or arrow keys, click or{' '}
        <kbd>Enter</kbd> to place, <kbd>Esc</kbd> to cancel.
      </p>
    </section>
  );
}
