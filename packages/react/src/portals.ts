import type { DataRecord, HtmlRenderer } from '@pipeline-view/core';
import type { ReactNode } from 'react';

/** What a React overlay renderer receives: the same item core passes to an HtmlRenderer. */
export interface OverlayItem {
  kind: 'node' | 'annotation';
  id: string;
  data: DataRecord | undefined;
  status?: string;
}

/** A React overlay renderer: returns the content for one overlay slot. */
export type ReactRenderer = (item: OverlayItem) => ReactNode;

export interface PortalEntry {
  key: string;
  el: HTMLElement;
  name: string;
  item: OverlayItem;
}

/**
 * Bridges core's imperative HtmlRenderer callbacks to React portals. Core calls `htmlRenderer(name)`
 * when an overlay slot appears or its data changes, and the store keeps one entry per slot. <PipelineView>
 * renders a createPortal per entry, so overlay content keeps the host app's context (theme, i18n, stores).
 */
export class PortalStore {
  private entries = new Map<string, PortalEntry>();
  private snapshot: PortalEntry[] = [];
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): PortalEntry[] => this.snapshot;

  private pending = false;

  /**
   * Coalesces notifications per microtask. One overlay flush calls many renderers, and this turns
   * them into a single snapshot and a single React update. Entries that didn't change keep their
   * object identity, so memoized slots skip re-rendering.
   */
  private emit(): void {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.snapshot = [...this.entries.values()];
      for (const l of this.listeners) l();
    });
  }

  /** An HtmlRenderer for core, bound to a renderer name. */
  htmlRenderer(name: string): HtmlRenderer {
    return (el, item) => {
      const key = `${item.kind}\u0000${item.id}`;
      const isNew = !this.entries.has(key);
      this.entries.set(key, { key, el, name, item: { ...item } });
      this.emit();
      if (!isNew) return;
      return () => {
        if (this.entries.get(key)?.el === el) {
          this.entries.delete(key);
          this.emit();
        }
      };
    };
  }
}
