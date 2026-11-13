import {
  type DataRecord,
  type SymbolDef,
  globalSymbols,
  nodeSize,
  previewNode,
  symbolMarkup,
} from '@pipeline-view/core';
import type { CSSProperties } from 'react';
import { useDiagram } from './PipelineView';

export interface SymbolViewProps {
  /** Type id of a registered symbol: on the nearest <PipelineView> when there is one, else globally. */
  type?: string;
  /** The symbol itself, instead of `type`. */
  symbol?: SymbolDef;
  /** Data the symbol is drawn with, as on a node (for example `{ level: 0.4 }`). */
  data?: DataRecord;
  /** Emitted as `data-status`, as on a node, so the same CSS can colour it. */
  status?: string;
  /** Passed to the symbol's `render()` as the node label would be. */
  label?: string;
  /** Size in px of the longer side. Without any size the symbol is drawn at its own size. */
  size?: number;
  /** Drawn width in px. With only one of `width` / `height`, the other follows the symbol's proportions. */
  width?: number;
  height?: number;
  /** Accessible name. Without it the drawing is hidden from assistive technology. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * One symbol drawn outside the diagram's SVG layer: inside a node renderer, a legend, a picker.
 * It follows `currentColor` and the `--pv-*` properties of where it is placed. An unknown `type`
 * renders nothing. Symbol markup comes from registered SymbolDefs, which are trusted code.
 */
export function SymbolView(props: SymbolViewProps) {
  const diagram = useDiagram();
  const { type, data, status, label, size, title } = props;
  const def =
    props.symbol ?? (type ? (diagram?.symbols.get(type) ?? globalSymbols.get(type)) : undefined);
  if (!def) return null;
  const own = nodeSize(def, { ...previewNode(def), data });
  let k = 1;
  if (props.width !== undefined) k = props.width / own.width;
  else if (props.height !== undefined) k = props.height / own.height;
  else if (size !== undefined) k = size / Math.max(own.width, own.height);
  return (
    <svg
      className={props.className ? `pv-symbol-view ${props.className}` : 'pv-symbol-view'}
      style={props.style}
      viewBox={`0 0 ${own.width} ${own.height}`}
      width={props.width ?? own.width * k}
      height={props.height ?? own.height * k}
      overflow="visible"
      data-status={status}
      data-symbol-type={def.type}
      focusable="false"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      dangerouslySetInnerHTML={{ __html: symbolMarkup(def, { data, status, label }) }}
    />
  );
}
