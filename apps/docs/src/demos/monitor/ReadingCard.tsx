/**
 * Reference reading card (PRD FR-17). Demo-only: copy it into your app and adapt it.
 * It is deliberately not part of the library, which knows nothing about statuses.
 */
export type DemoStatus = 'normal' | 'warning' | 'alarm' | 'stale';

/** Example status vocabulary. Each state pairs a glyph and text with colour, never colour alone. */
export const STATUS_TEXT: Record<DemoStatus, { glyph: string; text: string }> = {
  normal: { glyph: '●', text: 'Within range' },
  warning: { glyph: '△', text: 'Low temperature' },
  alarm: { glyph: '!', text: 'Low flow' },
  stale: { glyph: '○', text: 'No data' },
};

export interface ReadingCardProps {
  tag: string;
  value: number;
  unit: string;
  decimals?: number;
  status: DemoStatus;
  /** Overrides the default status message, for example "High pressure". */
  message?: string;
}

export function ReadingCard({ tag, value, unit, decimals = 1, status, message }: ReadingCardProps) {
  const s = STATUS_TEXT[status];
  const stale = status === 'stale';
  return (
    <div className="reading-card" data-status={status} role="group" aria-label={tag}>
      <div className="reading-card__tag">{tag}</div>
      <div className="reading-card__value">
        <span>{stale ? '—' : value.toFixed(decimals)}</span>
        <span className="reading-card__unit">{unit}</span>
      </div>
      <div className="reading-card__status" role="status">
        <span aria-hidden>{s.glyph}</span> {message ?? s.text}
      </div>
    </div>
  );
}

export function PumpState({ running }: { running: boolean }) {
  return (
    <div className="pump-state" data-status={running ? 'normal' : 'stale'}>
      <span aria-hidden>{running ? '●' : '○'}</span> {running ? 'Running' : 'Stopped'}
    </div>
  );
}
