/**
 * `@vespenelabs/pipeline-view/testing`: headless helpers for testing apps built on pipeline-view.
 *
 * Works under jsdom and happy-dom (Vitest, Jest) and in real browsers. The actions dispatch real
 * pointer and keyboard events at the diagram's DOM, so they go through the same editor code as a
 * user would, including canConnect / canDrop checks. Every action renders synchronously before it
 * returns, so assertions can follow straight away.
 *
 * All helpers take either a `TestDiagram` from `createTestDiagram()` or any mounted `Diagram`,
 * for example the one `<PipelineView onReady>` hands you in a React Testing Library test.
 */
import {
  Diagram,
  attachEditor,
  getEditor,
  nodeBounds,
  nodePorts,
  portPoint,
  type DiagramModel,
  type DiagramOptions,
  type EditorControllerOptions,
  type LinkEnd,
  type LinkModel,
  type NodeModel,
  type Point,
  type PortDef,
} from '@pipeline-view/core';

export interface TestDiagramOptions extends DiagramOptions {
  /** Model to load. Default: an empty diagram. */
  model?: DiagramModel;
  /** Size of the container in CSS pixels. Default 800 × 600. */
  width?: number;
  height?: number;
  /** Options for the editor, which is attached so edit-mode actions work. `false` leaves it off. */
  editor?: EditorControllerOptions | false;
  /** Mount here instead of a new element appended to `document.body`. */
  container?: HTMLElement;
}

export interface TestDiagram {
  readonly diagram: Diagram;
  readonly container: HTMLElement;
  /** Runs pending render work now. Actions call it for you. */
  flush(): void;
  /** Detaches the editor, destroys the diagram and removes a container it created. */
  destroy(): void;
}

/** A `TestDiagram`, or a mounted `Diagram` you created yourself. */
export type DiagramLike = TestDiagram | Diagram;

/** A port as `{ node, port }`, or the shorthand `'nodeId.portId'`. */
export type PortRef = LinkEnd | `${string}.${string}`;

/**
 * Creates and mounts a diagram for a test. The default mode is `'edit'` with the editor attached, so
 * `connect`, `drag`, `drop` and `pressKey` work. Call `destroy()` (for example in `afterEach`).
 */
export function createTestDiagram(options: TestDiagramOptions = {}): TestDiagram {
  const { model, width = 800, height = 600, editor, container: given, ...diagramOptions } = options;
  const container = given ?? document.createElement('div');
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  if (!given) document.body.append(container);
  const diagram = new Diagram({ mode: 'edit', ...diagramOptions });
  diagram.mount(container);
  const detachEditor =
    editor === false
      ? undefined
      : attachEditor(diagram, { getLinkPath: (id) => diagram.getLinkPath(id), ...editor });
  if (model) diagram.load(model);
  const t: TestDiagram = {
    diagram,
    container,
    flush: () => flush(diagram),
    destroy() {
      detachEditor?.();
      diagram.destroy();
      if (!given) container.remove();
    },
  };
  t.flush();
  return t;
}

// ------------------------------------------------------------------------------------------ queries

/** The one node whose `label` is `label`. Throws when there is none or more than one. */
export function getNodeByLabel(target: DiagramLike, label: string): NodeModel {
  const d = diagramOf(target);
  const found = [...d.store.nodes.values()].filter((n) => n.label === label);
  if (found.length === 1) return found[0]!;
  const labels = [...d.store.nodes.values()]
    .map((n) => n.label)
    .filter((l): l is string => !!l)
    .map((l) => JSON.stringify(l));
  throw new Error(
    found.length === 0
      ? `No node with label ${JSON.stringify(label)}. Labels: ${labels.join(', ') || '(none)'}`
      : `${found.length} nodes have label ${JSON.stringify(label)}: ${found.map((n) => n.id).join(', ')}`,
  );
}

