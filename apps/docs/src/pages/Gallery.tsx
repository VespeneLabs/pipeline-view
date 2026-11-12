import { nodePorts, nodeSize, type SymbolDef } from '@pipeline-view/core';
import {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  gasSymbols,
  pidSymbols,
  processSymbols,
} from '@pipeline-view/symbols';
import { useState } from 'react';
import './gallery.css';

interface Pack {
  id: string;
  label: string;
  defs: SymbolDef[];
  /** One line under each section title, in section order (the five gas sections, then process equipment). */
  notes: string[];
}

const TITLES = [VALVES, ACTUATION, EQUIPMENT, INSTRUMENTATION, PIPING, PROCESS];

const PACKS: Pack[] = [
  {
    id: 'reference',
    label: 'Reference set',
    defs: [...gasSymbols, ...processSymbols],
    notes: [
      'Body geometry · actuator shown separately unless specified',
      'Body + actuator combinations and pressure-protection devices',
      'Compression, separation, filtration and heat transfer',
      'Field-mounted bubbles unless noted · tag letters and loop number come from data',
      'Process connections, inline elements and signal conventions',
      'Equipment from the process diagram (tank, pump, control valve)',
    ],
  },
  {
    id: 'extended',
    label: 'Extended P&ID',
    defs: pidSymbols,
    notes: [
      'More body types · the body is drawn filled when closed',
      'More body + actuator combinations, actuator details and pilot-operated relief',
      'Compressors and drivers, heat transfer, separation and vessel internals',
      'Flow and metering elements, field devices and bubbles by location',
      'Piping specials, strainers and silencers, end connections, line and signal types',
      'Pumps, storage, cooling towers, columns and dampers',
    ],
  },
];

export function SymbolCard({ def, showPorts }: { def: SymbolDef; showPorts: boolean }) {
  const { width, height } = nodeSize(def);
  return (
    <figure className="symbol-card" data-type={def.type}>
      {def.ref !== undefined && (
        <span className="symbol-ref">{String(def.ref).padStart(2, '0')}</span>
      )}
      <svg
        className="symbol-art"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={def.name}
      >
        {/* Trusted markup from @pipeline-view/symbols. */}
        <g dangerouslySetInnerHTML={{ __html: def.svg ?? def.render?.({ data: {} }) ?? '' }} />
        {showPorts &&
          nodePorts(def).map((p) => (
            <circle key={p.id} className="symbol-port" cx={p.position.x} cy={p.position.y} r={3.5}>
              <title>{`${p.id} · ${p.direction}${p.accepts ? ` · ${p.accepts.join(', ')}` : ''}`}</title>
            </circle>
          ))}
      </svg>
      <figcaption>
        {def.name}
        <code>{def.type}</code>
      </figcaption>
    </figure>
  );
}

export function Gallery() {
  const [showPorts, setShowPorts] = useState(true);
  const [query, setQuery] = useState('');
  const [packId, setPackId] = useState(PACKS[0]!.id);
  const pack = PACKS.find((p) => p.id === packId) ?? PACKS[0]!;
  const q = query.trim().toLowerCase();
  const matches = (d: SymbolDef) =>
    !q || [d.name, d.type, ...(d.keywords ?? [])].some((s) => s.toLowerCase().includes(q));

  const sections = TITLES.map((title, i) => ({ title, note: pack.notes[i]!, index: i + 1 }));

  return (
    <>
      <h1>Symbol gallery</h1>
      <p className="lede">
        All {gasSymbols.length} gas-service P&amp;ID symbols from{' '}
        <code>@pipeline-view/symbols</code>, numbered as in the Figma reference, plus the process
        equipment. The extended pack adds {pidSymbols.length} more from the ISA-5.1 and oil-and-gas
        legends. Dots mark the named ports.
      </p>
      <div className="gallery-toolbar">
        <div className="gallery-packs" role="group" aria-label="Symbol pack">
          {PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === pack.id}
              onClick={() => setPackId(p.id)}
            >
              {p.label} <span>{p.defs.length}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Filter symbols"
          aria-label="Filter symbols"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={showPorts}
            onChange={(e) => setShowPorts(e.target.checked)}
          />
          Show ports
        </label>
      </div>
      {sections.map((s) => {
        const defs = pack.defs.filter((d) => d.category === s.title && matches(d));
        if (defs.length === 0) return null;
        const refs = defs.map((d) => d.ref).filter((r): r is number => r !== undefined);
        return (
          <section key={s.title} className="gallery-section" aria-labelledby={`sec-${s.index}`}>
            <header>
              <h2 id={`sec-${s.index}`}>
                <span>{String(s.index).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <p>{s.note}</p>
              {refs.length > 0 && (
                <span className="gallery-range">
                  {String(Math.min(...refs)).padStart(2, '0')}—
                  {String(Math.max(...refs)).padStart(2, '0')}
                </span>
              )}
            </header>
            <div className="gallery-grid">
              {defs.map((d) => (
                <SymbolCard key={d.type} def={d} showPorts={showPorts} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
