/**
 * Edit-mode input (FR-24..29): turns pointer, keyboard and drag-and-drop input into EditorCommands, and
 * draws editor adornments (handles, guides, marquee, port highlights, connection preview) into
 * its own `<g class="pv-editor">` inside `layers.interaction` (other layers, like the focus ring, share it).
 * The selection highlight itself belongs to the renderer.
 */
import type { Diagram } from '../diagram/diagram';
import { nodeBounds, portPoint } from '../diagram/geometry';
import type { ItemRef } from '../diagram/types';
import type { LinkEnd, Point, Rect } from '../model/types';
import { DRAG_THRESHOLD } from '../viewport/controller';
import { type Clipboard, EditorCommands, type EditorGeometry } from './commands';
import type { Guide } from './guides';
import { actionForKey, isEditableTarget } from './keymap';
import { moveSegment, removeBend, splitSegment } from './waypoints';

/** DataTransfer type a palette sets to the symbol type when dragging onto the canvas. */
export const SYMBOL_MIME = 'application/x-pipeline-view-symbol';

export interface EditorControllerOptions {
  /** Rendered polyline of a link (ports included). Without it, only manual links get segment handles. */
  getLinkPath?: (linkId: string) => Point[] | undefined;
  /** Alignment guide snap distance in screen pixels. 0 disables guides. Default 6. */
  guideThreshold?: number;
  /** Screen-pixel radius within which a connection snaps onto a compatible port. Default 16. */
  portSnapRadius?: number;
  /**
   * Kind of links created by dragging port to port ('process', 'signal', 'pneumatic', 'electrical' or any
   * custom kind). When the start port doesn't accept it, the port's first accepted kind is used.
   * Default 'process'. Change it at runtime with `setLinkKind`.
   */
  linkKind?: string;
}

type Gesture =
  | { type: 'move'; start: Point; lead: string; started: boolean; guides: Guide[] }
  | { type: 'marquee'; start: Point; current: Point; additive: boolean; base: ItemRef[] }
  | {
      type: 'connect';
      layer?: SVGGElement;
      layerZoom?: number;
      hot?: SVGElement | null;
      from: LinkEnd;
      origin: Point;
      kind: string;
      targets: (LinkEnd & { point: Point })[];
      current: Point;
    }
  | {
      type: 'segment';
      linkId: string;
      path: Point[];
      index: number;
      start: Point;
      started: boolean;
    };

const SVG_NS = 'http://www.w3.org/2000/svg';

