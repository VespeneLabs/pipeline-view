/**
 * Instance symbol registry that knows about content-sized HTML nodes (FR-45). For those types, size
 * comes from the measured content (view state) and port positions scale from the symbol's declared
 * size to the measured one. Everything else resolves as usual, so geometry helpers stay pure.
 */
import type { NodeModel, Size } from '../model/types';
import { SymbolRegistry } from './registry';
import { nodePorts, nodeSize } from './resolve';
import type { PortDef, SymbolDef } from './types';

/** Symbol used for an HTML node type that has no registered symbol. */
const htmlFallback = (type: string): SymbolDef => ({
  type,
  name: type,
  category: 'Custom',
  size: { width: 120, height: 60 },
  ports: [],
});

export class ViewRegistry extends SymbolRegistry {
  private wrapped = new WeakMap<SymbolDef, SymbolDef>();

  constructor(
    parent: SymbolRegistry,
    /** Types rendered as HTML, and whether they size to their content. */
    private readonly htmlTypes: () => Record<string, 'fixed' | 'content'>,
    private readonly measured: ReadonlyMap<string, Size>,
  ) {
    super(parent);
  }

  /**
   * Call when a measured size changes. Wrappers get a new identity, so per-node caches keyed on the
   * symbol (nodeSize/nodePorts) don't serve sizes or ports from before the measurement.
   */
  refresh(): void {
    this.wrapped = new WeakMap();
  }

  override get(type: string): SymbolDef | undefined {
    const base = super.get(type);
    const sizing = this.htmlTypes()[type];
    if (!sizing) return base;
    const def = base ?? htmlFallback(type);
    if (sizing !== 'content') return def;
    let w = this.wrapped.get(def);
    if (!w) {
      const measured = this.measured;
      w = {
        ...def,
        size: (n: NodeModel) => measured.get(n.id) ?? nodeSize(def, n),
        ports: (n: NodeModel) =>
          scalePorts(nodePorts(def, n), nodeSize(def, n), measured.get(n.id)),
      };
      this.wrapped.set(def, w);
    }
    return w;
  }
}

function scalePorts(ports: PortDef[], from: Size, to: Size | undefined): PortDef[] {
  if (!to || (to.width === from.width && to.height === from.height)) return ports;
  const sx = from.width ? to.width / from.width : 1;
  const sy = from.height ? to.height / from.height : 1;
  return ports.map((p) => ({ ...p, position: { x: p.position.x * sx, y: p.position.y * sy } }));
}
