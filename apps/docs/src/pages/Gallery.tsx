import { nodePorts, nodeSize, previewNode, type SymbolDef } from '@pipeline-view/core';
import {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  type InstrumentBubbleData,
  gasSymbols,
  instrumentBubble,
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

const BUILDER = 'bubbles';

const DEVICES = ['discrete', 'shared', 'computer', 'plc'] as const;
const LOCATIONS = ['field', 'panel', 'behind-panel', 'local-panel', 'behind-local-panel'] as const;

/** What the generic instrument bubble draws from its data: every device in every location, then the rest. */
const BUBBLE_SECTIONS: { title: string; note: string; items: InstrumentBubbleData[] }[] = [
  {
    title: 'Device × location',
    note: 'device picks the outline, location the line through it',
    items: DEVICES.flatMap((device) =>
      LOCATIONS.map((location) => ({ letters: 'FIC', loop: 101, device, location })),
    ),
  },
  {
    title: 'Letters, qualifiers and mounting',
    note: 'any tag letters · short texts outside the bubble · on a tap, in the line or on its own',
    items: [
      { letters: 'PT' },
      { letters: 'PDIT', loop: 2040 },
      { letters: 'LSHH', high: 'HH' },
      { letters: 'PA', high: 'H', low: 'L', device: 'shared', location: 'panel' },
      { letters: 'AT', loop: 7, high: 'CH₄' },
      { letters: 'FT', loop: 12, mounting: 'inline' },
      { letters: 'TIC', loop: 30, location: 'panel', mounting: 'none' },
      { letters: 'YC', device: 'plc', location: 'local-panel', mounting: 'none' },
    ],
  },
];

function BubbleCard({ data, showPorts }: { data: InstrumentBubbleData; showPorts: boolean }) {
  const node = { ...previewNode(instrumentBubble), data };
  const { width, height } = nodeSize(instrumentBubble, node);
  const code = Object.entries(data)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`)
    .join(', ');
  return (
    <figure className="symbol-card" data-type={instrumentBubble.type}>
      {/* Qualifiers are written outside the symbol's box: don't clip them. */}
      <svg
        className="symbol-art"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        overflow="visible"
        role="img"
        aria-label={code}
      >
        {/* Trusted markup from @pipeline-view/symbols. */}
        <g dangerouslySetInnerHTML={{ __html: instrumentBubble.render!({ data }) }} />
        {showPorts &&
          nodePorts(instrumentBubble, node).map((p) => (
            <circle key={p.id} className="symbol-port" cx={p.position.x} cy={p.position.y} r={3.5}>
              <title>{`${p.id} · ${p.direction}${p.accepts ? ` · ${p.accepts.join(', ')}` : ''}`}</title>
            </circle>
          ))}
      </svg>
      <figcaption>
        <code>{code}</code>
      </figcaption>
    </figure>
  );
}

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
        legends, and one symbol, <code>{instrumentBubble.type}</code>, draws every instrument bubble
        from its data. Dots mark the named ports.
      </p>
      <div className="gallery-toolbar">
        <div className="gallery-packs" role="group" aria-label="Symbol pack">
          {PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === packId}
              onClick={() => setPackId(p.id)}
            >
              {p.label} <span>{p.defs.length}</span>
            </button>
          ))}
          <button
            type="button"
            aria-pressed={packId === BUILDER}
            onClick={() => setPackId(BUILDER)}
          >
            Instrument bubble <span>1</span>
          </button>
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
      {packId === BUILDER &&
        BUBBLE_SECTIONS.map((s, i) => {
          const items = s.items.filter(
            (d) => !q || Object.values(d).some((v) => String(v).toLowerCase().includes(q)),
          );
          if (items.length === 0) return null;
          return (
            <section key={s.title} className="gallery-section" aria-labelledby={`bub-${i}`}>
              <header>
                <h2 id={`bub-${i}`}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {s.title}
                </h2>
                <p>{s.note}</p>
              </header>
              <div className="gallery-grid">
                {items.map((d) => (
                  <BubbleCard key={JSON.stringify(d)} data={d} showPorts={showPorts} />
                ))}
              </div>
            </section>
          );
        })}
      {sections.map((s) => {
        if (packId === BUILDER) return null;
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