export class EditorController {
  readonly commands: EditorCommands;
  private gesture: Gesture | null = null;
  private clipboard: Clipboard | null = null;
  private labelInput: HTMLInputElement | null = null;
  /** Editor adornments, kept apart from other content of the interaction layer. */
  private readonly layer: SVGGElement;
  private linkKind: string;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    readonly diagram: Diagram,
    private readonly opts: EditorControllerOptions = {},
  ) {
    const view = diagram.view;
    if (!view) throw new Error('EditorController needs a mounted diagram');
    const geometry: EditorGeometry = {
      bounds: (n) => nodeBounds(n, diagram.symbols.get(n.type)),
      port: (n, id) => portPoint(n, diagram.symbols.get(n.type), id),
    };
    this.commands = new EditorCommands(diagram, geometry);
    this.linkKind = opts.linkKind ?? 'process';
    controllers.set(diagram, this);
    const root = view.root;
    this.layer = root.ownerDocument.createElementNS(SVG_NS, 'g');
    this.layer.setAttribute('class', 'pv-editor');
    view.layers.interaction.append(this.layer);
    this.listen(root, 'pointerdown', this.onDown as EventListener);
    this.listen(root, 'pointermove', this.onMove as EventListener);
    this.listen(root, 'pointerup', this.onUp as EventListener);
    this.listen(root, 'pointercancel', this.onCancel as EventListener);
    this.listen(root, 'dblclick', this.onDoubleClick as EventListener);
    this.listen(root, 'keydown', this.onKey as EventListener);
    this.listen(root, 'dragover', this.onDragOver as EventListener);
    this.listen(root, 'drop', this.onDrop as EventListener);
    this.cleanup.push(
      diagram.on('selectionChange', () => this.redraw()),
      diagram.internal.on('model', () => this.redraw()),
      diagram.internal.on('load', () => this.redraw()),
      diagram.internal.on('viewport', () => {
        this.placeLabelEditor();
        this.redraw();
      }),
    );
    root.classList.add('pv-editing');
    this.redraw();
  }

  destroy(): void {
    if (controllers.get(this.diagram) === this) controllers.delete(this.diagram);
    this.cancelGesture();
    this.closeLabelEditor(false);
    for (const c of this.cleanup) c();
    this.cleanup.length = 0;
    this.diagram.view?.root.classList.remove('pv-editing');
    this.layer.remove();
  }

  /** Kind used for new connections (see `EditorControllerOptions.linkKind`). */
  getLinkKind(): string {
    return this.linkKind;
  }

  setLinkKind(kind: string): void {
    this.linkKind = kind;
  }

  /** Adds a symbol at a screen position (client coordinates), e.g. from a touch palette. */
  dropSymbol(type: string, clientX: number, clientY: number): string | null {
    return this.commands.drop(type, this.toDiagram({ clientX, clientY }));
  }

  // ------------------------------------------------------------------ helpers

  private listen(t: EventTarget, type: string, fn: EventListener): void {
    t.addEventListener(type, fn);
    this.cleanup.push(() => t.removeEventListener(type, fn));
  }

  private get root(): HTMLElement {
    return this.diagram.view!.root;
  }

  private get zoom(): number {
    return this.diagram.getViewport().zoom;
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toDiagram(e: { clientX: number; clientY: number }): Point {
    return this.diagram.screenToDiagram(this.local(e));
  }

  private selectedNodes(): string[] {
    return this.diagram
      .getSelection()
      .filter((r) => r.kind === 'node')
      .map((r) => r.id);
  }

  private isSelected(ref: ItemRef): boolean {
    return this.diagram.getSelection().some((r) => r.kind === ref.kind && r.id === ref.id);
  }

  private toggle(ref: ItemRef): void {
    const sel = this.diagram.getSelection();
    this.diagram.setSelection(
      this.isSelected(ref)
        ? sel.filter((r) => !(r.kind === ref.kind && r.id === ref.id))
        : [...sel, ref],
    );
  }

  /** Full polyline of a link: the renderer's route, or ports + manual waypoints. */
  linkPath(linkId: string): Point[] | undefined {
    const fromRenderer =
      this.opts.getLinkPath?.(linkId) ??
      (this.diagram as { getLinkPath?: (id: string) => Point[] | undefined }).getLinkPath?.(linkId);
    if (fromRenderer) return fromRenderer;
    const l = this.diagram.store.links.get(linkId);
    if (!l || l.routing !== 'manual') return undefined;
    const end = (e: LinkEnd) => {
      const n = this.diagram.store.nodes.get(e.node);
      return n && portPoint(n, this.diagram.symbols.get(n.type), e.port)?.point;
    };
    const a = end(l.from);
    const b = end(l.to);
    return a && b ? [a, ...(l.waypoints ?? []), b] : undefined;
  }

  private portLocation(end: LinkEnd): Point | undefined {
    const n = this.diagram.store.nodes.get(end.node);
    return n && portPoint(n, this.diagram.symbols.get(n.type), end.port)?.point;
  }

  // ------------------------------------------------------------------ pointer

  private onDown = (e: PointerEvent): void => {
    if (this.diagram.getMode() !== 'edit' || e.button !== 0) return;
    if (this.root.classList.contains('pv-pan-ready') || this.gesture) return;
    if (this.labelInput && e.target === this.labelInput) return;
    this.closeLabelEditor(true);
    const p = this.toDiagram(e);
    const target = e.target as Element | null;
    const handle = target?.closest?.<SVGElement>('[data-pv-handle]');
    const shift = e.shiftKey;

    if (handle) {
      const kind = handle.dataset.pvHandle;
      if (kind === 'rotate') this.commands.rotate();
      else if (kind === 'segment') {
        const linkId = handle.dataset.link!;
        const path = this.linkPath(linkId);
        if (path)
          this.gesture = {
            type: 'segment',
            linkId,
            path,
            index: Number(handle.dataset.index),
            start: p,
            started: false,
          };
      }
      this.capture(e);
      return;
    }

    const hit = this.diagram.hitTest(target);
    if (!hit) {
      if (e.pointerType === 'touch') return; // touch on the background pans (viewport controller)
      this.gesture = {
        type: 'marquee',
        start: p,
        current: p,
        additive: shift,
        base: shift ? this.diagram.getSelection() : [],
      };
    } else if (hit.kind === 'port') {
      const from = { node: hit.node, port: hit.port };
      const node = this.diagram.store.nodes.get(hit.node);
      const def = node && this.diagram.symbols.get(node.type)?.ports.find((q) => q.id === hit.port);
      const accepts = def?.accepts;
      const kind = !accepts || accepts.includes(this.linkKind) ? this.linkKind : accepts[0]!;
      const origin = this.portLocation(from) ?? p;
      const targets = this.commands
        .compatiblePorts(from, kind)
        .map((t) => ({ ...t, point: this.portLocation(t)! }))
        .filter((t) => t.point);
      this.gesture = { type: 'connect', from, origin, kind, targets, current: p };
    } else if (hit.kind === 'node') {
      if (shift) this.toggle(hit);
      else {
        if (!this.isSelected(hit)) this.diagram.setSelection([hit]);
        this.gesture = { type: 'move', start: p, lead: hit.id, started: false, guides: [] };
      }
    } else if (shift) this.toggle(hit);
    else this.diagram.setSelection([hit]);
    this.capture(e);
    this.redraw();
  };

  private capture(e: PointerEvent): void {
    e.preventDefault();
    this.root.focus({ preventScroll: true });
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
  }

  private onMove = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g) return;
    const p = this.toDiagram(e);
    const far = (start: Point) =>
      Math.hypot(p.x - start.x, p.y - start.y) * this.zoom >= DRAG_THRESHOLD;
    switch (g.type) {
      case 'move': {
        if (!g.started) {
          if (!far(g.start)) return;
          this.commands.beginMove(this.selectedNodes(), g.lead);
          g.started = true;
        }
        g.guides = this.commands.dragMove(
          { x: p.x - g.start.x, y: p.y - g.start.y },
          { guideThreshold: (this.opts.guideThreshold ?? 6) / this.zoom },
        );
        break;
      }
      case 'marquee':
        g.current = p;
        break;
      case 'connect':
        g.current = p;
        break;
      case 'segment':
        if (!g.started && !far(g.start)) return;
        g.started = true;
        this.commands.previewLinkPath(
          g.linkId,
          moveSegment(g.path, g.index, { x: p.x - g.start.x, y: p.y - g.start.y }),
        );
        break;
    }
    this.redraw();
  };

  private onUp = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    const p = this.toDiagram(e);
    switch (g.type) {
      case 'move':
        if (g.started) {
          this.commands.endMove();
          this.suppressClick();
        }
        break;
      case 'marquee': {
        const r = rectOf(g.start, p);
        if (r.width * this.zoom < DRAG_THRESHOLD && r.height * this.zoom < DRAG_THRESHOLD) {
          if (!g.additive) this.diagram.setSelection([]);
          break;
        }
        const ids = this.commands.nodesInRect(r).map((id) => ({ kind: 'node', id }) as const);
        this.diagram.setSelection([...g.base, ...ids]);
        this.suppressClick();
        break;
      }
      case 'connect': {
        const target = this.connectTarget(g, p);
        if (target) this.commands.connect(g.from, target, g.kind);
        break;
      }
      case 'segment':
        if (g.started) {
          this.commands.commitLinkPath();
          this.suppressClick();
        }
        break;
    }
    this.redraw();
  };

  /** The click that ends an editor drag must not reach the public click events. */
  private suppressClick(): void {
    this.diagram.suppressNextClick();
  }

  private onCancel = (): void => {
    this.cancelGesture();
    this.redraw();
  };

  private cancelGesture(): void {
    const g = this.gesture;
    this.gesture = null;
    if (g?.type === 'move' && g.started) this.commands.cancelMove();
    if (g?.type === 'segment' && g.started) this.commands.cancelLinkPath();
  }

  /** The compatible port under the pointer, or the nearest one within the snap radius. */
  private connectTarget(g: Extract<Gesture, { type: 'connect' }>, p: Point): LinkEnd | null {
    const radius = (this.opts.portSnapRadius ?? 16) / this.zoom;
    let best: LinkEnd | null = null;
    let bestD = radius;
    for (const t of g.targets) {
      const d = Math.hypot(t.point.x - p.x, t.point.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = { node: t.node, port: t.port };
      }
    }
    return best;
  }

  private onDoubleClick = (e: MouseEvent): void => {
    if (this.diagram.getMode() !== 'edit') return;
    const target = e.target as Element | null;
    const handle = target?.closest?.<SVGElement>('[data-pv-handle]');
    if (handle) {
      const linkId = handle.dataset.link!;
      const path = this.linkPath(linkId);
      const index = Number(handle.dataset.index);
      if (!path) return;
      if (handle.dataset.pvHandle === 'bend')
        this.commands.setLinkPath(linkId, removeBend(path, index));
      else if (handle.dataset.pvHandle === 'segment') {
        // Add a bend: split at the pointer and jog the second half by one grid step.
        const step = this.diagram.options.grid?.size ?? 10;
        const split = splitSegment(path, index, this.toDiagram(e));
        this.commands.setLinkPath(
          linkId,
          moveSegment(split.path, split.second, { x: step, y: step }),
        );
      }
      return;
    }
    const hit = this.diagram.hitTest(target);
    if (hit?.kind === 'node') this.openLabelEditor(hit.id);
  };

  // ------------------------------------------------------------------ keyboard

  private onKey = (e: KeyboardEvent): void => {
    if (this.diagram.getMode() !== 'edit' || isEditableTarget(e.target)) return;
    const action = actionForKey(e);
    if (!action) return;
    const c = this.commands;
    const nudge = e.shiftKey ? (this.diagram.options.grid?.size ?? 10) : 1;
    switch (action) {
      case 'undo':
        this.cancelGesture();
        this.diagram.undo();
        break;
      case 'redo':
        this.cancelGesture();
        this.diagram.redo();
        break;
      case 'delete':
        c.deleteItems();
        break;
      case 'copy':
        this.clipboard = c.copy();
        break;
      case 'cut':
        this.clipboard = c.cut();
        break;
      case 'paste':
        if (this.clipboard) c.paste(this.clipboard);
        break;
      case 'duplicate':
        c.duplicate();
        break;
      case 'selectAll':
        c.selectAll();
        break;
      case 'rotate':
        c.rotate();
        break;
      case 'rotateBack':
        c.rotate(undefined, -90);
        break;
      case 'flipX':
        c.flip(undefined, 'x');
        break;
      case 'flipY':
        c.flip(undefined, 'y');
        break;
      case 'cancel':
        if (this.gesture) this.cancelGesture();
        else this.diagram.setSelection([]);
        break;
      case 'editLabel': {
        const [only, ...rest] = this.selectedNodes();
        if (!only || rest.length) return;
        this.openLabelEditor(only);
        break;
      }
      case 'nudgeLeft':
        c.moveBy(this.selectedNodes(), { x: -nudge, y: 0 });
        break;
      case 'nudgeRight':
        c.moveBy(this.selectedNodes(), { x: nudge, y: 0 });
        break;
      case 'nudgeUp':
        c.moveBy(this.selectedNodes(), { x: 0, y: -nudge });
        break;
      case 'nudgeDown':
        c.moveBy(this.selectedNodes(), { x: 0, y: nudge });
        break;
    }
    e.preventDefault();
    this.redraw();
  };

  // ------------------------------------------------------------------ palette drop

  private onDragOver = (e: DragEvent): void => {
    if (this.diagram.getMode() === 'edit' && e.dataTransfer?.types.includes(SYMBOL_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  private onDrop = (e: DragEvent): void => {
    const type = e.dataTransfer?.getData(SYMBOL_MIME);
    if (this.diagram.getMode() !== 'edit' || !type) return;
    e.preventDefault();
    this.dropSymbol(type, e.clientX, e.clientY);
    this.root.focus({ preventScroll: true });
  };

  // ------------------------------------------------------------------ label editor

  /** Opens an inline text input over the node's label position. Enter or blur commits, Escape cancels. */
  openLabelEditor(nodeId: string): void {
    const node = this.diagram.store.nodes.get(nodeId);
    if (!node) return;
    this.closeLabelEditor(true);
    const input = this.root.ownerDocument.createElement('input');
    input.className = 'pv-label-editor';
    input.value = node.label ?? '';
    input.dataset.nodeId = nodeId;
    input.setAttribute('aria-label', 'Label');
    input.style.cssText = 'position:absolute;transform:translateX(-50%);z-index:2';
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') this.closeLabelEditor(true);
      else if (ev.key === 'Escape') this.closeLabelEditor(false);
    });
    input.addEventListener('blur', () => this.closeLabelEditor(true));
    this.labelInput = input;
    this.placeLabelEditor();
    this.root.append(input);
    input.focus();
    input.select();
  }

  /** Keeps the label input under its node while the view pans or zooms. */
  private placeLabelEditor(): void {
    const input = this.labelInput;
    const node = input && this.diagram.store.nodes.get(input.dataset.nodeId!);
    if (!input || !node) return;
    const b = nodeBounds(node, this.diagram.symbols.get(node.type));
    const at = this.diagram.diagramToScreen({ x: b.x + b.width / 2, y: b.y + b.height });
    input.style.left = `${at.x}px`;
    input.style.top = `${at.y + 4}px`;
  }

  private closeLabelEditor(commit: boolean): void {
    const input = this.labelInput;
    if (!input) return;
    this.labelInput = null;
    if (commit) this.commands.setLabel(input.dataset.nodeId!, input.value);
    input.remove();
    this.root.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ adornments

  /** Redraws handles and gesture feedback. Sizes are divided by zoom so they stay constant on screen. */
  redraw(): void {
    const layer = this.layer;
    if (!layer.parentNode) return; // destroyed
    const s = 1 / this.zoom;
    const doc = layer.ownerDocument;
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const e = doc.createElementNS(SVG_NS, tag);
      for (const k in attrs) e.setAttribute(k, String(attrs[k]));
      return e;
    };
    const out: Element[] = [];
    const sel = this.diagram.getSelection();
    const g = this.gesture;

    if (sel.length === 1 && sel[0]!.kind === 'node' && g?.type !== 'move') {
      const n = this.diagram.store.nodes.get(sel[0]!.id);
      if (n) {
        const b = nodeBounds(n, this.diagram.symbols.get(n.type));
        const cx = b.x + b.width / 2;
        out.push(
          el('line', {
            class: 'pv-rotate-stem',
            x1: cx,
            y1: b.y,
            x2: cx,
            y2: b.y - 18 * s,
            'stroke-width': s,
          }),
          el('circle', {
            class: 'pv-rotate-handle',
            'data-pv-handle': 'rotate',
            cx,
            cy: b.y - 18 * s,
            r: 5 * s,
            'stroke-width': s,
          }),
        );
      }
    }

    if (sel.length === 1 && sel[0]!.kind === 'link') {
      const id = sel[0]!.id;
      const path = this.linkPath(id);
      if (path) {
        for (let k = 0; k + 1 < path.length; k++) {
          const a = path[k]!;
          const b = path[k + 1]!;
          if (a.x === b.x && a.y === b.y) continue;
          const horizontal = a.y === b.y;
          const w = (horizontal ? 14 : 6) * s;
          const h = (horizontal ? 6 : 14) * s;
          out.push(
            el('rect', {
              class: `pv-segment-handle ${horizontal ? 'pv-h' : 'pv-v'}`,
              'data-pv-handle': 'segment',
              'data-link': id,
              'data-index': k,
              x: (a.x + b.x) / 2 - w / 2,
              y: (a.y + b.y) / 2 - h / 2,
              width: w,
              height: h,
              rx: 2 * s,
              'stroke-width': s,
            }),
          );
        }
        for (let i = 1; i + 1 < path.length; i++) {
          out.push(
            el('circle', {
              class: 'pv-bend-handle',
              'data-pv-handle': 'bend',
              'data-link': id,
              'data-index': i,
              cx: path[i]!.x,
              cy: path[i]!.y,
              r: 3.5 * s,
              'stroke-width': s,
            }),
          );
        }
      }
    }

    if (g?.type === 'move') {
      for (const gd of g.guides) {
        out.push(
          gd.orientation === 'vertical'
            ? el('line', {
                class: 'pv-guide',
                x1: gd.pos,
                y1: gd.from,
                x2: gd.pos,
                y2: gd.to,
                'stroke-width': s,
              })
            : el('line', {
                class: 'pv-guide',
                x1: gd.from,
                y1: gd.pos,
                x2: gd.to,
                y2: gd.pos,
                'stroke-width': s,
              }),
        );
      }
    } else if (g?.type === 'marquee') {
      const r = rectOf(g.start, g.current);
      out.push(el('rect', { class: 'pv-marquee', ...r, 'stroke-width': s }));
    } else if (g?.type === 'connect') {
      // Target circles are built once per gesture (and per zoom); a pointer move only moves the hot flag.
      if (!g.layer || g.layerZoom !== s) {
        g.layer = el('g', { class: 'pv-port-targets' }) as SVGGElement;
        g.layerZoom = s;
        g.hot = null;
        for (const t of g.targets) {
          g.layer.append(
            el('circle', {
              class: 'pv-port-target',
              'data-target-node': t.node,
              'data-target-port': t.port,
              cx: t.point.x,
              cy: t.point.y,
              r: 5 * s,
              'stroke-width': s,
            }),
          );
        }
      }
      const target = this.connectTarget(g, g.current);
      const idx = target
        ? g.targets.findIndex((t) => t.node === target.node && t.port === target.port)
        : -1;
      const hotEl = idx >= 0 ? (g.layer.children[idx] as SVGElement) : null;
      if (hotEl !== g.hot) {
        g.hot?.classList.remove('pv-hot');
        g.hot?.setAttribute('r', String(5 * s));
        hotEl?.classList.add('pv-hot');
        hotEl?.setAttribute('r', String(7 * s));
        g.hot = hotEl;
      }
      out.push(g.layer);
      out.push(
        el('path', {
          class: 'pv-connect-preview',
          d: `M${g.origin.x},${g.origin.y} H${g.current.x} V${g.current.y}`,
          'stroke-width': 1.5 * s,
        }),
      );
    }
    layer.replaceChildren(...out);
  }
}

function rectOf(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

const controllers = new WeakMap<Diagram, EditorController>();

/** The EditorController currently attached to `diagram`, if any (e.g. to call `setLinkKind` from a toolbar). */
export function getEditor(diagram: Diagram): EditorController | undefined {
  return controllers.get(diagram);
}

/**
 * Attaches an EditorController whenever the diagram is mounted and in edit mode, and detaches it in view mode.
 * Returns a function that stops this and detaches the controller.
 */
export function attachEditor(diagram: Diagram, opts?: EditorControllerOptions): () => void {
  let ctl: EditorController | null = null;
  const sync = () => {
    const want = diagram.getMode() === 'edit' && !!diagram.view;
    if (want && !ctl) ctl = new EditorController(diagram, opts);
    else if (!want && ctl) {
      ctl.destroy();
      ctl = null;
    }
  };
  const offs = [diagram.internal.on('mode', sync), diagram.internal.on('mount', sync)];
  sync();
  return () => {
    for (const off of offs) off();
    ctl?.destroy();
    ctl = null;
  };
}
