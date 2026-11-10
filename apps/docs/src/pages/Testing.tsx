import { Code } from '../components/Code';

const SETUP = `// vitest.config.ts: any DOM environment works (jsdom or happy-dom)
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom' } });`;

const BASIC = `import { afterEach, expect, test } from 'vitest';
import { processSymbols } from '@vespenelabs/pipeline-view/symbols';
import {
  connect,
  createTestDiagram,
  drag,
  expectLink,
  getNodeByLabel,
  pressKey,
  type TestDiagram,
} from '@vespenelabs/pipeline-view/testing';
import { model } from './model';

let t: TestDiagram;
afterEach(() => t.destroy());

test('the operator can connect the pump to the valve', () => {
  t = createTestDiagram({ model, symbols: processSymbols }); // edit mode, editor attached
  const pump = getNodeByLabel(t, 'P-101');
  const id = connect(t, \`\${pump.id}.discharge\`, 'V1.in');
  expect(id).not.toBeNull();
  expectLink(t, pump.id, 'V1', { kind: 'process' });
});

test('moving a node and undoing it', () => {
  t = createTestDiagram({ model, symbols: processSymbols });
  drag(t, 'P1', { by: { x: 40, y: 0 } });
  expect(t.diagram.toJSON().nodes.find((n) => n.id === 'P1')!.position.x).toBe(240);
  pressKey(t, 'z', { ctrlKey: true });
  expect(t.diagram.toJSON().nodes.find((n) => n.id === 'P1')!.position.x).toBe(200);
});`;

const RULES = `test('valves refuse signal lines on their process ports', () => {
  t = createTestDiagram({
    model,
    symbols: processSymbols,
    canConnect: (from, to, kind) =>
      kind === 'signal' && to.port !== 'actuator'
        ? { ok: false, reason: 'Signals go to the actuator.', code: 'signal-target' }
        : true,
  });
  expect(connect(t, 'TT1.signal', 'V1.in', { kind: 'signal' })).toBeNull();
  expectLink(t, 'TT1', 'V1', { count: 0 });
});`;

const REACT = `import { render } from '@testing-library/react';
import { PipelineView } from '@vespenelabs/pipeline-view/react';
import { click, expectLink, getNodeElement } from '@vespenelabs/pipeline-view/testing';

test('my editor screen', () => {
  let diagram!: Diagram;
  render(<MyEditor onReady={(d) => (diagram = d)} />); // passes onReady down to <PipelineView>
  click(diagram, { node: 'P1' });
  expect(getNodeElement(diagram, 'P1').classList.contains('pv-selected')).toBe(true);
});`;

const E2E = `// Playwright / Cypress: the same ids are on the rendered elements.
await page.locator('[data-pv-node-id="P1"]').click();
await expect(page.locator('[data-pv-link-id="l1"]')).toBeVisible();
await expect(page.locator('[data-pv-node-id="V1"] [data-pv-port-id="in"]')).toHaveCount(1);`;

const HELPERS: [string, string][] = [
  [
    'createTestDiagram(options?)',
    'Mounts a diagram (edit mode, editor attached) in a new container; model, symbols, width, height, editor, plus any DiagramOptions. Returns { diagram, container, flush, destroy }.',
  ],
  [
    'connect(t, "a.out", "b.in", { kind? })',
    'Drags a connection with real pointer events. Returns the new link id, or null when refused.',
  ],
  ['drag(t, nodeId, { by } | { to })', 'Moves a node with the pointer (snapping applies).'],
  [
    'drop(t, type, point)',
    'Drops a palette symbol at a diagram point. Returns the new id or null.',
  ],
  ['click(t, { node } | { link })', 'Selects in edit mode and fires nodeClick / linkClick.'],
  [
    'pressKey(t, key, init?)',
    'keydown + keyup on the focused diagram element: Delete, Escape, z with ctrlKey…',
  ],
  [
    'getNodeByLabel(t, label)',
    'The one node with that label. Throws with the list of labels otherwise.',
  ],
  [
    'getPort(t, "node.port")',
    'The port definition, its point in diagram coordinates and its element.',
  ],
  [
    'getNodeElement / getLinkElement',
    'The rendered element, by data-pv-node-id / data-pv-link-id.',
  ],
  [
    'findLinks / expectLink(t, from, to, { kind?, undirected?, count? })',
    'Ends can be ports or whole nodes; the error lists the links that do exist.',
  ],
];

export function Testing() {
  return (
    <article className="prose">
      <h1>Testing</h1>
      <p className="lede">
        <code>@vespenelabs/pipeline-view/testing</code> lets you test your app&apos;s diagrams in
        Vitest or Jest without a browser. The helpers dispatch real pointer and keyboard events, so
        your <code>canConnect</code>, <code>canDrop</code>, delete hooks and undo all run exactly as
        they do for a user. Every action renders before it returns.
      </p>

      <h2>Setup</h2>
      <p>
        The helpers need a DOM to create and mount diagrams: run your tests under{' '}
        <strong>jsdom</strong> or <strong>happy-dom</strong> (the library&apos;s own test suite runs
        under both). Importing the package without a DOM is fine; only{' '}
        <code>createTestDiagram</code> and the actions need one.
      </p>
      <Code>{SETUP}</Code>

      <h2>A first test</h2>
      <Code>{BASIC}</Code>

      <h2>Testing your rules</h2>
      <p>Validation hooks are plain options, so a refusal is just a null result:</p>
      <Code>{RULES}</Code>

      <h2>With React</h2>
      <p>
        Every helper also takes a plain <code>Diagram</code>, for example the one{' '}
        <code>&lt;PipelineView onReady&gt;</code> hands you in a React Testing Library test:
      </p>
      <Code>{REACT}</Code>

      <h2>End-to-end tests</h2>
      <p>
        Rendered nodes, ports and links carry stable <code>data-pv-node-id</code>,{' '}
        <code>data-pv-port-id</code> and <code>data-pv-link-id</code> attributes. They&apos;re part
        of the public API (see the versioning policy), unlike class names.
      </p>
      <Code>{E2E}</Code>

      <h2>Helpers</h2>
      <dl className="api-list">
        {HELPERS.map(([sig, doc]) => (
          <div key={sig}>
            <dt>
              <code>{sig}</code>
            </dt>
            <dd>{doc}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
