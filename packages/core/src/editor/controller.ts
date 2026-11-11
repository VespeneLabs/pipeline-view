/**
 * Edit-mode input (FR-24..29): turns pointer, keyboard and drag-and-drop input into EditorCommands, and
 * draws editor adornments (handles, guides, marquee, port highlights, connection preview) into
 * its own `<g class="pv-editor">` inside `layers.interaction` (other layers, like the focus ring, share it).
 * The selection highlight itself belongs to the renderer.
 */
import type { Diagram } from '../diagram/diagram';
import { findPort } from '../symbols/resolve';
import { portLinkCounts, refusal } from '../diagram/validate';
import type { DropCheck } from './commands';
import { nodePorts, nodeSize, previewNode } from '../symbols/resolve';
import { nodeBounds, portPoint } from '../diagram/geometry';
import { attachCycle, fractionAlong, pointAlong } from '../diagram/attach';
import type { AttachProposal, DropSource, ItemRef } from '../diagram/types';
import type { LinkEnd, NodeModel, Point, Rect } from '../model/types';
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

interface RefusedPort extends LinkEnd {
  point: Point;
  code: string;
  reason: string;
  detail?: Record<string, unknown>;
  /** The refusal's ends in flow order, and as dragged when different. */
  ends?: { from?: LinkEnd; to?: LinkEnd; dragFrom?: LinkEnd; dragTo?: LinkEnd };
}

/** Where a connect drag ended: a port that accepts the link, or one that refuses it (FR-42). */
type ConnectDrop =
  | { ok: true; end: LinkEnd; attach?: AttachDrop }
  | {
      ok: false;
      end: LinkEnd;
      attach?: AttachDrop;
      code: string;
      reason: string;
      detail?: Record<string, unknown>;
      ends?: RefusedPort['ends'];
    };

/** A connect drag that ended on a link (`DiagramOptions.linkAttach`): the link to create and where it lands. */
interface AttachDrop {
  proposal: AttachProposal;
  point: Point;
}

/** A target of the keyboard connect flow: a port, or a link to attach to. */
type KbTarget = LinkEnd | LinkTarget;
interface LinkTarget {
  link: string;
  proposal: AttachProposal;
}
const onLink = (t: KbTarget): t is LinkTarget => 'link' in t;

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
      /** Ports that would refuse this link, with the reason (FR-42). */
      refused: RefusedPort[];
      /** Renderer port elements marked with data-refused for this gesture. */
      marked: Element[];
      current: Point;
    }
  | {
      type: 'segment';
      linkId: string;
      path: Point[];
      index: number;
      start: Point;
      started: boolean;
    }
  | {
      /** Dragging an attached end along its host link. */
      type: 'attach';
      linkId: string;
      end: 'from' | 'to';
      host: Point[];
      start: Point;
      started: boolean;
    };

const SVG_NS = 'http://www.w3.org/2000/svg';