/** The node's rendered element (`[data-pv-node-id]`). Throws when it isn't rendered. */
export function getNodeElement(target: DiagramLike, nodeId: string): SVGGElement {
  const d = diagramOf(target);
  flush(d);
  const el = d.view!.root.querySelector<SVGGElement>(`[data-pv-node-id="${cssEscape(nodeId)}"]`);
  if (!el) throw new Error(`Node ${JSON.stringify(nodeId)} is not rendered`);
  return el;
}

/** The link's rendered element (`[data-pv-link-id]`). Throws when it isn't rendered. */
export function getLinkElement(target: DiagramLike, linkId: string): SVGGElement {
  const d = diagramOf(target);
  flush(d);
  const el = d.view!.root.querySelector<SVGGElement>(`[data-pv-link-id="${cssEscape(linkId)}"]`);
  if (!el) throw new Error(`Link ${JSON.stringify(linkId)} is not rendered`);
  return el;
}

export interface PortInfo {
  node: NodeModel;
  def: PortDef;
  /** The port's position in diagram coordinates, after rotation and flips. */
  point: Point;
  /** The rendered port element (`[data-pv-port-id]`). */
  element: SVGElement;
}

/** A port of a node, with its definition, position and element. Throws when it doesn't exist. */
export function getPort(target: DiagramLike, ref: PortRef): PortInfo;
export function getPort(target: DiagramLike, nodeId: string, portId: string): PortInfo;
export function getPort(target: DiagramLike, ref: PortRef | string, portId?: string): PortInfo {
  const d = diagramOf(target);
  const end = portId === undefined ? toEnd(ref as PortRef) : { node: ref as string, port: portId };
  const node = d.store.nodes.get(end.node);
  if (!node) throw new Error(`No node ${JSON.stringify(end.node)}`);
  const sym = d.symbols.get(node.type);
  // Per-instance ports (NodeModel.ports or a ports function) win over the symbol's static list.
  const ports = nodePorts(sym, node);
  const def = ports.find((p) => p.id === end.port);
  if (!def) {
    const ids = ports.map((p) => p.id).join(', ') || '(none)';
    throw new Error(
      `Node ${JSON.stringify(end.node)} has no port ${JSON.stringify(end.port)}. Ports: ${ids}`,
    );
  }
  const element = getNodeElement(d, node.id).querySelector<SVGElement>(
    `[data-pv-port-id="${cssEscape(end.port)}"]`,
  );
  if (!element) throw new Error(`Port ${end.node}.${end.port} is not rendered`);
  return { node, def, point: portPoint(node, sym, end.port)!.point, element };
}

/** All links between two ports (in either direction when `undirected` is set). */
export function findLinks(
  target: DiagramLike,
  from: PortRef | string,
  to: PortRef | string,
  opts: { kind?: string; undirected?: boolean } = {},
): LinkModel[] {
  const d = diagramOf(target);
  const a = toEndOrNode(from);
  const b = toEndOrNode(to);
  return [...d.store.links.values()].filter(
    (l) =>
      (opts.kind === undefined || l.kind === opts.kind) &&
      ((matches(l.from, a) && matches(l.to, b)) ||
        (!!opts.undirected && matches(l.from, b) && matches(l.to, a))),
  );
}

/**
 * Asserts that exactly one link runs from `from` to `to` and returns it. Each end is a port
 * (`'node.port'` or `{ node, port }`) or a bare node id (any port). Pass `{ count: 0 }` to assert
 * there is none. The error lists the links that do exist.
 */
export function expectLink(
  target: DiagramLike,
  from: PortRef | string,
  to: PortRef | string,
  opts: { kind?: string; undirected?: boolean; count?: number } = {},
): LinkModel {
  const d = diagramOf(target);
  const found = findLinks(d, from, to, opts);
  const want = opts.count ?? 1;
  if (found.length !== want) {
    const what = `${fmt(toEndOrNode(from))} → ${fmt(toEndOrNode(to))}${opts.kind ? ` (${opts.kind})` : ''}`;
    const all = [...d.store.links.values()].map(
      (l) => `  ${l.id}: ${fmt(l.from)} → ${fmt(l.to)} (${l.kind})`,
    );
    throw new Error(
      `Expected ${want} link(s) ${what}, found ${found.length}.\nLinks:\n${all.join('\n') || '  (none)'}`,
    );
  }
  return found[0]!;
}

