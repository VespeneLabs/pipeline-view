import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { SymbolDef } from '../symbols/types';
import { attachEditor, getEditor } from './controller';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Test',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left', role: 'in', maxLinks: 1 },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right', role: 'out', label: 'Outlet' },
  ],
};

let container: HTMLDivElement;
let d: Diagram;
let detach: () => void;
const live = () => d.view!.root.querySelector('.pv-live')!.textContent;
const key = (k: string, shiftKey = false) =>
  d.view!.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [valve], mode: 'edit', directed: true, noSelfLoops: true });
  d.load({
    version: 2,
    nodes: [
      { id: 'a', type: 'test/valve', position: { x: 0, y: 0 }, label: 'V-1' },
      { id: 'b', type: 'test/valve', position: { x: 100, y: 0 }, label: 'V-2' },
      { id: 'c', type: 'test/valve', position: { x: 400, y: 0 }, label: 'V-3' },
    ],
    links: [],
  });
  d.mount(container);
  detach = attachEditor(d);
});

afterEach(() => {
  detach();
  d.destroy();
  container.remove();
});

describe('keyboard connect (FR-54)', () => {
  it('chooses a source port, cycles compatible targets nearest first, and connects', () => {
    d.setSelection([{ kind: 'node', id: 'a' }]);
    key('c');
    expect(getEditor(d)!.isConnecting()).toBe(true);
    expect(live()).toContain('Connect from V-1');
    expect(live()).toContain('port in of V-1 (Valve)');
    key('Tab');
    expect(live()).toBe('port Outlet of V-1 (Valve), 2 of 2.');
    key('Enter');
    // a.out can only reach inlets (directed): b.in (nearest) and c.in.
    expect(live()).toBe(
      '2 compatible ports. port in of V-2 (Valve), 1 of 2. Press Enter to connect.',
    );
    expect(d.view!.layers.interaction.querySelector('.pv-kb-port')).not.toBeNull();
    key('ArrowDown');
    expect(live()).toBe('port in of V-3 (Valve), 2 of 2.');
    key('ArrowUp');
    key('Enter');
    expect(d.store.links.get('process_1')).toMatchObject({
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'in' },
    });
    expect(live()).toBe('Connected port Outlet of V-1 (Valve) to port in of V-2 (Valve).');
    expect(getEditor(d)!.isConnecting()).toBe(false);
  });

  it('steps back with Escape, then cancels', () => {
    d.setSelection([{ kind: 'node', id: 'a' }]);
    key('c');
    key('Tab');
    key('Enter');
    key('Escape');
    expect(live()).toBe('Choose a port again. port Outlet of V-1 (Valve).');
    key('Escape');
    expect(live()).toBe('Connect cancelled.');
    expect(getEditor(d)!.isConnecting()).toBe(false);
  });

  it('announces when nothing is compatible', () => {
    d.connect({ node: 'a', port: 'out' }, { node: 'b', port: 'in' });
    d.connect({ node: 'c', port: 'out' }, { node: 'a', port: 'in' });
    d.setSelection([{ kind: 'node', id: 'b' }]);
    key('c'); // b.in is full (maxLinks 1)
    key('Enter');
    expect(live()).toBe('No compatible ports for port in of V-2 (Valve).');
  });

  it('announces pointer refusals through the same live region', () => {
    d.emit('connectRejected', {
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'out' },
      kind: 'process',
      code: 'direction',
      reason: 'Links must run from an outlet to an inlet.',
      point: { x: 0, y: 0 },
    });
    expect(live()).toBe('Links must run from an outlet to an inlet.');
  });
});
