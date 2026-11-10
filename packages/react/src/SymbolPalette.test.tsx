import { type Diagram, SYMBOL_MIME, type SymbolDef } from '@pipeline-view/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PipelineView } from './PipelineView';
import { SymbolPalette, groupSymbols, matchesSymbol } from './SymbolPalette';

const def = (
  type: string,
  name: string,
  category: string,
  ref?: number,
  keywords?: string[],
): SymbolDef => ({
  type,
  name,
  category,
  ref,
  keywords,
  size: { width: 40, height: 20 },
  ports: [{ id: 'in', position: { x: 0, y: 10 }, direction: 'left' }],
  svg: '<path d="M0 10H40" stroke="currentColor"/>',
});

const symbols = [
  def('t/globe', 'Globe valve', 'Valves', 3),
  def('t/gate', 'Gate valve', 'Valves', 1, ['isolation']),
  def('t/compressor', 'Centrifugal compressor', 'Gas equipment', 21),
  def('acme/widget', 'Widget', 'Acme'),
  def('t/pump', 'Centrifugal pump', 'Process equipment'),
];

afterEach(cleanup);

describe('palette helpers', () => {
  it('groups by the default category order, custom categories last, items by ref', () => {
    expect(groupSymbols(symbols).map((g) => [g.category, g.symbols.map((s) => s.type)])).toEqual([
      ['Valves', ['t/gate', 't/globe']],
      ['Gas equipment', ['t/compressor']],
      ['Process equipment', ['t/pump']],
      ['Acme', ['acme/widget']],
    ]);
  });

  it('matches name, keywords, category, type and ref number', () => {
    const m = (q: string) => symbols.filter((s) => matchesSymbol(s, q)).map((s) => s.type);
    expect(m('valve')).toEqual(['t/globe', 't/gate']);
    expect(m('ISOLATION')).toEqual(['t/gate']);
    expect(m('#21')).toEqual(['t/compressor']);
    expect(m('21')).toEqual(['t/compressor']);
    expect(m('centrifugal pump')).toEqual(['t/pump']);
    expect(m('acme/')).toEqual(['acme/widget']);
    expect(m('  ')).toHaveLength(5);
  });
});

describe('<SymbolPalette>', () => {
  it('renders on the server', () => {
    expect(() => renderToString(<SymbolPalette symbols={symbols} />)).not.toThrow();
  });

  it('shows grouped items with previews and filters by search', () => {
    const { container } = render(<SymbolPalette symbols={symbols} />);
    expect(
      [...container.querySelectorAll('.pv-palette-group-title')].map((s) =>
        s.firstChild!.textContent!.trim(),
      ),
    ).toEqual(['Valves', 'Gas equipment', 'Process equipment', 'Acme']);
    expect(container.querySelectorAll('.pv-palette-preview .pv-symbol path')).toHaveLength(5);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'compressor' } });
    expect(container.querySelectorAll('.pv-palette-item')).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing-like-this' } });
    expect(screen.getByText('No matching symbols')).toBeTruthy();
  });

  it('applies the filter prop', () => {
    const { container } = render(
      <SymbolPalette
        symbols={symbols}
        filter={(d) => d.category === 'Valves'}
        searchable={false}
      />,
    );
    expect(container.querySelector('.pv-palette-search')).toBeNull();
    expect(container.querySelectorAll('.pv-palette-item')).toHaveLength(2);
  });

  it('puts the symbol type on the drag data', () => {
    render(<SymbolPalette symbols={symbols} />);
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      effectAllowed: 'none',
    };
    fireEvent.dragStart(screen.getByTestId('palette-item-t/gate'), { dataTransfer });
    expect(data.get(SYMBOL_MIME)).toBe('t/gate');
  });

  it('inserts the clicked symbol into the diagram in edit mode, and not in view mode', async () => {
    const ref = createRef<Diagram>();
    const onActivate = vi.fn();
    const { rerender } = render(
      <PipelineView
        ref={ref}
        mode="edit"
        symbols={symbols}
        model={{ version: 1, nodes: [], links: [] }}
      >
        <SymbolPalette onActivate={onActivate} />
      </PipelineView>,
    );
    await act(async () => {});
    // Without `symbols`, the palette lists the diagram's registry.
    expect(screen.getByTestId('palette-item-acme/widget')).toBeTruthy();
    fireEvent.click(screen.getByTestId('palette-item-t/gate'));
    expect(ref.current!.toJSON().nodes.map((n) => n.type)).toEqual(['t/gate']);
    expect(onActivate).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 't/gate' }),
      'gate_1',
    );

    rerender(
      <PipelineView
        ref={ref}
        mode="view"
        symbols={symbols}
        model={{ version: 1, nodes: [], links: [] }}
      >
        <SymbolPalette onActivate={onActivate} />
      </PipelineView>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByTestId('palette-item-t/gate'));
    expect(onActivate).toHaveBeenLastCalledWith(expect.objectContaining({ type: 't/gate' }), null);
  });
});
