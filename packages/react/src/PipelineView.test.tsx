import type { Diagram, DiagramModel } from '@pipeline-view/core';
import { act, cleanup, render } from '@testing-library/react';
import { StrictMode, createRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PipelineView, useDiagram } from './PipelineView';
import { useHistory, useSelection } from './hooks';

const model = (): DiagramModel => ({
  version: 1,
  nodes: [
    { id: 'a', type: 'x/box', position: { x: 0, y: 0 } },
    { id: 'b', type: 'x/box', position: { x: 100, y: 0 } },
  ],
  links: [],
});

afterEach(cleanup);

describe('<PipelineView>', () => {
  it('renders on the server without touching the DOM', () => {
    expect(() => renderToString(<PipelineView model={model()} />)).not.toThrow();
  });

  it('mounts a diagram, exposes it through ref and onReady, and loads the model', () => {
    const ref = createRef<Diagram>();
    const onReady = vi.fn();
    const { container } = render(<PipelineView ref={ref} model={model()} onReady={onReady} />);
    expect(container.querySelector('.pv-root')).not.toBeNull();
    expect(ref.current).toBe(onReady.mock.calls[0]![0]);
    expect(ref.current!.toJSON().nodes).toHaveLength(2);
  });

  it('survives StrictMode double effects with exactly one root', () => {
    const { container } = render(
      <StrictMode>
        <PipelineView model={model()} />
      </StrictMode>,
    );
    expect(container.querySelectorAll('.pv-root')).toHaveLength(1);
  });

  it('does not reload a model it emitted itself (controlled usage)', () => {
    const ref = createRef<Diagram>();
    function Controlled() {
      const [m, setM] = useState(model);
      return <PipelineView ref={ref} model={m} onModelChange={(e) => setM(e.model)} />;
    }
    render(<Controlled />);
    const load = vi.spyOn(ref.current!, 'load');
    act(() => ref.current!.update((tx) => tx.updateNode('a', { label: 'A' })));
    expect(load).not.toHaveBeenCalled();
    expect(ref.current!.canUndo()).toBe(true);
  });

  it('patches a new version of the same document instead of reloading it', () => {
    const ref = createRef<Diagram>();
    const { rerender } = render(<PipelineView ref={ref} model={model()} />);
    act(() => ref.current!.setSelection([{ kind: 'node', id: 'b' }]));
    const load = vi.spyOn(ref.current!, 'load');
    const next = model();
    next.nodes[0]!.position = { x: 0, y: 50 };
    rerender(<PipelineView ref={ref} model={next} />);
    expect(load).not.toHaveBeenCalled();
    expect(ref.current!.toJSON().nodes[0]!.position).toEqual({ x: 0, y: 50 });
    expect(ref.current!.getSelection()).toEqual([{ kind: 'node', id: 'b' }]);
  });

  it('reloads when the host passes a new model', () => {
    const ref = createRef<Diagram>();
    const { rerender } = render(<PipelineView ref={ref} model={model()} />);
    // A different document (no shared ids) is loaded from scratch.
    const next = {
      ...model(),
      nodes: [{ id: 'z', type: 'x/box', position: { x: 0, y: 0 } }],
      links: [],
    };
    const load = vi.spyOn(ref.current!, 'load');
    rerender(<PipelineView ref={ref} model={next} />);
    expect(load).toHaveBeenCalledTimes(1);
    expect(ref.current!.toJSON().nodes.map((n) => n.id)).toEqual(['z']);
  });

  it('forwards events to the latest handler props and syncs mode/theme', () => {
    const ref = createRef<Diagram>();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, container } = render(
      <PipelineView ref={ref} model={model()} onSelectionChange={first} mode="view" />,
    );
    rerender(
      <PipelineView
        ref={ref}
        model={model()}
        onSelectionChange={second}
        mode="edit"
        theme="dark"
      />,
    );
    act(() => ref.current!.setSelection([{ kind: 'node', id: 'a' }]));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    const root = container.querySelector('.pv-root') as HTMLElement;
    expect(root.dataset.mode).toBe('edit');
    expect(root.dataset.theme).toBe('dark');
  });

  it('attaches the editor so mode="edit" edits (Delete removes the selection)', () => {
    const ref = createRef<Diagram>();
    const m = model(); // stable identity: a new object would be reloaded, clearing the selection
    const { container, rerender } = render(<PipelineView ref={ref} model={m} mode="view" />);
    const root = container.querySelector('.pv-root') as HTMLElement;
    act(() => ref.current!.setSelection([{ kind: 'node', id: 'a' }]));
    const del = () =>
      root.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
      );
    act(del);
    expect(ref.current!.toJSON().nodes).toHaveLength(2); // view mode: no editing
    rerender(<PipelineView ref={ref} model={m} mode="edit" />);
    act(del);
    expect(ref.current!.toJSON().nodes.map((n) => n.id)).toEqual(['b']);
  });

  it('renders React overlay renderers through portals with live updates and cleanup', async () => {
    const ref = createRef<Diagram>();
    const Card = ({ value }: { value: unknown }) => <b className="card">{String(value)}</b>;
    render(
      <PipelineView
        ref={ref}
        model={model()}
        renderers={{ card: (item) => <Card value={item.data?.value} /> }}
      />,
    );
    const slot = document.createElement('div');
    document.body.append(slot);
    const bridge = ref.current!.options.htmlRenderers!.card!;
    expect(ref.current!.options.htmlRenderers!.nope).toBeUndefined();
    let dispose: void | (() => void);
    await act(async () => {
      dispose = bridge(slot, { kind: 'annotation', id: 'r1', data: { value: 1 } });
    });
    expect(slot.querySelector('.card')!.textContent).toBe('1');
    await act(async () => {
      bridge(slot, { kind: 'annotation', id: 'r1', data: { value: 2 } });
    });
    expect(slot.querySelectorAll('.card')).toHaveLength(1);
    expect(slot.querySelector('.card')!.textContent).toBe('2');
    await act(async () => (dispose as () => void)());
    expect(slot.querySelector('.card')).toBeNull();
    slot.remove();
  });
});