// ------------------------------------------------------------------------------------------ actions

/**
 * Drags a new connection from one port to another, as a user would, in edit mode. Returns the new
 * link's id, or `null` when nothing was connected (refused, or the ports aren't compatible).
 */
export function connect(
  target: DiagramLike,
  from: PortRef,
  to: PortRef,
  opts: { kind?: string } = {},
): string | null {
  const d = diagramOf(target);
  requireEditor(d, 'connect');
  const a = getPort(d, from);
  const b = getPort(d, to);
  const editor = getEditor(d)!;
  const previousKind = editor.getLinkKind();
  if (opts.kind) editor.setLinkKind(opts.kind);
  const before = new Set(d.store.links.keys());
  try {
    gesture(d, a.element, d.diagramToScreen(a.point), d.diagramToScreen(b.point));
  } finally {
    if (opts.kind) editor.setLinkKind(previousKind);
  }
  flush(d);
  return [...d.store.links.keys()].find((id) => !before.has(id)) ?? null;
}

/**
 * Drags a node by `by` diagram units (or to the absolute top-left `to`) with the pointer, in edit
 * mode. Snapping and guides apply as for a user; read the result from the model.
 */
export function drag(
  target: DiagramLike,
  nodeId: string,
  move: { by: Point } | { to: Point },
): void {
  const d = diagramOf(target);
  requireEditor(d, 'drag');
  const node = d.store.nodes.get(nodeId);
  if (!node) throw new Error(`No node ${JSON.stringify(nodeId)}`);
  const b = nodeBounds(node, d.symbols.get(node.type));
  const start = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const delta =
    'by' in move ? move.by : { x: move.to.x - node.position.x, y: move.to.y - node.position.y };
  const end = { x: start.x + delta.x, y: start.y + delta.y };
  gesture(d, getNodeElement(d, nodeId), d.diagramToScreen(start), d.diagramToScreen(end));
  flush(d);
}

/**
 * Drops a symbol from a palette at a point in diagram coordinates, in edit mode. Returns the new
 * node's id, or `null` when it was refused.
 */
export function drop(target: DiagramLike, type: string, at: Point): string | null {
  const d = diagramOf(target);
  requireEditor(d, 'drop');
  const s = d.diagramToScreen(at);
  const r = d.view!.root.getBoundingClientRect();
  const id = getEditor(d)!.dropSymbol(type, r.left + s.x, r.top + s.y);
  flush(d);
  return id;
}

