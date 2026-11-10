import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel } from '../model/types';
import type { SymbolDef } from '../symbols/types';
import { Diagram } from './diagram';
import type { DiagramOptions } from './types';
import { validateConnect } from './validate';

const tank: SymbolDef = {
  type: 'test/tank',
  name: 'Tank',
  category: 'Test',
  size: { width: 40, height: 40 },
  ports: [
    { id: 'in', position: { x: 0, y: 20 }, direction: 'left', role: 'in', maxLinks: 1 },
    { id: 'out', position: { x: 40, y: 20 }, direction: 'right', role: 'out' },
    { id: 'tap', position: { x: 20, y: 0 }, direction: 'top', accepts: ['signal'] },
  ],
};

const model = (): DiagramModel => ({
  version: 2,
  nodes: [
    { id: 'a', type: 'test/tank', position: { x: 0, y: 0 } },
    { id: 'b', type: 'test/tank', position: { x: 200, y: 0 } },
    { id: 'c', type: 'test/tank', position: { x: 400, y: 0 } },
  ],
  links: [
    { id: 'ab', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' }, kind: 'process' },
  ],
});

const setup = (options: DiagramOptions = {}) => {
  const d = new Diagram({ symbols: [tank], ...options });
  d.load(model());
  return d;
};
const end = (node: string, port: string) => ({ node, port });

afterEach(() => document.body.replaceChildren());

describe('validateConnect: built-in rules (FR-41)', () => {
  it('puts the ends in flow order when dragging from an inlet', () => {
    expect(validateConnect(setup(), end('c', 'in'), end('b', 'out'), 'process')).toEqual({
      ok: true,
      from: end('b', 'out'),
      to: end('c', 'in'),
    });
  });

  it('also swaps when the drag ends on an outlet from a both-port', () => {
    // c.tap has no role (both); b.out is an outlet: the link must run b.out → c.tap.
    expect(validateConnect(setup(), end('c', 'tap'), end('b', 'out'), 'signal')).toEqual({
      ok: true,
      from: end('b', 'out'),
      to: end('c', 'tap'),
    });
  });

  it('passes the ends to canConnect in flow order', () => {
    const canConnect = vi.fn(() => true as const);
    validateConnect(setup({ canConnect }), end('c', 'in'), end('b', 'out'), 'process');
    const [f, t] = canConnect.mock.calls[0] as unknown as [
      { node: { id: string }; port: string },
      { node: { id: string }; port: string },
    ];
    expect([f.node.id, f.port, t.node.id, t.port]).toEqual(['b', 'out', 'c', 'in']);
  });

  it('refuses each built-in case with its code, in precedence order', () => {
    const d = setup({ directed: true, noSelfLoops: true });
    const code = (f: [string, string], t: [string, string], kind = 'process') => {
      const r = validateConnect(d, end(...f), end(...t), kind);
      return r.ok ? 'ok' : r.code;
    };
    expect(code(['a', 'nope'], ['b', 'in'])).toBe('missing-port');
    expect(code(['a', 'out'], ['a', 'out'])).toBe('same-port');
    expect(code(['a', 'out'], ['a', 'in'])).toBe('self-loop');
    expect(code(['a', 'out'], ['c', 'tap'])).toBe('kind-not-accepted');
    expect(code(['a', 'out'], ['c', 'out'])).toBe('direction');
    expect(code(['c', 'out'], ['b', 'in'])).toBe('port-full'); // b.in has maxLinks 1
    expect(code(['b', 'in'], ['a', 'out'])).toBe('port-full');
    expect(code(['b', 'out'], ['c', 'in'])).toBe('ok');
  });

  it('refuses duplicates of an existing pair in either direction', () => {
    const d = setup();
    d.update((tx) =>
      tx.addLink({ id: 'bc', from: end('b', 'out'), to: end('c', 'tap'), kind: 'signal' }),
    );
    const r = validateConnect(d, end('c', 'tap'), end('b', 'out'), 'signal');
    expect(r).toMatchObject({ ok: false, code: 'duplicate' });
  });

  it('applies direction only to the directed kinds', () => {
    const d = setup({ directed: { kinds: ['process'] } });
    expect(validateConnect(d, end('a', 'out'), end('c', 'out'), 'process').ok).toBe(false);
    expect(validateConnect(d, end('a', 'out'), end('c', 'out'), 'signal').ok).toBe(true);
  });
});

describe('validateConnect: explained refusals (FR-42)', () => {
  it('carries detail and a default English reason', () => {
    const r = validateConnect(setup(), end('c', 'out'), end('b', 'in'), 'process');
    expect(r).toEqual({
      ok: false,
      code: 'port-full',
      reason: 'Port in already has the maximum number of links.',
      detail: { node: 'b', port: 'in', maxLinks: 1 },
    });
  });

  it('lets the host replace messages per code, for built-in and custom codes', () => {
    const canConnect = vi.fn(() => ({
      ok: false as const,
      code: 'limit_reached',
      reason: 'fallback',
      detail: { max: 1000 },
    }));
    const d = setup({
      canConnect,
      refusalMessages: (code, ctx) =>
        code === 'limit_reached'
          ? `At most ${String(ctx.detail?.max)} links.`
          : code === 'port-full'
            ? `${ctx.to.node}.${ctx.to.port} is taken. Use a manifold.`
            : undefined,
    });
    expect(validateConnect(d, end('c', 'out'), end('b', 'in'), 'process')).toMatchObject({
      code: 'port-full',
      reason: 'b.in is taken. Use a manifold.',
    });
    expect(validateConnect(d, end('b', 'out'), end('c', 'in'), 'process')).toEqual({
      ok: false,
      code: 'limit_reached',
      reason: 'At most 1000 links.',
      detail: { max: 1000 },
    });
  });

  it('uses the hook reason when there is no message override, and a code for a bare false', () => {
    const d = setup({ canConnect: () => false });
    expect(validateConnect(d, end('b', 'out'), end('c', 'in'), 'process')).toMatchObject({
      ok: false,
      code: 'refused',
      reason: 'This connection is not allowed.',
    });
  });

  it('runs the hook first with canConnectOrder: before-builtins', () => {
    const hook = { ok: false as const, code: 'limit_reached', reason: 'Too many links' };
    const after = setup({ canConnect: () => hook });
    const before = setup({ canConnect: () => hook, canConnectOrder: 'before-builtins' });
    // c.out → b.in is port-full by the built-ins; the hook's code only wins when it runs first.
    expect(validateConnect(after, end('c', 'out'), end('b', 'in'), 'process')).toMatchObject({
      code: 'port-full',
    });
    expect(validateConnect(before, end('c', 'out'), end('b', 'in'), 'process')).toMatchObject({
      code: 'limit_reached',
    });
  });
});

describe('editor integration', () => {
  it('connects in flow order and returns refusals from tryConnect', async () => {
    const { EditorCommands } = await import('../editor/commands');
    const d = setup();
    const ed = new EditorCommands(d, {
      bounds: (n) => ({ ...n.position, width: 40, height: 40 }),
      port: () => undefined,
    });
    const ok = ed.tryConnect(end('c', 'in'), end('b', 'out'));
    expect(ok).toEqual({ ok: true, id: 'process_1' });
    expect(d.store.links.get('process_1')).toMatchObject({
      from: end('b', 'out'),
      to: end('c', 'in'),
    });
    expect(ed.tryConnect(end('a', 'out'), end('c', 'in'))).toMatchObject({
      ok: false,
      code: 'port-full',
    });
  });

  it('explains canDrop refusals', async () => {
    const { EditorCommands } = await import('../editor/commands');
    const d = setup({
      canDrop: (_t, p) =>
        p.x < 0 ? { ok: false, reason: 'Keep it on the sheet', code: 'off-sheet' } : true,
    });
    const ed = new EditorCommands(d, {
      bounds: (n) => ({ ...n.position, width: 40, height: 40 }),
      port: () => undefined,
    });
    expect(ed.tryDrop('test/tank', { x: -100, y: 0 })).toEqual({
      ok: false,
      code: 'off-sheet',
      reason: 'Keep it on the sheet',
    });
    expect(ed.tryDrop('test/nope', { x: 0, y: 0 })).toMatchObject({ code: 'unknown-symbol' });
    expect(ed.tryDrop('test/tank', { x: 100, y: 100 })).toMatchObject({ ok: true });
  });

  it('marks occupied ports in the renderer', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const d = setup();
    d.mount(container);
    d.renderer!.flush();
    const occupied = () =>
      [...container.querySelectorAll('.pv-port[data-occupied]')]
        .map(
          (p) =>
            `${(p.closest('[data-node-id]') as SVGElement).dataset.nodeId}.${(p as SVGElement).dataset.portId}`,
        )
        .sort();
    expect(occupied()).toEqual(['a.out', 'b.in']);
    d.update((tx) => tx.removeLink('ab'));
    d.renderer!.flush();
    expect(occupied()).toEqual([]);
    d.destroy();
  });
});
