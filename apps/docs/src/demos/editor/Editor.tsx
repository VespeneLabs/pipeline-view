import { type Diagram, type DiagramModel, getEditor, validateModel } from '@pipeline-view/core';
import {
  PipelineView,
  SymbolPalette,
  useDiagram,
  useDiagramEvent,
  useHistory,
  useSelection,
} from '@pipeline-view/react';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import { useState } from 'react';
import { editorStartModel } from './startModel';
import './editor.css';

const symbols = [...gasSymbols, ...processSymbols];
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
  const [model] = useState(editorStartModel);
  const onReady = (d: Diagram) => {
    if (d.view) d.view.root.dataset.testid = 'editor-canvas';
    (window as unknown as { __diagram?: Diagram }).__diagram = d; // for e2e specs and the console
  };
  return (
    <>
      <h1>P&amp;ID editor</h1>
      <p className="lede">
        Drag symbols from the palette (or click one to add it at the centre), connect ports by
        dragging from one to another, and edit with the keyboard: <kbd>R</kbd> rotate, <kbd>H</kbd>/
        <kbd>V</kbd> flip, <kbd>Del</kbd> delete, <kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> undo,{' '}
        <kbd>⌘/Ctrl</kbd>+<kbd>D</kbd> duplicate, <kbd>Enter</kbd> rename. Drag a pipe segment to
        reroute it by hand; double-click a segment to add a bend.
      </p>
      <div className="editor-layout">
        <PipelineView
          model={model}
          mode="edit"
          symbols={symbols}
          onReady={onReady}
          options={{
            grid: { size: 10, snap: true, visible: true },
            ariaLabel: 'P&ID editor canvas',
          }}
          className="editor-canvas"
        >
          <Toolbar />
          <div className="editor-palette" data-testid="palette">
            <SymbolPalette />
          </div>
          <SelectionInfo />
          <JsonPanel />
        </PipelineView>
      </div>
    </>
  );
}
