/**
 * Pointer events from the DOM → public DiagramEvents (nodeClick, nodeDoubleClick, linkClick, contextMenu, hover).
 * In view mode a click also selects the item, or clears the selection on the background (a drag on the
 * background selects with a box, see ViewMarquee). In edit mode the editor owns selection, so this
 * layer only emits events.
 */
import type { Point } from '../model/types';
import type { ItemRef } from '../diagram/types';
import type { Diagram } from '../diagram/diagram';
import type { View } from '../viewport/view';

export function attachPointerEvents(diagram: Diagram, view: View): () => void {
  const root = view.root;
  let hovered: string | null = null;

  const local = (e: MouseEvent): Point => {
    const r = root.getBoundingClientRect();
    return diagram.screenToDiagram({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  /** Ports report as their node: public events know nodes, links and annotations. */
  const itemAt = (target: EventTarget | null): ItemRef | null => {
    const hit = diagram.hitTest(target);
    if (!hit) return null;
    return hit.kind === 'port' ? { kind: 'node', id: hit.node } : hit;
  };

  const onClick = (e: MouseEvent) => {
    if (diagram.viewportController?.suppressClick) return;
    const item = itemAt(e.target);
    const point = local(e);
    if (item?.kind === 'node') diagram.emit('nodeClick', { item, point, originalEvent: e });
    else if (item?.kind === 'link') diagram.emit('linkClick', { item, point, originalEvent: e });
    if (diagram.getMode() === 'view') diagram.setSelection(item ? [item] : []);
  };

  const onDblClick = (e: MouseEvent) => {
    const item = itemAt(e.target);
    if (item?.kind === 'node') {
      diagram.emit('nodeDoubleClick', { item, point: local(e), originalEvent: e });
    }
  };

  /** The host decides whether to show a menu. It can call originalEvent.preventDefault(). */
  const emitContextMenu = (e: MouseEvent) => {
    const item = itemAt(e.target);
    const point = local(e);
    if (item) diagram.emit('contextMenu', { item, point, originalEvent: e });
    else diagram.emit('contextMenu', { item: null, point, originalEvent: e });
  };

  /** A `contextmenu` that arrived while the right button was still down. It waits for the release. */
  let held: MouseEvent | null = null;

  /**
   * A right-button drag pans, so a right press must not open the browser's menu: on macOS and Linux
   * it opens on the press and would swallow the drag. `contextMenu` is raised on the release instead,
   * and only if the press didn't pan. Windows sends `contextmenu` after the release. Menus opened from
   * the keyboard, or with Ctrl + click on macOS, are untouched.
   */
  const onContextMenu = (e: MouseEvent) => {
    const vc = diagram.viewportController;
    if (e.button === 2 && vc?.rightDragPans()) {
      e.preventDefault();
      if (e.buttons & 2) {
        held = e;
        return;
      }
      if (vc.rightPanned) return;
    }
    emitContextMenu(e);
  };

  const onUp = (e: PointerEvent) => {
    const menu = held;
    held = null;
    if (!menu || e.type === 'pointercancel') return;
    if (!diagram.viewportController?.rightPanned) emitContextMenu(menu);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const item = itemAt(e.target);
    const key = item ? `${item.kind}\u0000${item.id}` : null;
    if (key === hovered) return;
    hovered = key;
    diagram.emit('hover', { item, point: local(e) });
  };

  const onLeave = (e: PointerEvent) => {
    if (hovered === null) return;
    hovered = null;
    diagram.emit('hover', { item: null, point: local(e) });
  };

  const listeners: [string, EventListener][] = [
    ['click', onClick as EventListener],
    ['dblclick', onDblClick as EventListener],
    ['contextmenu', onContextMenu as EventListener],
    ['pointermove', onMove as EventListener],
    ['pointerleave', onLeave as EventListener],
    ['pointerup', onUp as EventListener],
    ['pointercancel', onUp as EventListener],
  ];
  for (const [t, fn] of listeners) root.addEventListener(t, fn);
  return () => {
    for (const [t, fn] of listeners) root.removeEventListener(t, fn);
  };
}
