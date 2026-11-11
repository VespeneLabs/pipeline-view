import {
  type DeleteRequest,
  type Diagram,
  type DiagramModel,
  type Viewport,
  getEditor,
  validateModel,
} from '@pipeline-view/core';
import {
  PipelineView,
  SymbolPalette,
  ViewportControls,
  useDiagram,
  useDiagramEvent,
  useHistory,
  useSelection,
} from '@pipeline-view/react';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import { useMemo, useRef, useState } from 'react';
import { WhatToTry } from '../../components/WhatToTry';
import { manifold } from './manifold';
import {
  ConfirmDialog,
  HostPalette,
  Inspector,
  NO_RULES,
  RefusalToasts,
  RulesPanel,
  Toasts,
  type ConfirmRequest,
  type Rules,
} from './rules';
import { editorStartModel } from './startModel';
import '../demo.css';
import './editor.css';

const symbols = [...gasSymbols, ...processSymbols, manifold];
const KINDS = ['process', 'signal', 'pneumatic', 'electrical'] as const;

function Toolbar() {
  const d = useDiagram();
  const { canUndo, canRedo } = useHistory();
  const [kind, setKind] = useState<string>('process');
  const pick = (k: string) => {
    setKind(k);
    if (d) getEditor(d)?.setLinkKind(k);
  };
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Editor">
      <button type="button" data-testid="undo" disabled={!canUndo} onClick={() => d?.undo()}>
        Undo
      </button>
      <button type="button" data-testid="redo" disabled={!canRedo} onClick={() => d?.redo()}>
        Redo
      </button>
      <span className="editor-sep" aria-hidden />
      <div role="radiogroup" aria-label="New link kind" className="editor-kinds">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            data-testid={`link-kind-${k}`}
            onClick={() => pick(k)}
          >
            {k[0]!.toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <span className="editor-sep" aria-hidden />
      <button type="button" onClick={() => d?.zoomToFit({ padding: 24, animate: true })}>
        Fit
      </button>
    </div>
  );
}

function SelectionInfo() {
  const d = useDiagram();
  const selection = useSelection();
  const [, bump] = useState(0);
  useDiagramEvent('modelChange', () => bump((n) => n + 1));
  const text = selection
    .map((ref) => {
      if (ref.kind !== 'node') return `${ref.kind} ${ref.id}`;
      const n = d?.toJSON().nodes.find((x) => x.id === ref.id);
      const flips = [n?.flipX && 'flipped X', n?.flipY && 'flipped Y'].filter(Boolean).join(', ');
      return `${ref.id} (${n?.type}) · rotation ${n?.rotation ?? 0}°${flips ? ` · ${flips}` : ''}`;
    })
    .join('; ');
  return (
    <p className="editor-selection" data-testid="selection-info" aria-live="polite">
      {text || 'Nothing selected'}
    </p>
  );
}

function JsonPanel() {
  const d = useDiagram();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    if (!d) return;
    setText(JSON.stringify(d.toJSON(), null, 2));
    setError(null);
  };
  const load = () => {
    if (!d) return;
    try {
      const model = JSON.parse(text) as DiagramModel;
      validateModel(model);
      d.load(model);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="editor-json" aria-label="Diagram JSON">
      <div className="editor-json-actions">
        <button type="button" data-testid="save-json" onClick={save}>
          Save to JSON
        </button>
        <button type="button" data-testid="load-json" onClick={load} disabled={!text}>
          Load from JSON
        </button>
        {error && (
          <span className="editor-error" role="alert">
            ! {error}
          </span>
        )}
      </div>
      <textarea
        data-testid="json-textarea"
        aria-label="Diagram JSON"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Save to JSON to see the model, edit it, then load it back."
      />
    </section>
  );
}