describe('overlay integration', () => {
  it('mounts a React card for an anchored HTML annotation and updates it with live data', async () => {
    const ref = createRef<Diagram>();
    const m: DiagramModel = {
      ...model(),
      annotations: [
        {
          id: 'r',
          kind: 'html',
          renderer: 'card',
          position: { x: 0, y: -40 },
          anchor: { node: 'a' },
        },
      ],
    };
    const { container } = render(
      <PipelineView
        ref={ref}
        model={m}
        renderers={{ card: (item) => <span className="card">{String(item.data?.value)}</span> }}
      />,
    );
    await act(async () => {
      ref.current!.setNodeData('a', { value: 42 });
      ref.current!.overlay!.flush();
    });
    const card = container.querySelector('.pv-overlay [data-annotation-id="r"] .card');
    expect(card!.textContent).toBe('42');
  });
});

describe('hooks', () => {
  it('useDiagram, useSelection and useHistory follow the diagram', () => {
    const seen: { sel: number; undo: boolean; ready: boolean }[] = [];
    let api: Diagram | null = null;
    function Probe() {
      const d = useDiagram();
      api = d;
      const sel = useSelection();
      const { canUndo } = useHistory();
      seen.push({ sel: sel.length, undo: canUndo, ready: !!d });
      return null;
    }
    render(
      <PipelineView model={model()}>
        <Probe />
      </PipelineView>,
    );
    expect(seen.at(-1)).toEqual({ sel: 0, undo: false, ready: true });
    act(() => api!.setSelection([{ kind: 'node', id: 'b' }]));
    expect(seen.at(-1)!.sel).toBe(1);
    act(() => api!.update((tx) => tx.updateNode('a', { label: 'x' })));
    expect(seen.at(-1)!.undo).toBe(true);
  });
});
