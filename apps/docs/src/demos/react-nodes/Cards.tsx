import type { NodeRendererProps } from '@pipeline-view/react';
import { useEffect, useRef } from 'react';
import { statusOf, type ReadingData, type UnitData } from './model';

/**
 * Counts this card's committed renders and writes the number into the returned element, to show that a
 * data tick re-renders only the nodes it touched. Written from an effect, so render stays pure.
 */
function useRenderCount<T extends HTMLElement>(suffix = '') {
  const el = useRef<T>(null);
  const count = useRef(0);
  useEffect(() => {
    count.current += 1;
    if (el.current) el.current.textContent = `renders: ${count.current}${suffix}`;
  });
  return el;
}

function Trend({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${20 - ((v - min) / span) * 18 - 1}`)
    .join(' ');
  return (
    <svg className="rn-trend" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} />
    </svg>
  );
}

/** Content-sized: the card is as wide as its text, and the library moves the port to match. */
export function ReadingCard({ data, selected }: NodeRendererProps) {
  const renders = useRenderCount<HTMLSpanElement>();
  const d = data as ReadingData;
  const status = statusOf(d);
  return (
    <div
      className="rn-card rn-reading"
      data-status={status}
      data-selected={selected}
      role="group"
      aria-label={`${d.tag} ${d.label}: ${d.value.toFixed(d.decimals)} ${d.unit}, ${status}`}
    >
      <div className="rn-head">
        <b>{d.tag}</b>
        <span>{d.label}</span>
      </div>
      <div className="rn-value">
        {d.value.toFixed(d.decimals)}
        <small>{d.unit}</small>
      </div>
      <Trend values={d.history} />
      <span ref={renders} className="rn-renders" data-testid={`renders-${d.tag}`} />
    </div>
  );
}

/** Fixed size: fills the node's declared 180 × 100 box. */
export function UnitCard({ data, selected, ports }: NodeRendererProps) {
  const renders = useRenderCount<HTMLSpanElement>(` · ${ports.length} ports`);
  const d = data as UnitData;
  return (
    <div className="rn-card rn-unit" data-selected={selected}>
      <div className="rn-head">
        <b>{d.title}</b>
      </div>
      <dl>
        <dt>In</dt>
        <dd>{d.inlet.toFixed(1)} °C</dd>
        <dt>Out</dt>
        <dd>{d.outlet.toFixed(1)} °C</dd>
        <dt>ΔT</dt>
        <dd>{(d.outlet - d.inlet).toFixed(1)} K</dd>
      </dl>
      <span ref={renders} className="rn-renders" data-testid="renders-E-101" />
    </div>
  );
}
