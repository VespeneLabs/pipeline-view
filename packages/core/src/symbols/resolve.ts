/**
 * Resolves a symbol's per-node ports and size (FR-40). Always read ports and size through these helpers:
 * `SymbolDef.ports` and `size` may be functions of the node, and `NodeModel.ports` overrides both.
 */
import type { NodeModel, Size } from '../model/types';
import type { PortDef, SymbolDef } from './types';

/** Size used for nodes whose symbol type isn't registered. */
export const FALLBACK_SIZE: Size = { width: 40, height: 40 };

/** A minimal node to evaluate a symbol outside a diagram (palettes, galleries). */
export function previewNode(def: Pick<SymbolDef, 'type'>): NodeModel {
  return { id: `preview:${def.type}`, type: def.type, position: { x: 0, y: 0 } };
}

export function nodeSize(def: SymbolDef | undefined, node?: NodeModel): Size {
  if (!def) return FALLBACK_SIZE;
  return typeof def.size === 'function' ? def.size(node ?? previewNode(def)) : def.size;
}

export function nodePorts(def: SymbolDef | undefined, node?: NodeModel): PortDef[] {
  if (node?.ports) return node.ports;
  if (!def) return [];
  return typeof def.ports === 'function' ? def.ports(node ?? previewNode(def)) : def.ports;
}

export function findPort(
  def: SymbolDef | undefined,
  node: NodeModel | undefined,
  portId: string,
): PortDef | undefined {
  return nodePorts(def, node).find((p) => p.id === portId);
}
