import { Diagram, type HtmlRenderer, type NodeModel } from '@pipeline-view/core';
import { describe, expectTypeOf, it } from 'vitest';
import {
  PipelineView,
  type NodeRendererEntry,
  type NodeRendererProps,
  type OverlayItem,
  type ReactRenderer,
} from './index';

interface Reading extends Record<string, unknown> {
  value?: number;
  unit?: string;
}

describe('typed renderer data (no casts)', () => {
  it('types data in React overlay renderers, node renderers and core HtmlRenderers', () => {
    const card: ReactRenderer<Reading> = (item) => {
      expectTypeOf(item).toEqualTypeOf<OverlayItem<Reading>>();
      expectTypeOf(item.data?.value).toEqualTypeOf<number | undefined>();
      return null;
    };
    const Tile = (props: NodeRendererProps<Reading>) => {
      expectTypeOf(props.node).toEqualTypeOf<NodeModel<Reading>>();
      expectTypeOf(props.data?.unit).toEqualTypeOf<string | undefined>();
      return null;
    };
    const typed: NodeRendererEntry<Reading> = { component: Tile, sizing: 'content' };
    // Differently typed renderers sit in one map; an untyped map still works as before.
    const untyped: Record<string, NodeRendererEntry> = {
      'app/plain': (p: NodeRendererProps) => (p.selected ? null : null),
    };
    expectTypeOf(PipelineView)
      .parameter(0)
      .toMatchTypeOf<{ renderers?: Record<string, ReactRenderer> }>();
    void (
      <PipelineView
        renderers={{ card }}
        nodeRenderers={{ 'app/tile': typed, 'app/bare': Tile, ...untyped }}
      />
    );

    const html: HtmlRenderer<Reading> = (el, item) => {
      el.textContent = `${item.data?.value ?? ''} ${item.data?.unit ?? ''}`;
    };
    new Diagram({ htmlRenderers: { html } }).destroy();
  });
});
