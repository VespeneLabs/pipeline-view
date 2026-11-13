/**
 * Resolves a symbol's per-node ports and size (FR-40). Always read ports and size through these helpers:
 * `SymbolDef.ports` and `size` may be functions of the node, and `NodeModel.ports` overrides both.
 *
 * Port and size functions are called with `previewNode(def)` (no `data`) outside a diagram, for example
 * in palettes, so they must tolerate missing data. Results are cached per node object: the model store
 * replaces a node object on every change, so a cached result can never go stale.
 */
import type { DataRecord, NodeModel, Size } from '../model/types';
import type { PortDef, PortDirection, SymbolDef, SymbolRenderContext } from './types';

/** Size used for nodes whose symbol type isn't registered. */
export const FALLBACK_SIZE: Size = { width: 40, height: 40 };

/** A minimal node to evaluate a symbol outside a diagram (palettes, galleries). */
export function previewNode(def: Pick<SymbolDef, 'type'>): NodeModel {
  return { id: `preview:${def.type}`, type: def.type, position: { x: 0, y: 0 } };
}

const sizeCache = new WeakMap<NodeModel, { def: SymbolDef; size: Size }>();
const portCache = new WeakMap<NodeModel, { def: SymbolDef; ports: PortDef[] }>();
const warned = new Set<string>();

export function nodeSize(def: SymbolDef | undefined, node?: NodeModel): Size {
  if (!def) return FALLBACK_SIZE;
  if (typeof def.size !== 'function') return def.size;
  const n = node ?? previewNode(def);
  const hit = sizeCache.get(n);
  if (hit && hit.def === def) return hit.size;
  const size = def.size(n);
  sizeCache.set(n, { def, size });
  return size;
}

export function nodePorts(def: SymbolDef | undefined, node?: NodeModel): PortDef[] {
  if (node?.ports) return node.ports;
  if (!def) return [];
  if (typeof def.ports !== 'function') return def.ports;
  const n = node ?? previewNode(def);
  const hit = portCache.get(n);
  if (hit && hit.def === def) return hit.ports;
  const ports = dedupe(def, def.ports(n));
  portCache.set(n, { def, ports });
  return ports;
}

export function findPort(
  def: SymbolDef | undefined,
  node: NodeModel | undefined,
  portId: string,
): PortDef | undefined {
  return nodePorts(def, node).find((p) => p.id === portId);
}

/**
 * A copy of `def` with `extra` ports added, without restating the symbol's own ports. It works whether
 * `def.ports` is a list or a function of the node, and `extra` may be either too. An extra port whose
 * id the symbol already has replaces that port. Register the result under the same `type` to replace
 * the symbol, or spread it with a new `type` to keep both:
 * `registerSymbol(withPorts(gateValve, [{ id: 'side', position: { x: 20, y: 0 }, direction: 'top' }]))`.
 */
export function withPorts<D extends DataRecord = DataRecord>(
  def: SymbolDef<D>,
  extra: PortDef[] | ((node: NodeModel<D>) => PortDef[]),
): SymbolDef<D> {
  const base = def.ports;
  const merge = (own: PortDef[], added: PortDef[]): PortDef[] => {
    const ids = new Set(added.map((p) => p.id));
    return [...own.filter((p) => !ids.has(p.id)), ...added];
  };
  if (typeof base !== 'function' && typeof extra !== 'function') {
    return { ...def, ports: merge(base, extra) };
  }
  return {
    ...def,
    ports: (node: NodeModel<D>) =>
      merge(
        typeof base === 'function' ? base(node) : base,
        typeof extra === 'function' ? extra(node) : extra,
      ),
  };
}

/** A symbol's inner SVG markup drawn with the given data: its `render()` when it has one, else its static `svg`. */
export function symbolMarkup(def: SymbolDef, ctx: Partial<SymbolRenderContext> = {}): string {
  return def.render ? def.render({ ...ctx, data: ctx.data ?? {} }) : (def.svg ?? '');
}

