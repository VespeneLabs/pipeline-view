import {
  type Diagram,
  type SymbolDef,
  SYMBOL_MIME,
  getEditor,
  globalSymbols,
} from '@pipeline-view/core';
import { type DragEvent, useId, useMemo, useState } from 'react';
import { useDiagram } from './PipelineView';

/** Palette group order (FR-24): the five P&ID categories, then process equipment, then anything custom. */
export const DEFAULT_CATEGORY_ORDER = [
  'Valves',
  'Actuation & protection',
  'Gas equipment',
  'Instrumentation',
  'Piping & signals',
  'Process equipment',
];

export interface SymbolPaletteProps {
  /** Symbols to show. Default: everything registered on the diagram (global + instance symbols). */
  symbols?: SymbolDef[];
  /** Diagram to drop into. Default: the nearest <PipelineView>. */
  diagram?: Diagram | null;
  /** Extra filter applied before search. */
  filter?: (def: SymbolDef) => boolean;
  /** Group order. Categories not listed follow in first-seen order. */
  categoryOrder?: string[];
  /** Show the search box. Default true. */
  searchable?: boolean;
  /** Placeholder (and accessible label) of the search box. */
  searchLabel?: string;
  /** Called when a symbol is activated by click or Enter, after it was inserted (if an editor is attached). */
  onActivate?: (def: SymbolDef, nodeId: string | null) => void;
  className?: string;
}

/** True when every whitespace-separated term matches the name, type, category, keywords or ref (e.g. "21" or "#21"). */
export function matchesSymbol(def: SymbolDef, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [def.name, def.type, def.category, ...(def.keywords ?? [])].join(' ').toLowerCase();
  const ref = def.ref !== undefined ? String(def.ref) : '';
  return terms.every((t) => {
    const num = t.replace(/^#/, '');
    if (ref && /^\d+$/.test(num) && Number(num) === Number(ref)) return true;
    return hay.includes(t);
  });
}

/** Groups symbols by category in the given order; within a group, by Figma ref number, then name. */
export function groupSymbols(
  defs: SymbolDef[],
  order: string[] = DEFAULT_CATEGORY_ORDER,
): { category: string; symbols: SymbolDef[] }[] {
  const groups = new Map<string, SymbolDef[]>();
  for (const c of order) groups.set(c, []);
  for (const d of defs) {
    let list = groups.get(d.category);
    if (!list) groups.set(d.category, (list = []));
    list.push(d);
  }
  const out: { category: string; symbols: SymbolDef[] }[] = [];
  for (const [category, symbols] of groups) {
    if (!symbols.length) continue;
    symbols.sort(
      (a, b) => (a.ref ?? Infinity) - (b.ref ?? Infinity) || a.name.localeCompare(b.name),
    );
    out.push({ category, symbols });
  }
  return out;
}

/** Static preview markup of a symbol (render() with empty data, or the static svg). */
function previewMarkup(def: SymbolDef): string {
  try {
    return def.render ? def.render({ data: {} }) : (def.svg ?? '');
  } catch {
    return def.svg ?? '';
  }
}

/**
 * Searchable symbol palette grouped by category (FR-24). Drag an item onto a <PipelineView> in edit mode to
 * add it (HTML5 drag and drop, `SYMBOL_MIME`), or click / press Enter to insert it at the center of the view.
 * Symbol markup comes from registered SymbolDefs, which are trusted code.
 */
export function SymbolPalette(props: SymbolPaletteProps) {
  const ctx = useDiagram();
  const diagram = props.diagram ?? ctx;
  const [query, setQuery] = useState('');
  const searchId = useId();
  const { symbols, filter, categoryOrder, searchable = true } = props;

  // The registry has no change events; it's read again when the diagram (or `symbols`) changes.
  const all = useMemo(
    () => symbols ?? (diagram ? diagram.symbols.list() : globalSymbols.list()),
    [symbols, diagram],
  );
  const groups = useMemo(
    () =>
      groupSymbols(
        all.filter((d) => (!filter || filter(d)) && matchesSymbol(d, query)),
        categoryOrder,
      ),
    [all, filter, query, categoryOrder],
  );

  const onDragStart = (e: DragEvent<HTMLElement>, def: SymbolDef) => {
    e.dataTransfer.setData(SYMBOL_MIME, def.type);
    e.dataTransfer.setData('text/plain', def.name);
    e.dataTransfer.effectAllowed = 'copy';
  };

  /** Inserts at the center of the visible diagram, for click, keyboard and touch users. */
  const activate = (def: SymbolDef) => {
    let id: string | null = null;
    const editor = diagram ? getEditor(diagram) : undefined;
    const root = diagram?.view?.root;
    if (editor && root) {
      const r = root.getBoundingClientRect();
      id = editor.dropSymbol(def.type, r.left + r.width / 2, r.top + r.height / 2);
    }
    props.onActivate?.(def, id);
  };

  return (
    <div className={['pv-palette', props.className].filter(Boolean).join(' ')}>
      {searchable && (
        <input
          id={searchId}
          className="pv-palette-search"
          type="search"
          value={query}
          placeholder={props.searchLabel ?? 'Search symbols'}
          aria-label={props.searchLabel ?? 'Search symbols'}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {groups.length === 0 && <p className="pv-palette-empty">No matching symbols</p>}
      {groups.map((g) => (
        <details key={g.category} className="pv-palette-group" open>
          <summary className="pv-palette-group-title">
            {g.category} <span className="pv-palette-count">{g.symbols.length}</span>
          </summary>
          <ul className="pv-palette-grid" aria-label={g.category}>
            {g.symbols.map((def) => (
              <li key={def.type}>
                <button
                  type="button"
                  className="pv-palette-item"
                  draggable
                  data-symbol-type={def.type}
                  data-testid={`palette-item-${def.type}`}
                  title={def.ref !== undefined ? `${def.ref} · ${def.name}` : def.name}
                  onDragStart={(e) => onDragStart(e, def)}
                  onClick={() => activate(def)}
                >
                  <svg
                    className="pv-palette-preview"
                    viewBox={`-2 -2 ${def.size.width + 4} ${def.size.height + 4}`}
                    aria-hidden="true"
                    focusable="false"
                  >
                    <g
                      className="pv-symbol"
                      dangerouslySetInnerHTML={{ __html: previewMarkup(def) }}
                    />
                  </svg>
                  <span className="pv-palette-name">{def.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
