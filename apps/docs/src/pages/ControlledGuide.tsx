import { Code } from '../components/Code';

const STORE = `// store.ts
import { create } from 'zustand';
import type { DiagramModel, HistoryEntry } from '@vespenelabs/pipeline-view';

interface EditorState {
  doc: DiagramModel;
  dirty: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  setDoc(doc: DiagramModel, dirty: boolean): void;
}

export const useEditor = create<EditorState>()((set) => ({
  doc: { version: 2, nodes: [], links: [] },
  dirty: false,
  past: [],
  future: [],
  setDoc: (doc, dirty) => set({ doc, dirty }),
}));`;

const HISTORY = `// The diagram pushes one entry per undoable edit; the store keeps the stacks.
import type { HistoryAdapter } from '@vespenelabs/pipeline-view';
import { useEditor } from './store';

export const history: HistoryAdapter = {
  push: (entry) => useEditor.setState((s) => ({ past: [...s.past, entry], future: [] })),
  undo: () => {
    const entry = useEditor.getState().past.at(-1);
    if (entry) useEditor.setState((s) => ({ past: s.past.slice(0, -1), future: [entry, ...s.future] }));
    return entry;
  },
  redo: () => {
    const entry = useEditor.getState().future[0];
    if (entry) useEditor.setState((s) => ({ past: [...s.past, entry], future: s.future.slice(1) }));
    return entry;
  },
  canUndo: () => useEditor.getState().past.length > 0,
  canRedo: () => useEditor.getState().future.length > 0,
};`;

const VIEW = `import { PipelineView } from '@vespenelabs/pipeline-view/react';
import { useEditor } from './store';
import { history } from './history';

const options = { history }; // read once, when the diagram is created

export function Editor() {
  const doc = useEditor((s) => s.doc);
  const diagram = useRef<Diagram | null>(null);
  return (
    <PipelineView
      model={doc}
      mode="edit"
      options={options}
      onReady={(d) => (diagram.current = d)}
      onModelChange={(e) => useEditor.getState().setDoc(e.model, diagram.current!.isDirty())}
    />
  );
}`;

const OUTSIDE = `// Another user renamed a pump. Just put the new document in the store:
useEditor.getState().setDoc(renamePump(useEditor.getState().doc, 'P1', 'P-101A'), true);
// <PipelineView> sees a new version of the same document and calls diagram.patch(doc):
// only the difference is applied. No reload, no viewport reset; the selection and live values stay.`;

const SAVE = `async function save() {
  await api.saveDiagram(useEditor.getState().doc);
  diagram.markSaved(); // isDirty() is measured against this point from now on
  useEditor.setState({ dirty: false });
}`;

const VANILLA = `// Without React, the same three calls:
diagram.on('modelChange', (e) => store.setDoc(e.model));   // edits → store
diagram.patch(store.doc);                                   // store → diagram (outside edits)
diagram.applyDiff(patchFromServer);                         // or apply a ModelPatch directly`;

export function ControlledGuide() {
  return (
    <article className="prose">
      <h1>Controlled mode with Zustand</h1>
      <p className="lede">
        If your app keeps the document in its own store (Zustand, Redux, a server), let the store be
        the only source of truth. The diagram reports every edit; the store hands each new version
        back; edits from elsewhere are applied as a patch, not a reload. Try it on the{' '}
        <a href="#/controlled">Controlled mode demo</a>.
      </p>

      <h2>1. The store</h2>
      <Code>{STORE}</Code>

      <h2>2. History in the store (optional)</h2>
      <p>
        By default the diagram keeps its own undo stack. Pass a <code>HistoryAdapter</code> to keep
        the entries in your store instead (JSON patches, so they can be persisted), or{' '}
        <code>history: false</code> if your app already has undo. <code>diagram.undo()</code>,{' '}
        <code>redo()</code> and <kbd>Ctrl</kbd>+<kbd>Z</kbd> keep working and call the adapter.
      </p>
      <Code>{HISTORY}</Code>

      <h2>3. Wire the view</h2>
      <p>
        <code>model</code> comes from the store and <code>onModelChange</code> writes back. The
        object the view itself reported is recognised and skipped, so a round trip costs nothing.
      </p>
      <Code>{VIEW}</Code>

      <h2>4. Edits from outside</h2>
      <p>
        A new document that shares node or link ids with the current one is applied with{' '}
        <code>diagram.patch()</code>. Patches from outside are <strong>not</strong> undoable by
        default: they aren&apos;t the user&apos;s edits. Pass <code>{'{ undoable: true }'}</code> to{' '}
        <code>patch()</code> if they should be. With React, set{' '}
        <code>{'<PipelineView modelUpdates="undoable">'}</code> instead: every new version of the
        same document from your store (an inspector edit, say) becomes one undo step, like a canvas
        edit. Undo then reports <code>origin: &apos;history&apos;</code> through{' '}
        <code>onModelChange</code>, so the store follows.
      </p>
      <Code>{OUTSIDE}</Code>

      <h2>5. Dirty state and saving</h2>
      <p>
        <code>isDirty()</code> compares the document (not live values) with the last{' '}
        <code>markSaved()</code> or <code>load()</code>, so undoing back to the saved state is clean
        again.
      </p>
      <Code>{SAVE}</Code>

      <h2>Without React</h2>
      <Code>{VANILLA}</Code>
    </article>
  );
}
