/**
 * Symbol definition contract (PRD FR-6/7). Implemented by @pipeline-view/symbols and by custom symbols that users register.
 */
import type { DataRecord, LinkKind, Point, Size } from '../model/types';

export type PortDirection = 'left' | 'right' | 'top' | 'bottom';

export interface PortDef {
  id: string;
  /** Position in the symbol's unrotated local coordinates (0..size). */
  position: Point;
  /** The direction a pipe leaves the port in, before rotation. The router uses it for the first and last segment. */
  direction: PortDirection;
  /** Link kinds this port accepts. Omitted means every kind is accepted. */
  accepts?: LinkKind[];
}

export interface SymbolRenderContext<D extends DataRecord = DataRecord> {
  data: D;
  label?: string;
  status?: string;
}

export interface SymbolDef<D extends DataRecord = DataRecord> {
  /** Namespaced id, for example 'gas/ball-valve'. */
  type: string;
  name: string;
  /** Palette grouping, for example 'Valves', 'Actuation & protection', 'Gas equipment', 'Instrumentation', 'Piping & signals', 'Process equipment'. */
  category: string;
  /** Reference number from the Figma sheet (1-50) where it applies. */
  ref?: number;
  size: Size;
  ports: PortDef[];
  /**
   * Static SVG markup (inner content, no <svg> wrapper), drawn in local coordinates 0..size.
   * Strokes must use currentColor or var(--pv-*) so that theming works (FR-35).
   */
  svg?: string;
  /**
   * Dynamic render for bindable parts (valve open/closed, pump running, tank level, instrument tag letters).
   * Returns inner SVG markup. When both are given, it takes precedence over `svg`.
   */
  render?: (ctx: SymbolRenderContext<D>) => string;
  /** Where the label is placed, in local coordinates. The default is bottom-center below the symbol. */
  labelAnchor?: Point;
  keywords?: string[];
}
