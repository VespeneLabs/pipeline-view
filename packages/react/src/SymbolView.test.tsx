import { type SymbolDef, registerSymbol } from '@pipeline-view/core';
import { cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { PipelineView } from './PipelineView';
import { SymbolView } from './SymbolView';

const vessel: SymbolDef = {
  type: 'view-test/vessel',
  name: 'Vessel',
  category: 'Test',
  size: { width: 40, height: 80 },
  ports: [],
  svg: '<path d="M0 0H40"/>',
  render: ({ data, status }) =>
    `<path d="M0 0H40" data-level="${String(data.level)}" data-s="${status ?? ''}"/>`,
};
const local: SymbolDef = { ...vessel, type: 'view-test/local', render: undefined };

afterEach(cleanup);

describe('<SymbolView>', () => {
  it('draws the symbol with its data and status at the size asked for', () => {
    const { container } = render(
      <SymbolView symbol={vessel} data={{ level: 0.4 }} status="low" size={28} className="mine" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toBe('pv-symbol-view mine');
    expect(svg.getAttribute('viewBox')).toBe('0 0 40 80');
    // `size` is the longer side.
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['14', '28']);
    expect(svg.getAttribute('data-status')).toBe('low');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')!.getAttribute('data-level')).toBe('0.4');
    expect(svg.querySelector('path')!.getAttribute('data-s')).toBe('low');
  });

  it('scales from a width or a height, and takes a name', () => {
    const { container } = render(
      <>
        <SymbolView symbol={vessel} width={20} title="Vessel V-1" />
        <SymbolView symbol={vessel} height={20} />
        <SymbolView symbol={vessel} />
      </>,
    );
    const [a, b, c] = [...container.querySelectorAll('svg')];
    expect([a!.getAttribute('width'), a!.getAttribute('height')]).toEqual(['20', '40']);
    expect(a!.getAttribute('role')).toBe('img');
    expect(a!.getAttribute('aria-label')).toBe('Vessel V-1');
    expect(a!.hasAttribute('aria-hidden')).toBe(false);
    expect([b!.getAttribute('width'), b!.getAttribute('height')]).toEqual(['10', '20']);
    expect([c!.getAttribute('width'), c!.getAttribute('height')]).toEqual(['40', '80']);
  });

  it('finds a type in the global registry, or on the diagram it is inside', () => {
    registerSymbol(vessel);
    const { container } = render(
      <>
        <SymbolView type="view-test/vessel" />
        <SymbolView type="view-test/local" />
        <PipelineView model={{ version: 2, nodes: [], links: [] }} symbols={[local]}>
          <SymbolView type="view-test/local" className="inside" />
        </PipelineView>
      </>,
    );
    expect(container.querySelectorAll('svg.pv-symbol-view')).toHaveLength(2);
    expect(container.querySelector('svg.inside')!.getAttribute('data-symbol-type')).toBe(
      'view-test/local',
    );
  });

  it('renders on the server', () => {
    expect(renderToString(<SymbolView symbol={vessel} size={16} />)).toContain('pv-symbol-view');
  });
});