export interface SymbolSvgOptions extends Partial<SymbolRenderContext> {
  /** Drawn width in px. With only one of `width` / `height`, the other follows the symbol's proportions. */
  width?: number;
  height?: number;
}

/**
 * A symbol as a stand-alone `<svg class="pv-symbol-view">` string, outside any diagram: for an HTML
 * node renderer, a legend or a list. It is drawn with `data` like a node would be (for example a
 * fill level), carries `status` as `data-status`, and follows `currentColor` and the `--pv-*`
 * properties of where it is placed. Symbol markup is trusted code; `status` is escaped.
 */
export function symbolSvg(def: SymbolDef, opts: SymbolSvgOptions = {}): string {
  const { width, height, ...ctx } = opts;
  const size = nodeSize(def, { ...previewNode(def), data: ctx.data });
  const k =
    width !== undefined ? width / size.width : height !== undefined ? height / size.height : 1;
  const status =
    ctx.status === undefined
      ? ''
      : ` data-status="${ctx.status.replace(/[&<"]/g, (c) => `&#${c.charCodeAt(0)};`)}"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="pv-symbol-view" viewBox="0 0 ${size.width} ${size.height}" ` +
    `width="${width ?? size.width * k}" height="${height ?? size.height * k}" overflow="visible" aria-hidden="true"${status}>` +
    `${symbolMarkup(def, ctx)}</svg>`
  );
}

/** Drops ports with a duplicate id (the first one wins) and warns once per symbol type. */
function dedupe(def: SymbolDef, ports: PortDef[]): PortDef[] {
  const seen = new Set<string>();
  const out: PortDef[] = [];
  for (const p of ports) {
    if (seen.has(p.id)) {
      if (!warned.has(def.type)) {
        warned.add(def.type);
        console.warn(`[pipeline-view] Symbol "${def.type}" computed duplicate port id "${p.id}"`);
      }
      continue;
    }
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export interface SidePortsOptions extends Omit<PortDef, 'id' | 'position' | 'direction' | 'label'> {
  /** Port ids are `${idPrefix}${index}`, starting at `start`. Default prefix: the side name plus '-'. */
  idPrefix?: string;
  /** First index. Default 1. */
  start?: number;
  /** Add the index as the port label. Default false. */
  labels?: boolean;
  /**
   * Distance between neighbouring ports. Omitted: the ports are spread evenly along the side
   * (side length / (count + 1)). With a value, they're centred on the side at that spacing.
   */
  spacing?: number;
}

/**
 * `count` ports evenly spaced along one side of a symbol of `size` (FR-40), for example the inlets of a
 * manifold: `sidePorts(size, 'left', node.data?.inputs ?? 1, { idPrefix: 'in-', role: 'in' })`.
 */
export function sidePorts(
  size: Size,
  side: PortDirection,
  count: number,
  opts: SidePortsOptions = {},
): PortDef[] {
  const { idPrefix = `${side}-`, start = 1, labels = false, spacing, ...rest } = opts;
  const n = Math.max(0, Math.floor(count));
  const vertical = side === 'left' || side === 'right';
  const length = vertical ? size.height : size.width;
  const step = spacing ?? length / (n + 1);
  const first = spacing === undefined ? step : (length - (n - 1) * spacing) / 2;
  const out: PortDef[] = [];
  for (let i = 0; i < n; i++) {
    const along = first + i * step;
    const position =
      side === 'left'
        ? { x: 0, y: along }
        : side === 'right'
          ? { x: size.width, y: along }
          : side === 'top'
            ? { x: along, y: 0 }
            : { x: along, y: size.height };
    const index = start + i;
    out.push({
      ...rest,
      id: `${idPrefix}${index}`,
      position,
      direction: side,
      ...(labels ? { label: String(index) } : {}),
    });
  }
  return out;
}
