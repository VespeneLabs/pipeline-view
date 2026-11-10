import { afterEach, describe, expect, it, vi } from 'vitest';
import { Diagram } from '../diagram/diagram';
import { FrameTask } from './frame';

afterEach(() => vi.restoreAllMocks());

describe('FrameTask', () => {
  it('never clears a host timer that happens to share a rAF id', () => {
    const win = {
      requestAnimationFrame: vi.fn(() => 7),
      cancelAnimationFrame: vi.fn(),
    } as unknown as Window;
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const task = new FrameTask(
      () => win,
      () => {},
    );
    task.schedule();
    task.cancel();
    expect(win.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(clear).not.toHaveBeenCalled();
  });

  it('uses and clears a timeout only when rAF is unavailable', () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const fn = vi.fn();
    const task = new FrameTask(() => undefined, fn);
    task.schedule();
    expect(task.pending).toBe(true);
    task.cancel();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(task.pending).toBe(false);
  });

  it('runs once per schedule and can be rescheduled', async () => {
    const fn = vi.fn();
    const task = new FrameTask(() => undefined, fn);
    task.schedule();
    task.schedule();
    await new Promise((r) => setTimeout(r, 5));
    expect(fn).toHaveBeenCalledTimes(1);
    task.schedule();
    await new Promise((r) => setTimeout(r, 5));
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('renderers and host timers (regression: Demo 1 interval never fired)', () => {
  it('a mounted diagram flushing and being destroyed leaves host intervals running', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const d = new Diagram();
    d.load({ version: 1, nodes: [{ id: 'a', type: 'x/y', position: { x: 0, y: 0 } }], links: [] });
    d.mount(container);
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    let fired = 0;
    const id = setInterval(() => fired++, 1);
    d.setNodeData('a', { v: 1 });
    d.renderer!.flush();
    d.overlay!.flush();
    d.destroy();
    await new Promise((r) => setTimeout(r, 20));
    clearInterval(id);
    expect(fired).toBeGreaterThan(0);
    // happy-dom has rAF, so nothing in core should have called clearTimeout at all.
    expect(clear).not.toHaveBeenCalled();
    container.remove();
  });
});
