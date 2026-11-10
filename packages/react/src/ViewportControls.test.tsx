import type { Diagram, DiagramModel } from '@pipeline-view/core';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineView } from './PipelineView';
import { ViewportControls } from './ViewportControls';

const model: DiagramModel = {
  version: 2,
  nodes: [
    { id: 'a', type: 'x/box', position: { x: 0, y: 0 } },
    { id: 'b', type: 'x/box', position: { x: 400, y: 300 } },
  ],
  links: [],
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = (props: Parameters<typeof ViewportControls>[0] = {}) => {
  const ref = createRef<Diagram>();
  const utils = render(
    <PipelineView
      ref={ref}
      model={model}
      fitOnLoad={false}
      initialViewport={{ x: 0, y: 0, zoom: 1 }}
    >
      <ViewportControls {...props} />
    </PipelineView>,
  );
  const button = (name: string) => utils.getByRole('button', { name }) as HTMLButtonElement;
  return { ref, ...utils, button };
};

describe('<ViewportControls>', () => {
  it('renders an accessible toolbar inside the diagram root', () => {
    const { container, getByRole } = setup();
    const bar = getByRole('toolbar', { name: 'Viewport' });
    expect(container.querySelector('.pv-root')!.contains(bar)).toBe(true);
    for (const name of ['Zoom in', 'Zoom out', 'Fit to diagram', 'Reset view']) {
      expect(getByRole('button', { name })).toBeTruthy();
    }
  });

  it('zooms around the center and resets to initialViewport', async () => {
    const { ref, button } = setup();
    const settle = () => act(() => new Promise((r) => setTimeout(r, 350))); // 250 ms animation
    act(() => fireEvent.click(button('Zoom in')));
    await settle();
    const v = ref.current!.getViewport();
    expect(v.zoom).toBeCloseTo(1.25);
    expect(ref.current!.screenToDiagram({ x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
    act(() => fireEvent.click(button('Reset view')));
    await settle();
    expect(ref.current!.getViewport()).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('lock toggles user pan/zoom and disables the zoom buttons', () => {
    const { ref, button } = setup({ lock: true });
    act(() => fireEvent.click(button('Lock view')));
    expect(ref.current!.isViewportLocked()).toBe(true);
    expect(button('Unlock view').getAttribute('aria-pressed')).toBe('true');
    expect(button('Zoom in').disabled).toBe(true);
    act(() => fireEvent.click(button('Unlock view')));
    expect(ref.current!.isViewportLocked()).toBe(false);
  });

  it('accepts custom labels', () => {
    const { getByRole } = setup({ labels: { zoomIn: 'Vergrößern' } });
    expect(getByRole('button', { name: 'Vergrößern' })).toBeTruthy();
  });
});
