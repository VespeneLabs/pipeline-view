// @vitest-environment node
/**
 * SSR safety (PRD: "safe to import during SSR, render on the client only"). This runs in plain Node with
 * no DOM globals: importing and using every headless API must work.
 */
import { describe, expect, it } from 'vitest';

describe('core in a DOM-less environment', () => {
  it('has no DOM globals here (sanity)', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('imports and runs every headless API without touching the DOM', async () => {
    const core = await import('./index');
    const d = new core.Diagram({ grid: { size: 10, snap: true, visible: true } });
    d.load({
      version: 1,
      nodes: [
        { id: 'a', type: 'x/y', position: { x: 0, y: 0 } },
        { id: 'b', type: 'x/y', position: { x: 100, y: 0 } },
      ],
      links: [
        { id: 'l', from: { node: 'a', port: 'p' }, to: { node: 'b', port: 'p' }, kind: 'process' },
      ],
    });
    d.update((tx) => tx.updateNode('a', { label: 'A' }));
    d.setNodeData('b', { v: 1 }, 'alarm');
    d.undo();
    d.zoomToFit();
    d.setViewport({ zoom: 2 }, { animate: true });
    expect(d.getBounds().width).toBeGreaterThan(0);
    expect(d.getLinkPath('l')).toBeUndefined();
    expect(() => d.exportSVG()).toThrow(/mounted/);
    const r = core.createRouter();
    r.setObstacles(new Map());
    expect(r.route([]).length).toBe(0);
    d.destroy();
  });
});
