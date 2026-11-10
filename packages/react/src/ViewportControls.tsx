import { DEFAULT_MAX_ZOOM, DEFAULT_MIN_ZOOM, type Diagram } from '@pipeline-view/core';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from './hooks';
import { useDiagram } from './PipelineView';

type Label = 'group' | 'zoomIn' | 'zoomOut' | 'fit' | 'reset' | 'lock' | 'unlock';

const LABELS: Record<Label, string> = {
  group: 'Viewport',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to diagram',
  reset: 'Reset view',
  lock: 'Lock view',
  unlock: 'Unlock view',
};

export interface ViewportControlsProps {
  /** Defaults to the nearest <PipelineView>'s diagram. */
  diagram?: Diagram | null;
  /** Zoom factor per click. Default 1.25. */
  step?: number;
  /** Show a "reset" button (back to `initialViewport`, or a fit). Default true. */
  reset?: boolean;
  /** Show a lock toggle that stops user pan and zoom. Default false. */
  lock?: boolean;
  /** Override button labels (they're also the accessible names). */
  labels?: Partial<Record<Label, string>>;
  /** Render inside the diagram's corner (default) instead of in place. */
  inDiagram?: boolean;
  className?: string;
}

/** Accessible zoom in/out, fit, reset and lock buttons (FR-47). Styled by `.pv-viewport-controls`. */
export function ViewportControls(props: ViewportControlsProps) {
  const ctx = useDiagram();
  const d = props.diagram ?? ctx;
  const vp = useViewport(d);
  // The diagram owns the lock; re-render after toggling it.
  const [, rerender] = useState(0);
  if (!d || !vp) return null;
  const locked = d.isViewportLocked();

  const label = (k: Label) => props.labels?.[k] ?? LABELS[k];
  const min = d.options.minZoom ?? DEFAULT_MIN_ZOOM;
  const max = d.options.maxZoom ?? DEFAULT_MAX_ZOOM;
  const step = props.step ?? 1.25;

  /** Zooms around the visible center. */
  const zoom = (factor: number) => {
    const r = d.view?.root;
    const mid = { x: (r?.clientWidth ?? 0) / 2, y: (r?.clientHeight ?? 0) / 2 };
    const at = d.screenToDiagram(mid);
    const z = Math.min(max, Math.max(min, vp.zoom * factor));
    d.setViewport({ zoom: z, x: mid.x - at.x * z, y: mid.y - at.y * z }, { animate: true });
  };
  const reset = () => {
    const initial = d.options.initialViewport;
    if (initial) d.setViewport(initial, { animate: true });
    else d.zoomToFit({ animate: true });
  };
  const toggleLock = () => {
    d.lockViewport(!locked);
    rerender((n) => n + 1);
  };

  const bar = (
    <div
      role="toolbar"
      aria-label={label('group')}
      aria-orientation="vertical"
      className={['pv-viewport-controls', props.className].filter(Boolean).join(' ')}
    >
      <Button
        label={label('zoomIn')}
        disabled={locked || vp.zoom >= max}
        onClick={() => zoom(step)}
      >
        <path d="M8 3v10M3 8h10" />
      </Button>
      <Button
        label={label('zoomOut')}
        disabled={locked || vp.zoom <= min}
        onClick={() => zoom(1 / step)}
      >
        <path d="M3 8h10" />
      </Button>
      <Button label={label('fit')} disabled={locked} onClick={() => d.zoomToFit({ animate: true })}>
        <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
      </Button>
      {props.reset !== false && (
        <Button label={label('reset')} disabled={locked} onClick={reset}>
          <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2v3h3" />
        </Button>
      )}
      {props.lock && (
        <Button label={label(locked ? 'unlock' : 'lock')} pressed={locked} onClick={toggleLock}>
          <rect x="3.5" y="7" width="9" height="7" rx="1.5" />
          <path d={locked ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7'} />
        </Button>
      )}
    </div>
  );
  const host = props.inDiagram !== false ? d.view?.root : undefined;
  return host ? createPortal(bar, host) : bar;
}

function Button(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {props.children}
      </svg>
    </button>
  );
}
