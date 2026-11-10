# @pipeline-view/react

React bindings for [`@pipeline-view/core`](../core). SSR-safe (Next.js, Remix) and StrictMode-safe. React overlay content renders through portals, so it keeps your app's context.

```sh
npm install @pipeline-view/react @pipeline-view/core @pipeline-view/symbols
```

```tsx
import { PipelineView, useSelection } from '@pipeline-view/react';
import { gasSymbols, processSymbols } from '@pipeline-view/symbols';
import type { Diagram } from '@pipeline-view/core';
import '@pipeline-view/core/styles.css';

const symbols = [...gasSymbols, ...processSymbols];
const renderers = {
  // Referenced by an HtmlAnnotation's `renderer`, or a node's `data.overlay`.
  // Anchored annotations receive the node's live data merged with their own.
  reading: (item) => <ReadingCard value={item.data?.value} status={item.status} />,
};

export function Plant({ model }) {
  const ref = useRef<Diagram>(null);
  useEffect(() => feed.subscribe((tag, value) => ref.current?.setNodeData(tag, { value })), []);
  return (
    <PipelineView
      ref={ref}
      model={model}
      mode="view"
      theme="auto"
      symbols={symbols}
      renderers={renderers}
      onNodeClick={({ item }) => openDetails(item.id)}
      style={{ height: 600 }}
    >
      <SelectionInfo />
    </PipelineView>
  );
}

function SelectionInfo() {
  const selection = useSelection(); // children of <PipelineView> see its diagram through context
  return <p>{selection.length} selected</p>;
}
```

## Props

`model`, `mode`, `theme`, `symbols`, `renderers`, `editor` (editor options; the editor attaches when `mode="edit"`), `options` (other `DiagramOptions`, read once), `fitOnLoad`, `onReady`, plus `onNodeClick`, `onNodeDoubleClick`, `onLinkClick`, `onContextMenu`, `onHover`, `onSelectionChange`, `onModelChange` and `onViewportChange`.

**Controlled usage:** passing back the model you got from `onModelChange` doesn't reload the diagram. Any other new model object does. Keep `renderers` stable (a module constant or `useMemo`) so overlay slots don't re-render on every parent render.

## Hooks

`useDiagram()`, `useDiagramEvent(event, handler)`, `useSelection()`, `useViewport()`, `useHistory()` → `{ canUndo, canRedo }`. Each one reads the nearest `<PipelineView>`, or takes a diagram explicitly.

MIT © VespeneLabs
