import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Diagram } from '../diagram/diagram';
import type { SymbolDef } from '../symbols/types';
import { describeIssues, polylineMidpoint, worstSeverity } from './issues';

const box: SymbolDef = {
  type: 'test/box',
  name: 'Box',
  category: 'Test',
  size: { width: 100, height: 50 },
  ports: [
    { id: 'in', position: { x: 0, y: 25 }, direction: 'left' },
    { id: 'out', position: { x: 100, y: 25 }, direction: 'right' },
  ],
  svg: '<rect width="100" height="50"/>',
};

let container: HTMLDivElement;
let d: Diagram;
const $ = (s: string) => container.querySelector(s);
const $$ = (s: string) => [...container.querySelectorAll(s)];
const flush = () => d.issueLayer!.flush();
const key = (k: string, init: KeyboardEventInit = {}) =>
  d.view!.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  d = new Diagram({ symbols: [box] });
  d.mount(container);
  d.load({
    version: 2,
    nodes: [
      { id: 'a', type: 'test/box', position: { x: 0, y: 0 }, label: 'A' },
      { id: 'b', type: 'test/box', position: { x: 300, y: 0 }, label: 'B' },
      { id: 'c', type: 'test/box', position: { x: 0, y: 200 }, label: 'C' },
    ],
    links: [
      {
        id: 'ab',
        from: { node: 'a', port: 'out' },
        to: { node: 'b', port: 'in' },
        kind: 'process',
      },
    ],
  });
});

afterEach(() => {
  d.destroy();
  container.remove();
});

describe('helpers', () => {
  it('ranks severities and describes issues worst first', () => {
    expect(worstSeverity([])).toBeUndefined();
    expect(
      worstSeverity([
        { severity: 'info', message: 'x' },
        { severity: 'warning', message: 'y' },
      ]),
    ).toBe('warning');
    expect(
      describeIssues([
        { severity: 'info', message: 'Tagged.' },
        { severity: 'error', message: 'No outlet.' },
      ]),
    ).toBe('Error: No outlet. Info: Tagged.');
  });

  it('finds the midpoint along a polyline', () => {
    expect(polylineMidpoint([])).toBeUndefined();
    expect(polylineMidpoint([{ x: 0, y: 0 }])).toEqual({ x: 0, y: 0 });
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 30 },
      ]),
    ).toEqual({ x: 10, y: 10 });
  });
});

