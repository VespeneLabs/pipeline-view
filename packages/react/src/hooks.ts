import type { DiagramApi, DiagramEvents, ItemRef, Viewport } from '@pipeline-view/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useDiagram } from './PipelineView';

const EMPTY: ItemRef[] = [];

/** Subscribes to a diagram event for the component's lifetime. The handler may change freely. */
export function useDiagramEvent<K extends keyof DiagramEvents>(
  event: K,
  handler: (payload: DiagramEvents[K]) => void,
  explicit?: DiagramApi | null,
): void {
  const ctx = useDiagram();
  const diagram = explicit ?? ctx;
  const ref = useRef(handler);
  useLayoutEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!diagram) return;
    return diagram.on(event, (p) => ref.current(p));
  }, [diagram, event]);
}

/** Current selection, re-rendering on selectionChange. */
export function useSelection(explicit?: DiagramApi | null): ItemRef[] {
  const ctx = useDiagram();
  const diagram = explicit ?? ctx;
  const cache = useRef<ItemRef[]>(EMPTY);
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!diagram) return () => {};
      cache.current = diagram.getSelection();
      return diagram.on('selectionChange', ({ selection }) => {
        cache.current = selection;
        fn();
      });
    },
    [diagram],
  );
  return useSyncExternalStore(
    subscribe,
    () => (diagram ? cache.current : EMPTY),
    () => EMPTY,
  );
}

/** Current viewport, re-rendering on viewportChange. Avoid it in components that render often. */
export function useViewport(explicit?: DiagramApi | null): Viewport | null {
  const ctx = useDiagram();
  const diagram = explicit ?? ctx;
  const cache = useRef<Viewport | null>(null);
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!diagram) return () => {};
      cache.current = diagram.getViewport();
      return diagram.on('viewportChange', ({ viewport }) => {
        cache.current = viewport;
        fn();
      });
    },
    [diagram],
  );
  return useSyncExternalStore(
    subscribe,
    () => (diagram ? cache.current : null),
    () => null,
  );
}

/** Undo/redo availability, updated after every model change. */
export function useHistory(explicit?: DiagramApi | null): {
  canUndo: boolean;
  canRedo: boolean;
} {
  const ctx = useDiagram();
  const diagram = explicit ?? ctx;
  const key = useRef('00');
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!diagram) return () => {};
      const read = () => (key.current = `${+diagram.canUndo()}${+diagram.canRedo()}`);
      read();
      return diagram.on('modelChange', () => {
        const before = key.current;
        if (read() !== before) fn();
      });
    },
    [diagram],
  );
  const k = useSyncExternalStore(
    subscribe,
    () => (diagram ? key.current : '00'),
    () => '00',
  );
  return { canUndo: k[0] === '1', canRedo: k[1] === '1' };
}