export function PidEditor() {
  const [rules, setRules] = useState<Rules>(NO_RULES);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  // Document and view to (re)create the diagram from. Taken from the live diagram when a rule change
  // re-creates it, so the user keeps their edits and their view.
  const [snapshot, setSnapshot] = useState<{ model: DiagramModel; viewport?: Viewport }>({
    model: editorStartModel,
  });
  // Written in the change handler, read inside onBeforeDelete: "Confirm deletes" needs no re-create.
  const confirmDeletes = useRef(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Connection rules are options, read when the diagram is created: a new key re-creates it.
  const structural = `${rules.directed}-${rules.noCycles}-${rules.noSelfLoops}`;
  const changeRules = (next: Rules) => {
    const nextStructural = `${next.directed}-${next.noCycles}-${next.noSelfLoops}`;
    if (diagram && nextStructural !== structural) {
      // A pending delete belongs to the diagram being replaced: answer it before it goes.
      confirm?.resolve(false);
      setSnapshot({ model: diagram.toJSON(), viewport: diagram.getViewport() });
    }
    confirmDeletes.current = next.confirmDeletes;
    setRules(next);
  };
  const options = useMemo(
    () => ({
      grid: { size: 10, snap: true, visible: true },
      ariaLabel: 'P&ID editor canvas',
      // Dropping a connection on a pipe attaches the new line to it.
      linkAttach: true,
      initialViewport: snapshot.viewport,
      directed: rules.directed ? { kinds: ['process'] } : false,
      noCycles: rules.noCycles ? { kinds: ['process'] } : false,
      noSelfLoops: rules.noSelfLoops,
      // A Promise keeps the delete pending until the dialog answers.
      onBeforeDelete: (items: DeleteRequest) =>
        !confirmDeletes.current ||
        new Promise<boolean>((resolve) =>
          setConfirm({
            items,
            resolve: (ok) => {
              setConfirm(null);
              resolve(ok);
            },
          }),
        ),
    }),
    [snapshot, rules.directed, rules.noCycles, rules.noSelfLoops],
  );

  const onReady = (d: Diagram) => {
    setDiagram(d);
    if (d.view) d.view.root.dataset.testid = 'editor-canvas';
    (window as unknown as { __diagram?: Diagram }).__diagram = d; // for e2e specs and the console
  };
  return (
    <Toasts>
      <h1>P&amp;ID editor</h1>
      <p className="lede">
        Drag symbols from the palette (or click one to add it at the centre), connect ports by
        dragging from one to another, and edit with the keyboard: <kbd>R</kbd> rotate, <kbd>H</kbd>/
        <kbd>V</kbd> flip, <kbd>Del</kbd> delete, <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> undo,{' '}
        <kbd>⌘/Ctrl</kbd>+<kbd>D</kbd> duplicate, <kbd>Enter</kbd> rename. Drag a pipe segment to
        reroute it by hand; double-click a segment to add a bend.
      </p>
      <WhatToTry
        steps={[
          <>
            Select manifold <b>M1</b> and use the <b>Inlets</b> stepper: ports appear and disappear,
            and removing <code>in-3</code> removes P2&apos;s line too (one undo step).
          </>,
          <>
            Turn on <b>Directed process lines</b>, then drag from one manifold inlet to another: the
            port turns red while you drag, and dropping explains why it was refused.
          </>,
          <>
            Try to move <b>T9 (locked)</b> or delete its line, then lower M1&apos;s <b>Outlets</b>{' '}
            to 1: the locked line refuses.
          </>,
          <>
            Turn on <b>Confirm deletes</b> and press <kbd>Del</kbd> on a selection: your own dialog
            decides.
          </>,
          <>
            Drag an item from <b>Your palette</b>, or press <b>Place…</b> and place it with the
            arrow keys and <kbd>Enter</kbd>.
          </>,
          <>
            Drag from a port and drop on a <b>pipe</b>, not on a port: the new line joins the pipe
            with a junction dot. Select it and drag the round handle at the joint, or use the arrow
            keys, to slide the joint along the pipe.
          </>,
          <>
            Connect without a mouse: select a node, press <kbd>C</kbd>, pick a port with the arrow
            keys and <kbd>Enter</kbd>, then pick a target the same way (nearest first).{' '}
            <kbd>Esc</kbd> steps back; a screen reader hears every step.
          </>,
        ]}
      />
      <div className="editor-layout">
        <PipelineView
          key={structural}
          model={snapshot.model}
          mode="edit"
          symbols={symbols}
          onReady={onReady}
          options={options}
          className="editor-canvas"
        >
          <Toolbar />
          <div className="editor-palette" data-testid="palette">
            <SymbolPalette />
          </div>
          <SelectionInfo />
          <div className="editor-side">
            <Inspector />
            <RulesPanel rules={rules} onChange={changeRules} />
            <HostPalette />
          </div>
          <JsonPanel />
          <ViewportControls lock />
          <RefusalToasts />
        </PipelineView>
      </div>
      <ConfirmDialog request={confirm} />
    </Toasts>
  );
}
