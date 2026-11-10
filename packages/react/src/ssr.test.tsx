// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('react bindings in a DOM-less environment', () => {
  it('server-renders <PipelineView> with children and hooks', async () => {
    expect(typeof document).toBe('undefined');
    const { renderToString } = await import('react-dom/server');
    const { PipelineView, SymbolPalette, useSelection, useHistory, useViewport } =
      await import('./index');
    function Probe() {
      const sel = useSelection();
      const { canUndo } = useHistory();
      const vp = useViewport();
      return <span data-probe>{`${sel.length}:${canUndo}:${vp === null}`}</span>;
    }
    const html = renderToString(
      <PipelineView model={{ version: 1, nodes: [], links: [] }} mode="edit" className="plant">
        <Probe />
        <SymbolPalette />
      </PipelineView>,
    );
    expect(html).toContain('class="plant"');
    expect(html).toContain('0:false:true');
  });
});
