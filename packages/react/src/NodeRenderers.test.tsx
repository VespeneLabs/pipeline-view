import type { Diagram, DiagramModel, SymbolDef } from '@pipeline-view/core';
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PipelineView, type NodeRendererProps } from './PipelineView';

afterEach(cleanup);

const card: SymbolDef = {
  type: 'app/card',
  name: 'Card',
  category: 'App',
  size: { width: 100, height: 50 },
  ports: [
    { id: 'in', position: { x: 0, y: 25 }, direction: 'left' },
    { id: 'out', position: { x: 100, y: 25 }, direction: 'right' },
  ],
};

const model = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'c1', type: 'app/card', position: { x: 0, y: 0 }, data: { value: 1 } },
    { id: 'c2', type: 'app/card', position: { x: 300, y: 0 }, data: { value: 2 } },
  ],
  links: [
    { id: 'l', from: { node: 'c1', port: 'out' }, to: { node: 'c2', port: 'in' }, kind: 'process' },
  ],
});

describe('nodeRenderers (FR-45)', () => {
  it('renders React inside each node box, with ports drawn by the library', async () => {
    const ref = createRef<Diagram>();
    const Card = ({ node, data, ports, selected }: NodeRendererProps) => (
      <div className="card" data-selected={selected}>
        {node.id}:{String(data?.value)}:{ports.map((p) => p.id).join(',')}
      </div>
    );
    const { container } = render(
      <PipelineView
        ref={ref}
        model={model()}
        symbols={[card]}
        nodeRenderers={{ 'app/card': Card }}
      />,
    );
    await act(async () => {
      ref.current!.renderer!.flush();
      ref.current!.overlay!.flush();
    });
    const slot = container.querySelector('.pv-overlay [data-node-id="c1"]') as HTMLElement;
    expect(slot.classList.contains('pv-node-html')).toBe(true);
    expect(slot.style.width).toBe('100px'); // fixed sizing: the node's box
    expect(slot.textContent).toBe('c1:1:in,out');
    expect(container.querySelectorAll('[data-node-id="c1"] .pv-port')).toHaveLength(2);
  });

  it('re-renders only the node whose data changed, and reflects selection', async () => {
    const ref = createRef<Diagram>();
    const renders: string[] = [];
    const Card = ({ node, data, selected }: NodeRendererProps) => {
      renders.push(node.id);
      return <span data-selected={String(selected)}>{String(data?.value)}</span>;
    };
    const { container } = render(
      <PipelineView
        ref={ref}
        model={model()}
        symbols={[card]}
        nodeRenderers={{ 'app/card': Card }}
      />,
    );
    await act(async () => ref.current!.overlay!.flush());
    renders.length = 0;
    await act(async () => {
      ref.current!.setNodeData('c2', { value: 9 });
      ref.current!.overlay!.flush();
    });
    expect(renders).toEqual(['c2']);
    expect(container.querySelector('.pv-overlay [data-node-id="c2"]')!.textContent).toBe('9');
    renders.length = 0;
    await act(async () => ref.current!.setSelection([{ kind: 'node', id: 'c1' }]));
    expect(renders).toEqual(['c1']);
    expect(
      container
        .querySelector('.pv-overlay [data-node-id="c1"] span')!
        .getAttribute('data-selected'),
    ).toBe('true');
  });

  it('content sizing: the measured size drives bounds and scales the ports', async () => {
    const ref = createRef<Diagram>();
    const Card = () => <div>content</div>;
    let width = 200;
    let height = 80;
    const offsets = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('pv-node-html') ? width : 0;
      });
    const offsetsH = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('pv-node-html') ? height : 0;
      });
    const { container } = render(
      <PipelineView
        ref={ref}
        model={model()}
        symbols={[card]}
        nodeRenderers={{ 'app/card': { component: Card, sizing: 'content' } }}
      />,
    );
    await act(async () => {
      ref.current!.overlay!.flush();
      ref.current!.renderer!.flush();
    });
    const slot = container.querySelector('.pv-overlay [data-node-id="c1"]') as HTMLElement;
    expect(slot.style.width).toBe(''); // natural size
    expect(ref.current!.getBounds().height).toBe(80);
    const out = container.querySelector('[data-node-id="c1"] [data-port-id="out"]')!;
    expect(out.getAttribute('cx')).toBe('200'); // right edge of the measured box
    expect(out.getAttribute('cy')).toBe('40');
    expect(ref.current!.getLinkPath('l')![0]).toEqual({ x: 200, y: 40 });
    expect(ref.current!.canUndo()).toBe(false); // measuring is view state, not an edit

    // The content grows: the next measurement moves the port and the route (no stale cached size).
    width = 260;
    height = 100;
    await act(async () => {
      ref.current!.setMeasuredSize('c1', { width, height });
      ref.current!.renderer!.flush();
    });
    expect(out.getAttribute('cx')).toBe('260');
    expect(out.getAttribute('cy')).toBe('50');
    expect(ref.current!.getLinkPath('l')![0]).toEqual({ x: 260, y: 50 });
    offsets.mockRestore();
    offsetsH.mockRestore();
  });
});
