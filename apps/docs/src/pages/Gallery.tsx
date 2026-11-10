import type { SymbolDef } from '@pipeline-view/core';
import {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  gasSymbols,
  processSymbols,
} from '@pipeline-view/symbols';
import { useState } from 'react';
import './gallery.css';

const SECTIONS = [
  { title: VALVES, note: 'Body geometry · actuator shown separately unless specified' },
  { title: ACTUATION, note: 'Body + actuator combinations and pressure-protection devices' },
  { title: EQUIPMENT, note: 'Compression, separation, filtration and heat transfer' },
  {
    title: INSTRUMENTATION,
    note: 'Field-mounted bubbles unless noted · tag letters and loop number come from data',
  },
  { title: PIPING, note: 'Process connections, inline elements and signal conventions' },
];

const all = [...gasSymbols, ...processSymbols];

export function SymbolCard({ def, showPorts }: { def: SymbolDef; showPorts: boolean }) {
  const { width, height } = def.size;
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
          def.ports.map((p) => (
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
  const q = query.trim().toLowerCase();
  const matches = (d: SymbolDef) =>
    !q || [d.name, d.type, ...(d.keywords ?? [])].some((s) => s.toLowerCase().includes(q));

  const sections = [
    ...SECTIONS.map((s, i) => ({ ...s, index: i + 1 })),
    {
      title: PROCESS,
      note: 'Equipment from the process diagram (tank, pump, control valve)',
      index: 6,
    },
  ];

  return (
    <>
      <h1>Symbol gallery</h1>
      <p className="lede">
        All {gasSymbols.length} gas-service P&amp;ID symbols from{' '}
        <code>@pipeline-view/symbols</code>, numbered as in the Figma reference, plus the process
        equipment. Dots mark the named ports.
      </p>
      <div className="gallery-toolbar">
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
        const defs = all.filter((d) => d.category === s.title && matches(d));
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
