import type { Diagram, ItemRef } from '@pipeline-view/core';
import { PipelineView } from '@pipeline-view/react';
import { processSymbols } from '@pipeline-view/symbols';
import { useState } from 'react';
import { useStore } from 'zustand';
import { WhatToTry } from '../../components/WhatToTry';
import { addFromOutside, createDocStore, renameFromOutside } from './store';
import '../demo.css';
import './controlled.css';

export function ControlledDemo() {
  // One store per visit, so the page starts fresh every time. A real app would usually have a module-level
  // store (see the "Controlled mode with Zustand" guide).
  const [store] = useState(() => createDocStore());
  const doc = useStore(store, (s) => s.doc);
  const dirty = useStore(store, (s) => s.dirty);
  const savedAt = useStore(store, (s) => s.savedAt);
  const past = useStore(store, (s) => s.past.length);
  const future = useStore(store, (s) => s.future.length);
  // Options are read once, when the diagram is created: hand it the store's history adapter.
  const [options] = useState(() => ({
    history: store.getState().history,
    ariaLabel: 'Controlled diagram',
  }));
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [selection, setSelection] = useState<ItemRef[]>([]);

  const onReady = (d: Diagram) => {
    setDiagram(d);
    (window as unknown as { __diagram?: Diagram; __store?: typeof store }).__diagram = d;
    (window as unknown as { __store?: typeof store }).__store = store; // for tests and the console
  };

  /** Applies an edit made outside the diagram: the store gets a new document, the view patches itself. */
  const external = (edit: typeof renameFromOutside) => {
    const s = store.getState();
    s.setDoc(edit(s.doc), true);
  };

  const save = () => {
    diagram?.markSaved();
    store.getState().markSaved();
  };

  return (
    <>
      <h1>Controlled mode</h1>
      <p className="lede">
        The document lives in the app&apos;s own store (Zustand here). The diagram reports every
        edit, the store hands the new version back, and changes made outside the diagram are applied
        as a patch, so the viewport, the selection and routes you didn&apos;t touch stay as they
        were. Undo history is the store&apos;s too.
      </p>
      <WhatToTry
        steps={[
          <>
            Drag a pump or connect two ports: the JSON on the right updates and the document turns
            dirty.
          </>,
          <>
            Click <b>Save</b>: the dirty flag clears (<code>markSaved()</code>).
          </>,
          <>
            Zoom in and select P-101, then click <b>Rename from outside</b>: the label changes, but
            your zoom and selection stay.
          </>,
          <>
            Use <b>Undo</b> / <b>Redo</b> (or <kbd>Ctrl</kbd>+<kbd>Z</kbd>): the store&apos;s
            history stacks change size. Edits from outside aren&apos;t in your undo history: they
            weren&apos;t yours.
          </>,
        ]}
      />
      <div className="demo-toolbar" role="toolbar" aria-label="Document">
        <button
          type="button"
          className="demo-btn primary"
          disabled={!dirty}
          onClick={save}
          data-testid="save"
        >
          Save
        </button>
        <button type="button" className="demo-btn" disabled={!past} onClick={() => diagram?.undo()}>
          Undo
        </button>
        <button
          type="button"
          className="demo-btn"
          disabled={!future}
          onClick={() => diagram?.redo()}
        >
          Redo
        </button>
        <span className="editor-sep" aria-hidden />
        <button type="button" className="demo-btn" onClick={() => external(renameFromOutside)}>
          Rename from outside
        </button>
        <button type="button" className="demo-btn" onClick={() => external(addFromOutside)}>
          Add from outside
        </button>
      </div>
      <div className="demo-split">
        <div className="demo-canvas" data-testid="controlled-canvas">
          <PipelineView
            model={doc}
            mode="edit"
            symbols={processSymbols}
            options={options}
            style={{ height: '100%' }}
            onReady={onReady}
            onModelChange={(e) => store.getState().setDoc(e.model, diagram?.isDirty() ?? true)}
            onSelectionChange={(e) => setSelection(e.selection)}
          />
        </div>
        <div className="demo-panel">
          <section aria-labelledby="state-h">
            <h2 id="state-h">Store</h2>
            <dl className="controlled-state">
              <dt>Document</dt>
              <dd data-testid="dirty" data-dirty={dirty}>
                {dirty ? '● Unsaved changes' : savedAt ? `Saved at ${savedAt}` : 'Saved'}
              </dd>
              <dt>History</dt>
              <dd data-testid="history">
                {past} undo · {future} redo
              </dd>
              <dt>Selection</dt>
              <dd data-testid="selection">
                {selection.length ? selection.map((s) => s.id).join(', ') : 'none'}
              </dd>
            </dl>
          </section>
          <section aria-labelledby="json-h">
            <h2 id="json-h">Document JSON</h2>
            <pre className="controlled-json" data-testid="json">
              {JSON.stringify(doc, null, 2)}
            </pre>
          </section>
        </div>
      </div>
    </>
  );
}