/** Clicks a node or link (selects it in edit mode, fires nodeClick / linkClick in both modes). */
export function click(
  target: DiagramLike,
  item: { node: string } | { link: string },
  init: MouseEventInit = {},
): void {
  const d = diagramOf(target);
  let el: Element;
  let p: Point;
  if ('node' in item) {
    el = getNodeElement(d, item.node);
    const n = d.store.nodes.get(item.node)!;
    const b = nodeBounds(n, d.symbols.get(n.type));
    p = d.diagramToScreen({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  } else {
    const link = getLinkElement(d, item.link);
    el = link.querySelector('.pv-link-hit') ?? link;
    const path = d.getLinkPath(item.link) ?? [];
    const mid = path.length > 1 ? midpoint(path[0]!, path[1]!) : { x: 0, y: 0 };
    p = d.diagramToScreen(mid);
  }
  const c = client(d, p);
  pointer(el, 'pointerdown', c, init);
  pointer(el, 'pointerup', c, init);
  el.dispatchEvent(new (win(d).MouseEvent)('click', { bubbles: true, button: 0, ...c, ...init }));
  flush(d);
}

/**
 * Presses a key on the diagram (keydown + keyup), at the focused element when it is inside the
 * diagram, otherwise at its root. `'Delete'`, `'Escape'`, `'z'` with `{ ctrlKey: true }`, …
 */
export function pressKey(target: DiagramLike, key: string, init: KeyboardEventInit = {}): void {
  const d = diagramOf(target);
  const root = d.view!.root;
  const active = root.ownerDocument.activeElement;
  const el = active && root.contains(active) ? active : root;
  const KE = win(d).KeyboardEvent;
  el.dispatchEvent(new KE('keydown', { key, bubbles: true, cancelable: true, ...init }));
  el.dispatchEvent(new KE('keyup', { key, bubbles: true, cancelable: true, ...init }));
  flush(d);
}

// ---------------------------------------------------------------------------------------- internals

function diagramOf(target: DiagramLike): Diagram {
  const d = target instanceof Diagram ? target : target.diagram;
  if (!d.view) throw new Error('The diagram is not mounted');
  return d;
}

function flush(d: Diagram): void {
  d.renderer?.flush();
  d.overlay?.flush();
  getEditor(d)?.redraw();
}

function requireEditor(d: Diagram, action: string): void {
  if (d.getMode() !== 'edit')
    throw new Error(`${action}() needs edit mode; the diagram is in ${d.getMode()} mode`);
  if (!getEditor(d))
    throw new Error(`${action}() needs the editor (attachEditor or <PipelineView>)`);
}

function win(d: Diagram): typeof globalThis {
  return d.view!.root.ownerDocument.defaultView as unknown as typeof globalThis;
}

function client(d: Diagram, screen: Point): { clientX: number; clientY: number } {
  const r = d.view!.root.getBoundingClientRect();
  return { clientX: r.left + screen.x, clientY: r.top + screen.y };
}

function pointer(
  el: Element,
  type: string,
  at: { clientX: number; clientY: number },
  init: MouseEventInit = {},
): void {
  const w = el.ownerDocument.defaultView as unknown as typeof globalThis;
  // jsdom only gained PointerEvent recently; a MouseEvent with the pointer fields is enough for the editor.
  const PE = w.PointerEvent ?? w.MouseEvent;
  const ev = new PE(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...at,
    ...init,
  });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse', isPrimary: true })) {
    if (!(k in ev) || (ev as unknown as Record<string, unknown>)[k] === undefined)
      Object.defineProperty(ev, k, { value: v });
  }
  el.dispatchEvent(ev);
}

/** Press on `el`, move past the drag threshold in a few steps, release over the end point. */
function gesture(d: Diagram, el: Element, from: Point, to: Point): void {
  const root = d.view!.root;
  pointer(el, 'pointerdown', client(d, from));
  for (const t of [0.25, 0.5, 0.75, 1]) {
    pointer(
      root,
      'pointermove',
      client(d, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
    );
  }
  pointer(root, 'pointerup', client(d, to));
}

function toEnd(ref: PortRef): LinkEnd {
  if (typeof ref !== 'string') return ref;
  const i = ref.lastIndexOf('.');
  if (i <= 0 || i === ref.length - 1)
    throw new Error(`Port reference must be "node.port", got ${JSON.stringify(ref)}`);
  return { node: ref.slice(0, i), port: ref.slice(i + 1) };
}

function toEndOrNode(ref: PortRef | string): { node: string; port?: string } {
  return typeof ref === 'string' && !ref.includes('.') ? { node: ref } : toEnd(ref as PortRef);
}

function matches(end: LinkEnd, want: { node: string; port?: string }): boolean {
  return end.node === want.node && (want.port === undefined || end.port === want.port);
}

function fmt(e: { node: string; port?: string }): string {
  return e.port === undefined ? e.node : `${e.node}.${e.port}`;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, '\\$&');
}