describe('setIssues', () => {
  it('marks nodes and links with severity, ARIA description and a badge', () => {
    d.setIssues({
      nodes: {
        a: [
          { severity: 'warning', message: 'No outlet pressure.' },
          { severity: 'error', message: 'Not connected.', code: 'open-end' },
        ],
      },
      links: { ab: [{ severity: 'info', message: 'Unverified.' }] },
    });
    flush();
    const a = $('[data-node-id="a"]')!;
    expect(a.getAttribute('data-issue-severity')).toBe('error');
    expect(a.getAttribute('aria-description')).toBe(
      'Error: Not connected. Warning: No outlet pressure.',
    );
    expect(a.querySelector(':scope > desc.pv-issue-desc')!.textContent).toBe(
      'Error: Not connected. Warning: No outlet pressure.',
    );
    expect($('[data-node-id="b"]')!.hasAttribute('data-issue-severity')).toBe(false);
    expect($('[data-link-id="ab"]')!.getAttribute('data-issue-severity')).toBe('info');

    const badge = $('.pv-layer-issues [data-issue-node="a"]')!;
    expect(badge.getAttribute('data-issue-severity')).toBe('error');
    // Top-right corner of node a (0,0 100×50).
    expect(badge.getAttribute('transform')).toBe('translate(100,0)');
    expect(badge.querySelector('title')!.textContent).toBe(
      'Error: Not connected. Warning: No outlet pressure.',
    );
    const linkBadge = $('[data-issue-link="ab"]')!;
    const mid = linkBadge.getAttribute('transform')!;
    // Middle of the a.out (100,25) → b.in (300,25) route.
    expect(mid).toBe('translate(200,25)');
  });

  it('replaces all issues, clearing items that are no longer listed', () => {
    d.setIssues({ nodes: { a: [{ severity: 'error', message: 'x' }] } });
    flush();
    d.setIssues({ nodes: { b: [{ severity: 'info', message: 'y' }], c: [] } });
    flush();
    expect($('[data-node-id="a"]')!.hasAttribute('data-issue-severity')).toBe(false);
    expect($('[data-node-id="a"]')!.hasAttribute('aria-description')).toBe(false);
    expect($('[data-node-id="a"] desc')).toBeNull();
    expect($$('.pv-issue-badge').map((b) => b.getAttribute('data-issue-node'))).toEqual(['b']);
    expect(d.getIssues()).toEqual({
      nodes: { b: [{ severity: 'info', message: 'y' }], c: [] },
      links: {},
    });
    d.setIssues({});
    flush();
    expect($$('.pv-issue-badge')).toHaveLength(0);
  });

  it('follows moves, survives load() and drops markers of removed items', () => {
    d.setIssues({
      nodes: { a: [{ severity: 'error', message: 'x' }], c: [{ severity: 'info', message: 'y' }] },
    });
    flush();
    d.update((tx) => tx.updateNode('a', { position: { x: 20, y: 40 } }));
    flush();
    expect($('[data-issue-node="a"]')!.getAttribute('transform')).toBe('translate(120,40)');
    d.update((tx) => tx.removeNode('c'));
    flush();
    expect($('[data-issue-node="c"]')).toBeNull();
    // Undo brings the node back, and its marker with it: issues live outside the model.
    d.undo();
    flush();
    expect($('[data-issue-node="c"]')).not.toBeNull();
    d.load(d.toJSON());
    flush();
    expect($('[data-node-id="a"]')!.getAttribute('data-issue-severity')).toBe('error');
  });

  it('is never saved with the model or exported', () => {
    d.setIssues({ nodes: { a: [{ severity: 'error', message: 'x' }] } });
    flush();
    expect(JSON.stringify(d.toJSON())).not.toContain('issue');
    const svg = d.exportSVG();
    expect(svg).not.toContain('issue');
    expect(svg).not.toContain('aria-description');
  });

  it('can be set before mount', () => {
    const late = new Diagram({ symbols: [box] });
    late.load({
      version: 2,
      nodes: [{ id: 'x', type: 'test/box', position: { x: 0, y: 0 } }],
      links: [],
    });
    late.setIssues({ nodes: { x: [{ severity: 'warning', message: 'w' }] } });
    const el = document.createElement('div');
    document.body.append(el);
    late.mount(el);
    late.issueLayer!.flush();
    expect(el.querySelector('[data-node-id="x"]')!.getAttribute('data-issue-severity')).toBe(
      'warning',
    );
    late.destroy();
    el.remove();
  });

  it('a click on a badge hits its item', () => {
    d.setIssues({
      nodes: { b: [{ severity: 'error', message: 'x' }] },
      links: { ab: [{ severity: 'info', message: 'y' }] },
    });
    flush();
    expect(d.hitTest($('[data-issue-node="b"] circle'))).toEqual({ kind: 'node', id: 'b' });
    expect(d.hitTest($('[data-issue-link="ab"]'))).toEqual({ kind: 'link', id: 'ab' });
  });
});

describe('navigation', () => {
  beforeEach(() => {
    d.setIssues({
      nodes: {
        c: [{ severity: 'error', message: 'x' }],
        b: [{ severity: 'warning', message: 'y' }],
      },
      links: { ab: [{ severity: 'info', message: 'z' }] },
    });
    flush();
  });

  it('nextIssue steps through marked items in reading order and wraps', () => {
    // Reading order of the badge anchors: b (400,0), ab (200,25), c (100,200) → b, ab, c by y then x.
    expect(d.nextIssue()).toEqual({ kind: 'node', id: 'b' });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'b' }]);
    expect(d.nextIssue()).toEqual({ kind: 'link', id: 'ab' });
    expect(d.nextIssue()).toEqual({ kind: 'node', id: 'c' });
    expect(d.nextIssue()).toEqual({ kind: 'node', id: 'b' });
    expect(d.nextIssue(-1)).toEqual({ kind: 'node', id: 'c' });
  });

  it('focuses marked nodes so screen readers read the description', () => {
    d.nextIssue();
    expect(document.activeElement).toBe($('[data-node-id="b"]'));
    expect(d.keyboard!.getFocused()).toBe('b');
  });

  it('F8 / Shift+F8 step forwards and backwards, in view and edit mode', () => {
    key('F8');
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'b' }]);
    d.setMode('edit');
    key('F8', { shiftKey: true });
    expect(d.getSelection()).toEqual([{ kind: 'node', id: 'c' }]);
  });

  it('returns null when nothing is marked', () => {
    d.setIssues({});
    expect(d.nextIssue()).toBeNull();
  });
});
