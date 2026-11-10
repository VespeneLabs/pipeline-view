import { afterEach, beforeEach, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { SymbolDef } from '../symbols/types';
import { attachEditor } from './controller';

const valve: SymbolDef = {
  type: 'test/valve',
  name: 'Valve',
  category: 'Test',
  size: { width: 40, height: 20 },
  ports: [
    { id: 'in', position: { x: 0, y: 10 }, direction: 'left', role: 'in', maxLinks: 1 },
    { id: 'out', position: { x: 40, y: 10 }, direction: 'right', role: 'out' },
  ],
};

let container: HTMLDivElement;
let d: Diagram;
let detach: () => void;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [valve], mode: 'edit', directed: true });
  d.load({
    version: 2,
    nodes: [
      { id: 'a', type: 'test/valve', position: { x: 0, y: 0 } },
      { id: 'b', type: 'test/valve', position: { x: 100, y: 0 } },
      { id: 'c', type: 'test/valve', position: { x: 400, y: 0 } },
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

it('emits connectRejected in flow order when the drag starts at an inlet', () => {
  d.update((tx) =>
    tx.addLink({
      id: 'ab',
      from: { node: 'a', port: 'out' },
      to: { node: 'b', port: 'in' },
      kind: 'process',
    }),
  ); // b.in is now full
  d.renderer!.flush();
  const rejected: unknown[] = [];
  d.on('connectRejected', (e) => rejected.push(e));
  const inlet = d.view!.root.querySelector('[data-node-id="b"] [data-port-id="in"]')!;
  const ptr = (type: string, x: number, y: number, target: Element = d.view!.root) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
      }),
    );
  ptr('pointerdown', 100, 10, inlet);
  ptr('pointermove', 300, 10);
  ptr('pointerup', 440, 10); // on c.out
  expect(rejected[0]).toMatchObject({
    from: { node: 'c', port: 'out' },
    to: { node: 'b', port: 'in' },
    dragFrom: { node: 'b', port: 'in' },
    dragTo: { node: 'c', port: 'out' },
    code: 'port-full',
  });
});