export class EditorController {
  readonly commands: EditorCommands;
  private gesture: Gesture | null = null;
  private clipboard: Clipboard | null = null;
  private labelInput: HTMLInputElement | null = null;
  /**
   * Keyboard connect (FR-54): choosing the source port on a node, then a compatible target port.
   * `index` points into `ports` (source phase) or `targets` (target phase).
   */
  private kb: {
    phase: 'source' | 'target';
    node: string;
    ports: LinkEnd[];
    targets: KbTarget[];
    from?: LinkEnd;
    kind: string;
    index: number;
  } | null = null;
  /** Placement mode (FR-50): the symbol being placed, its init and where its centre is now. */
  private placement: {
    type: string;
    init: Partial<NodeModel>;
    at: Point;
    check: DropCheck;
    touch: boolean;
  } | null = null;
  /** Pointer to capture once the press turns into a drag (screen point of the press). */
  private pending: { pointerId: number; at: Point } | null = null;
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
      diagram.internal.on('load', () => {
        this.cancelKeyboardConnect();
        this.redraw();
      }),
      diagram.internal.on('model', () => {
        // The node being connected from went away (deleted, undone): end the flow.
        if (this.kb && !diagram.store.nodes.has(this.kb.node)) this.cancelKeyboardConnect();
      }),
      diagram.internal.on('placement', ({ type, init }) => this.startPlacement(type, init)),
      diagram.internal.on('viewport', () => {
        this.placeLabelEditor();
        this.redraw();
      }),
    );
    this.cleanup.push(diagram.on('connectRejected', ({ reason }) => this.announce(reason)));
    root.classList.add('pv-editing');
    this.redraw();
  }

  destroy(): void {
    if (controllers.get(this.diagram) === this) controllers.delete(this.diagram);
    this.placement = null;
    this.kb = null;
    this.root.classList.remove('pv-placing');
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
    if (this.placement) {
      e.preventDefault();
      e.stopPropagation();
      this.movePlacement(this.toDiagram(e));
      // Mouse and pen place on press; touch places where the finger lifts.
      if (e.pointerType === 'touch') this.placement.touch = true;
      else this.finishPlacement();
      return;
    }
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
      } else if (kind === 'attach') {
        const linkId = handle.dataset.link!;
        const end = handle.dataset.end as 'from' | 'to';
        const l = this.diagram.store.links.get(linkId);
        const host = this.linkPath((end === 'from' ? l?.fromAttach : l?.toAttach)?.link ?? '');
        if (host) this.gesture = { type: 'attach', linkId, end, host, start: p, started: false };
      }
      this.prepare(e);
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
      const def = node && findPort(this.diagram.symbols.get(node.type), node, hit.port);
      const accepts = def?.accepts;
      const kind = !accepts || accepts.includes(this.linkKind) ? this.linkKind : accepts[0]!;
      const origin = this.portLocation(from) ?? p;
      const targets: (LinkEnd & { point: Point })[] = [];
      const refused: RefusedPort[] = [];
      for (const { to, check } of this.commands.portChecks(from, kind)) {
        const point = this.portLocation(to);
        if (!point) continue;
        if (check.ok) targets.push({ ...to, point });
        else
          refused.push({
            ...to,
            point,
            code: check.code,
            reason: check.reason,
            detail: check.detail,
            ends: {
              from: check.from,
              to: check.to,
              dragFrom: check.dragFrom,
              dragTo: check.dragTo,
            },
          });
      }
      const marked = this.markRefused(refused);
      this.gesture = { type: 'connect', from, origin, kind, targets, refused, marked, current: p };
    } else if (hit.kind === 'node') {
      if (shift) this.toggle(hit);
      else {
        if (!this.isSelected(hit)) this.diagram.setSelection([hit]);
        this.gesture = { type: 'move', start: p, lead: hit.id, started: false, guides: [] };
      }
    } else if (shift) this.toggle(hit);
    else this.diagram.setSelection([hit]);
    this.prepare(e);
    this.redraw();
  };

  /**
   * Pointer capture is taken lazily, once the press moves past the drag threshold. Capturing on
   * pointerdown would retarget the following click to the root, and plain clicks must still reach
   * the item (nodeClick, linkClick).
   */
  private prepare(e: PointerEvent): void {
    e.preventDefault();
    this.root.focus({ preventScroll: true });
    this.pending = { pointerId: e.pointerId, at: this.local(e) };
  }

  private captureIfDragging(e: PointerEvent): void {
    const pending = this.pending;
    if (!pending || pending.pointerId !== e.pointerId) return;
    const at = this.local(e);
    if (Math.hypot(at.x - pending.at.x, at.y - pending.at.y) < DRAG_THRESHOLD) return;
    this.pending = null;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
  }

  private onMove = (e: PointerEvent): void => {
    if (this.placement) {
      this.movePlacement(this.toDiagram(e));
      return;
    }
    const g = this.gesture;
    if (!g) return;
    this.captureIfDragging(e);
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
      case 'attach':
        if (!g.started && !far(g.start)) return;
        g.started = true;
        this.commands.previewAttach(g.linkId, g.end, fractionAlong(g.host, p));
        break;
    }
    this.redraw();
  };

  private onUp = (e: PointerEvent): void => {
    if (this.placement?.touch) {
      this.movePlacement(this.toDiagram(e));
      this.placement.touch = false;
      this.finishPlacement();
      return;
    }
    const g = this.gesture;
    this.pending = null;
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
        this.unmarkRefused(g.marked);
        const drop = this.connectTarget(g, p) ?? this.nodeDrop(g, p) ?? this.linkDrop(g, p);
        // A drop on empty canvas is a cancel. A drop on a port, node or link either connects or is refused.
        if (!drop) break;
        if (drop.ok) {
          if (drop.attach) this.commands.tryAttach(drop.attach.proposal);
          else this.commands.tryConnect(g.from, drop.end, g.kind);
        } else {
          // Flow order (outlet → inlet), with the drag order alongside when it differs.
          const e = drop.ends;
          this.diagram.emit('connectRejected', {
            from: e?.from ?? g.from,
            to: e?.to ?? drop.end,
            ...(e?.dragFrom ? { dragFrom: e.dragFrom, dragTo: e.dragTo } : {}),
            kind: g.kind,
            code: drop.code,
            reason: drop.reason,
            ...(drop.detail ? { detail: drop.detail } : {}),
            point: p,
          });
        }
        this.suppressClick();
        break;
      }
      case 'segment':
        if (g.started) {
          this.commands.commitLinkPath();
          this.suppressClick();
        }
        break;
      case 'attach':
        if (g.started) {
          this.commands.commitLinkPath();
          this.suppressClick();
          this.announceAttach(g.linkId, g.end);
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
    if ((g?.type === 'segment' || g?.type === 'attach') && g.started)
      this.commands.cancelLinkPath();
    if (g?.type === 'connect') this.unmarkRefused(g.marked);
  }

  /** Marks the renderer's port circles that would refuse the link, with the reason for a tooltip (FR-42). */
  private markRefused(refused: RefusedPort[]): Element[] {
    const marked: Element[] = [];
    const nodes = this.diagram.view?.layers.nodes;
    if (!nodes) return marked;
    for (const r of refused) {
      const nodeEl = [...nodes.children].find((c) => (c as SVGElement).dataset.nodeId === r.node);
      const portEl = nodeEl
        ? [...nodeEl.querySelectorAll('.pv-port')].find(
            (c) => (c as SVGElement).dataset.portId === r.port,
          )
        : undefined;
      if (!portEl) continue;
      portEl.setAttribute('data-refused', r.code);
      portEl.setAttribute('data-refused-reason', r.reason);
      const title = portEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.setAttribute('class', 'pv-refused-title');
      title.textContent = r.reason;
      portEl.append(title);
      marked.push(portEl);
    }
    return marked;
  }

  private unmarkRefused(marked: Element[]): void {
    for (const el of marked) {
      el.removeAttribute('data-refused');
      el.removeAttribute('data-refused-reason');
      el.querySelector(':scope > .pv-refused-title')?.remove();
    }
    marked.length = 0;
  }

  /**
   * The port nearest the pointer within the snap radius, whether it accepts the link or refuses it.
   * On a tie, an accepting port wins.
   */
  private connectTarget(g: Extract<Gesture, { type: 'connect' }>, p: Point): ConnectDrop | null {
    const radius = (this.opts.portSnapRadius ?? 16) / this.zoom;
    return nearestDrop(g, p, radius, () => true);
  }

  /**
   * A drop on a node's body: its nearest accepting port, else its nearest refusing one. A node without
   * any candidate port refuses with 'missing-port'; dropping back on the starting node is a cancel.
   */
  private nodeDrop(g: Extract<Gesture, { type: 'connect' }>, p: Point): ConnectDrop | null {
    let hit: string | null = null;
    for (const n of this.diagram.store.nodes.values()) {
      const b = nodeBounds(n, this.diagram.symbols.get(n.type));
      if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height) hit = n.id;
    }
    // Releasing over the starting node's own body is a cancel, not a self-link; a deliberate self-link
    // still works by dropping onto one of its ports (snap radius).
    if (!hit || hit === g.from.node) return null;
    const onNode = (e: LinkEnd) => e.node === hit;
    const drop = nearestDrop(g, p, Infinity, onNode);
    if (drop) return drop;
    const r = refusal(this.diagram, 'missing-port', {
      from: g.from,
      to: { node: hit, port: '' },
      kind: g.kind,
      detail: { node: hit },
    });
    return { ...r, end: { node: hit, port: '' } };
  }

  /**
   * A drop on a link (`DiagramOptions.linkAttach`): the link nearest the pointer within half the port
   * snap radius, as a new link whose end is attached there. Links on the starting port are skipped.
   */
  private linkDrop(g: Extract<Gesture, { type: 'connect' }>, p: Point): ConnectDrop | null {
    if (!this.diagram.options.linkAttach) return null;
    const radius = (this.opts.portSnapRadius ?? 16) / 2 / this.zoom;
    let best: { id: string; at: number; d: number } | null = null;
    for (const l of this.diagram.store.links.values()) {
      const path = this.linkPath(l.id);
      if (!path || path.length < 2) continue;
      const at = fractionAlong(path, p);
      const on = pointAlong(path, at)!.point;
      const d = Math.hypot(on.x - p.x, on.y - p.y);
      if (d <= radius && (!best || d < best.d)) best = { id: l.id, at, d };
    }
    if (!best) return null;
    return this.attachDrop(g.from, best.id, best.at, g.kind);
  }

  /** The outcome of attaching a connection from `from` to link `linkId` at `at`, as a drop. */
  private attachDrop(from: LinkEnd, linkId: string, at: number, kind: string): ConnectDrop | null {
    const r = this.commands.attachCheck(from, linkId, at, kind);
    const path = r && this.linkPath(linkId);
    if (!r || !path) return null;
    const used = (r.proposal.toAttach ?? r.proposal.fromAttach)!;
    const attach = { proposal: r.proposal, point: pointAlong(path, used.at)!.point };
    const end = r.proposal.toAttach ? r.proposal.to : r.proposal.from;
    const c = r.check;
    if (c.ok) return { ok: true, end, attach };
    return {
      ok: false,
      end,
      attach,
      code: c.code,
      reason: c.reason,
      detail: c.detail,
      ends: { from: c.from, to: c.to, dragFrom: c.dragFrom, dragTo: c.dragTo },
    };
  }

  /** The attached ends of a link that can be moved: the host link exists and the link isn't locked. */
  private attachedEnds(linkId: string): { end: 'from' | 'to'; host: string; at: number }[] {
    const l = this.diagram.store.links.get(linkId);
    if (!l || l.locked) return [];
    const out: { end: 'from' | 'to'; host: string; at: number }[] = [];
    for (const end of ['to', 'from'] as const) {
      const a = end === 'from' ? l.fromAttach : l.toAttach;
      if (
        a &&
        this.diagram.store.links.has(a.link) &&
        !attachCycle(this.diagram.store.links, l.id, a.link)
      )
        out.push({ end, host: a.link, at: a.at });
    }
    return out;
  }

  private describeLink(id: string): string {
    const l = this.diagram.store.links.get(id);
    if (!l) return `link ${id}`;
    const name = (e: LinkEnd) => this.diagram.store.nodes.get(e.node)?.label ?? e.node;
    return `link ${l.label ?? ''}${l.label ? ', ' : ''}${name(l.from)} to ${name(l.to)}`;
  }

  /** Says where an attached end now sits on its host link. */
  private announceAttach(linkId: string, end: 'from' | 'to'): void {
    const link = this.diagram.store.links.get(linkId);
    const a = end === 'from' ? link?.fromAttach : link?.toAttach;
    const host = a && this.diagram.store.links.get(a.link);
    if (!link || !a || !host) return;
    const text =
      this.diagram.options.attachMessages?.moved?.({ link, host, end, at: a.at }) ??
      `Connection point at ${Math.round(a.at * 100)}% along ${this.describeLink(host.id)}.`;
    this.announce(text);
  }

  /**
   * Arrow keys on a selected link with an attached end move that end along its host link: the end
   * steps in the arrow's direction when the host link runs that way there. True when the key was used.
   */
  private nudgeAttach(delta: Point): boolean {
    const sel = this.diagram.getSelection();
    if (sel.length !== 1 || sel[0]!.kind !== 'link') return false;
    for (const { end, host, at } of this.attachedEnds(sel[0]!.id)) {
      const path = this.linkPath(host);
      const cur = path && pointAlong(path, at);
      if (!path || !cur) continue;
      const next = fractionAlong(path, { x: cur.point.x + delta.x, y: cur.point.y + delta.y });
      const moved = pointAlong(path, next)!.point;
      if (moved.x === cur.point.x && moved.y === cur.point.y) continue;
      if (this.commands.moveAttach(sel[0]!.id, end, next)) {
        this.announceAttach(sel[0]!.id, end);
        return true;
      }
    }
    return false;
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
    if (this.placement && this.onPlacementKey(e)) {
      e.preventDefault();
      return;
    }
    if (this.kb && this.onConnectKey(e)) {
      e.preventDefault();
      this.redraw();
      return;
    }
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
      case 'connect': {
        const [only, ...rest] = this.selectedNodes();
        if (!only || rest.length) {
          this.announce('Select one node to connect from.');
          break;
        }
        this.startKeyboardConnect(only);
        break;
      }
      case 'editLabel': {
        const [only, ...rest] = this.selectedNodes();
        if (!only || rest.length) return;
        this.openLabelEditor(only);
        break;
      }
      case 'nudgeLeft':
        if (!this.nudgeAttach({ x: -nudge, y: 0 }))
          c.moveBy(this.selectedNodes(), { x: -nudge, y: 0 });
        break;
      case 'nudgeRight':
        if (!this.nudgeAttach({ x: nudge, y: 0 }))
          c.moveBy(this.selectedNodes(), { x: nudge, y: 0 });
        break;
      case 'nudgeUp':
        if (!this.nudgeAttach({ x: 0, y: -nudge }))
          c.moveBy(this.selectedNodes(), { x: 0, y: -nudge });
        break;
      case 'nudgeDown':
        if (!this.nudgeAttach({ x: 0, y: nudge }))
          c.moveBy(this.selectedNodes(), { x: 0, y: nudge });
        break;
    }
    e.preventDefault();
    this.redraw();
  };

  // ------------------------------------------------------------------ palette drop

  /** The host drop source (FR-50) whose MIME type this drag carries, if any. */
  private sourceFor(dt: DataTransfer | null): DropSource | undefined {
    if (!dt) return undefined;
    for (const s of this.diagram.dropSources) if (dt.types.includes(s.mimeType)) return s;
    return undefined;
  }

  private onDragOver = (e: DragEvent): void => {
    if (this.diagram.getMode() !== 'edit' || !e.dataTransfer) return;
    if (e.dataTransfer.types.includes(SYMBOL_MIME) || this.sourceFor(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  private onDrop = (e: DragEvent): void => {
    if (this.diagram.getMode() !== 'edit' || !e.dataTransfer) return;
    const type = e.dataTransfer.getData(SYMBOL_MIME);
    const source = type ? undefined : this.sourceFor(e.dataTransfer);
    if (!type && !source) return;
    e.preventDefault();
    if (type) this.dropSymbol(type, e.clientX, e.clientY);
    else {
      const node = source!.toNode(e.dataTransfer, this.toDiagram(e));
      if (node) this.commands.tryPlaceNode(node);
    }
    this.root.focus({ preventScroll: true });
  };

  // ------------------------------------------------------------------ keyboard connect (FR-54)

  /** Says `text` through the live region (screen readers). */
  announce(text: string): void {
    this.diagram.announce(text);
  }

  private describePort(e: LinkEnd): string {
    const n = this.diagram.store.nodes.get(e.node);
    const def = n && this.diagram.symbols.get(n.type);
    const p = n && findPort(def, n, e.port);
    const name = n?.label ?? e.node;
    return `port ${p?.label ?? e.port} of ${name}${def ? ` (${def.name})` : ''}`;
  }

  /**
   * Starts connecting from the keyboard on `nodeId`: choose a source port with the arrow keys or Tab,
   * Enter; then a compatible target port, Enter connects; Escape steps back or cancels.
   */
  startKeyboardConnect(nodeId: string): void {
    const n = this.diagram.store.nodes.get(nodeId);
    if (!n) return;
    const ports = nodePorts(this.diagram.symbols.get(n.type), n).map((p) => ({
      node: nodeId,
      port: p.id,
    }));
    if (!ports.length) {
      this.announce(`${n.label ?? nodeId} has no ports.`);
      return;
    }
    this.cancelGesture();
    this.kb = { phase: 'source', node: nodeId, ports, targets: [], kind: this.linkKind, index: 0 };
    this.announce(
      `Connect from ${n.label ?? nodeId}. Choose a port with the arrow keys, then press Enter. ${this.describePort(ports[0]!)}.`,
    );
    this.redraw();
  }

  /** Ends the keyboard connect flow, if active, and says so. */
  private cancelKeyboardConnect(): void {
    if (!this.kb) return;
    this.kb = null;
    this.announce('Connect cancelled.');
    this.redraw();
  }

  /** True while the keyboard connect flow is active. */
  isConnecting(): boolean {
    return this.kb !== null;
  }

  private onConnectKey(e: KeyboardEvent): boolean {
    const kb = this.kb!;
    const list: KbTarget[] = kb.phase === 'source' ? kb.ports : kb.targets;
    const step = (d: number) => {
      if (!list.length) return;
      kb.index = (kb.index + d + list.length) % list.length;
      const cur = list[kb.index]!;
      // A culled (off-screen) node has no visible port: show it (FR-55).
      if (!onLink(cur)) this.diagram.culling?.reveal(cur.node);
      this.announce(`${this.describeTarget(cur)}, ${kb.index + 1} of ${list.length}.`);
    };
    switch (e.key) {
      case 'Tab':
        step(e.shiftKey ? -1 : 1);
        return true;
      case 'ArrowRight':
      case 'ArrowDown':
        step(1);
        return true;
      case 'ArrowLeft':
      case 'ArrowUp':
        step(-1);
        return true;
      case 'Escape':
        if (kb.phase === 'target') {
          kb.phase = 'source';
          kb.index = Math.max(
            0,
            kb.ports.findIndex((p) => p.port === kb.from?.port),
          );
          this.announce(`Choose a port again. ${this.describePort(kb.ports[kb.index]!)}.`);
        } else {
          this.kb = null;
          this.announce('Connect cancelled.');
        }
        return true;
      case 'Enter':
        if (kb.phase === 'source') this.chooseKeyboardSource();
        else this.finishKeyboardConnect();
        return true;
      default:
        return false;
    }
  }

  private chooseKeyboardSource(): void {
    const kb = this.kb!;
    const from = kb.ports[kb.index]!;
    const n = this.diagram.store.nodes.get(from.node);
    const def = n && findPort(this.diagram.symbols.get(n.type), n, from.port);
    const accepts = def?.accepts;
    kb.kind = !accepts || accepts.includes(this.linkKind) ? this.linkKind : accepts[0]!;
    const origin = this.portLocation(from);
    // Compatible targets, nearest first.
    const ports: KbTarget[] = this.commands
      .compatiblePorts(from, kb.kind)
      .map((t) => ({ t, p: this.portLocation(t) }))
      .sort((a, b) =>
        origin && a.p && b.p
          ? Math.hypot(a.p.x - origin.x, a.p.y - origin.y) -
            Math.hypot(b.p.x - origin.x, b.p.y - origin.y)
          : 0,
      )
      .map((x) => x.t);
    kb.targets = [...ports, ...this.keyboardLinkTargets(from, kb.kind, origin)];
    if (!kb.targets.length) {
      // Say why when the source itself is the problem (a full port); otherwise nothing fits.
      const full =
        def?.maxLinks !== undefined &&
        (portLinkCounts(this.diagram).get(`${from.node}\u0000${from.port}`) ?? 0) >= def.maxLinks;
      this.announce(
        full
          ? `${this.describePort(from)} already has the maximum number of links.`
          : `No compatible ports for ${this.describePort(from)}.`,
      );
      return;
    }
    kb.from = from;
    kb.phase = 'target';
    kb.index = 0;
    const what =
      kb.targets.length === ports.length ? 'compatible ports' : 'compatible ports and links';
    this.announce(
      `${kb.targets.length} ${what}. ${this.describeTarget(kb.targets[0]!)}, 1 of ${kb.targets.length}. Press Enter to connect.`,
    );
  }

  private describeTarget(t: KbTarget): string {
    return onLink(t) ? this.describeLink(t.link) : this.describePort(t);
  }

  private targetLocation(t: KbTarget): Point | undefined {
    if (!onLink(t)) return this.portLocation(t);
    const path = this.linkPath(t.link);
    const a = t.proposal.toAttach ?? t.proposal.fromAttach;
    return path && a ? pointAlong(path, a.at)?.point : undefined;
  }

  /**
   * Links a keyboard connect from `from` can attach to (`DiagramOptions.linkAttach`), nearest first.
   * The new end lands on the middle of the link; the arrow keys move it once the link exists.
   */
  private keyboardLinkTargets(from: LinkEnd, kind: string, origin: Point | undefined): KbTarget[] {
    if (!this.diagram.options.linkAttach) return [];
    const indexes = this.commands.connectIndexes();
    const out: { t: KbTarget; d: number }[] = [];
    for (const l of this.diagram.store.links.values()) {
      const r = this.commands.attachCheck(from, l.id, 0.5, kind, indexes);
      if (!r?.check.ok) continue;
      const t: KbTarget = { link: l.id, proposal: r.proposal };
      const p = this.targetLocation(t);
      out.push({ t, d: origin && p ? Math.hypot(p.x - origin.x, p.y - origin.y) : 0 });
    }
    return out.sort((a, b) => a.d - b.d).map((x) => x.t);
  }

  private finishKeyboardConnect(): void {
    const kb = this.kb!;
    const to = kb.targets[kb.index]!;
    const r = onLink(to)
      ? this.commands.tryAttach(to.proposal)
      : this.commands.tryConnect(kb.from!, to, kb.kind);
    if (r.ok) {
      this.kb = null;
      this.announce(
        `Connected ${this.describePort(kb.from!)} to ${this.describeTarget(to)}.${
          onLink(to) ? ' Use the arrow keys to move the connection point.' : ''
        }`,
      );
    } else {
      this.announce(r.reason);
    }
  }

  // ------------------------------------------------------------------ placement (FR-50)

  /** Starts placement mode; see `Diagram.startPlacement`. The preview starts at the centre of the view. */
  startPlacement(type: string, init: Partial<NodeModel> = {}): void {
    if (!this.diagram.symbols.get(type)) return;
    this.cancelGesture();
    const r = this.root.getBoundingClientRect();
    const at = this.toDiagram({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    this.placement = {
      type,
      init,
      at,
      check: this.commands.checkDrop(type, at, init),
      touch: false,
    };
    this.root.classList.add('pv-placing');
    this.root.focus({ preventScroll: true });
    this.redraw();
  }

  /** Cancels placement mode, if active. */
  cancelPlacement(): void {
    if (!this.placement) return;
    this.placement = null;
    this.root.classList.remove('pv-placing');
    this.redraw();
  }

  /** True while placement mode is active. */
  isPlacing(): boolean {
    return this.placement !== null;
  }

  private movePlacement(at: Point): void {
    const pl = this.placement!;
    pl.at = at;
    pl.check = this.commands.checkDrop(pl.type, at, pl.init);
    this.redraw();
  }

  /** Places the preview if `canDrop` allows it; a refused spot keeps placement mode on. */
  private finishPlacement(): void {
    const pl = this.placement!;
    const r = this.commands.tryDrop(pl.type, pl.at, pl.init);
    if (!r.ok) {
      this.redraw();
      return;
    }
    this.suppressClick();
    this.cancelPlacement();
  }

  private onPlacementKey(e: KeyboardEvent): boolean {
    const step = (e.shiftKey ? 5 : 1) * (this.diagram.options.grid?.size ?? 10);
    const at = this.placement!.at;
    switch (e.key) {
      case 'Escape':
        this.cancelPlacement();
        return true;
      case 'Enter':
        this.finishPlacement();
        return true;
      case 'ArrowLeft':
        this.movePlacement({ x: at.x - step, y: at.y });
        return true;
      case 'ArrowRight':
        this.movePlacement({ x: at.x + step, y: at.y });
        return true;
      case 'ArrowUp':
        this.movePlacement({ x: at.x, y: at.y - step });
        return true;
      case 'ArrowDown':
        this.movePlacement({ x: at.x, y: at.y + step });
        return true;
      default:
        return false;
    }
  }

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
        // An end drawn on another link can be dragged along it.
        for (const { end } of this.attachedEnds(id)) {
          const at = end === 'from' ? path[0]! : path[path.length - 1]!;
          out.push(
            el('circle', {
              class: 'pv-attach-handle',
              'data-pv-handle': 'attach',
              'data-link': id,
              'data-end': end,
              cx: at.x,
              cy: at.y,
              r: 5 * s,
              'stroke-width': 1.5 * s,
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
      const onPort = this.connectTarget(g, g.current);
      // A link is only the target when no port and no node body is under the pointer.
      const drop = onPort ?? (this.nodeDrop(g, g.current) ? null : this.linkDrop(g, g.current));
      const target = drop?.ok && !drop.attach ? drop.end : null;
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
      if (drop?.ok && drop.attach) {
        // Hovering a link the connection can attach to: mark where the new end would land.
        out.push(
          el('circle', {
            class: 'pv-port-target pv-hot pv-attach-target',
            'data-target-link': (drop.attach.proposal.toAttach ?? drop.attach.proposal.fromAttach)!
              .link,
            cx: drop.attach.point.x,
            cy: drop.attach.point.y,
            r: 7 * s,
            'stroke-width': s,
          }),
        );
      }
      if (drop && !drop.ok) {
        // Hovering a port or link that refuses the connection: show why, next to the pointer (FR-42).
        const ref =
          drop.attach ??
          g.refused.find((r) => r.node === drop.end.node && r.port === drop.end.port)!;
        out.push(
          el('circle', {
            class: 'pv-port-target pv-refused',
            'data-refused': drop.code,
            cx: ref.point.x,
            cy: ref.point.y,
            r: 7 * s,
            'stroke-width': s,
          }),
        );
        const tip = el('text', {
          class: 'pv-refusal-tip',
          x: g.current.x + 12 * s,
          y: g.current.y - 10 * s,
          'font-size': 12 * s,
          'stroke-width': 3 * s,
        });
        tip.textContent = drop.reason;
        out.push(tip);
      }
      out.push(
        el('path', {
          class: 'pv-connect-preview',
          d: `M${g.origin.x},${g.origin.y} H${g.current.x} V${g.current.y}`,
          'stroke-width': 1.5 * s,
        }),
      );
    }
    const kb = this.kb;
    if (kb) {
      const cur: KbTarget | undefined = (kb.phase === 'source' ? kb.ports : kb.targets)[kb.index];
      const at = cur && this.targetLocation(cur);
      const origin = kb.from && this.portLocation(kb.from);
      if (origin && at) {
        out.push(
          el('path', {
            class: 'pv-connect-preview',
            d: `M${origin.x},${origin.y} H${at.x} V${at.y}`,
            'stroke-width': 1.5 * s,
          }),
        );
      }
      if (at) {
        out.push(
          el('circle', {
            class: 'pv-port-target pv-hot pv-kb-port',
            cx: at.x,
            cy: at.y,
            r: 7 * s,
            'stroke-width': 2 * s,
          }),
        );
      }
    }
    const pl = this.placement;
    if (pl) {
      const def = this.diagram.symbols.get(pl.type)!;
      const node = { ...previewNode(def), ...pl.init } as NodeModel;
      const size = nodeSize(def, node);
      const pos = pl.check.ok
        ? pl.check.position
        : { x: pl.at.x - size.width / 2, y: pl.at.y - size.height / 2 };
      const ghost = el('g', {
        class: 'pv-placement',
        transform: `translate(${pos.x},${pos.y})`,
        'data-symbol-type': pl.type,
      });
      if (!pl.check.ok) ghost.setAttribute('data-refused', pl.check.code);
      const body = el('g', { class: 'pv-symbol' });
      body.innerHTML = def.render ? def.render({ data: node.data ?? {} }) : (def.svg ?? '');
      ghost.append(
        el('rect', {
          class: 'pv-placement-box',
          x: -2 * s,
          y: -2 * s,
          width: size.width + 4 * s,
          height: size.height + 4 * s,
          rx: 3 * s,
          'stroke-width': s,
        }),
        body,
      );
      out.push(ghost);
      if (!pl.check.ok) {
        const tip = el('text', {
          class: 'pv-refusal-tip',
          x: pos.x + size.width + 8 * s,
          y: pos.y - 6 * s,
          'font-size': 12 * s,
          'stroke-width': 3 * s,
        });
        tip.textContent = pl.check.reason;
        out.push(tip);
      }
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

/** Nearest candidate port (accepting or refusing) within `radius` that passes `filter`. Accepting ports win ties. */
function nearestDrop(
  g: { targets: (LinkEnd & { point: Point })[]; refused: RefusedPort[] },
  p: Point,
  radius: number,
  filter: (e: LinkEnd) => boolean,
): ConnectDrop | null {
  let best: ConnectDrop | null = null;
  let bestD = radius;
  for (const t of g.targets) {
    if (!filter(t)) continue;
    const d = Math.hypot(t.point.x - p.x, t.point.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = { ok: true, end: { node: t.node, port: t.port } };
    }
  }
  for (const r of g.refused) {
    if (!filter(r)) continue;
    const d = Math.hypot(r.point.x - p.x, r.point.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = {
        ok: false,
        end: { node: r.node, port: r.port },
        code: r.code,
        reason: r.reason,
        ...(r.detail ? { detail: r.detail } : {}),
        ...(r.ends ? { ends: r.ends } : {}),
      };
    }
  }
  return best;
}
