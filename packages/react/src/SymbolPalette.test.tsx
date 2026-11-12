import { type Diagram, SYMBOL_INIT_MIME, SYMBOL_MIME, type SymbolDef } from '@pipeline-view/core';
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

  describe('presets', () => {
    // A symbol whose drawing and size follow its data, like an instrument bubble.
    const tag: SymbolDef = {
      type: 't/tag',
      name: 'Tag',
      category: 'Instrumentation',
      ref: 31,
      keywords: ['bubble'],
      size: (n) => ({ width: n.data?.wide ? 80 : 40, height: 20 }),
      ports: [],
      render: ({ data }) => `<text>${String(data.letters ?? '??')}</text>`,
    };
    const all = [...symbols, tag];
    const presets = [
      { id: 'pt', type: 't/tag', name: 'PT', data: { letters: 'PT' }, keywords: ['pressure'] },
      { id: 'wide', type: 't/tag', name: 'Analyzer', data: { wide: true }, label: 'AT-1' },
      { id: 'mine', type: 't/gate', name: 'My gate', category: 'Acme' },
      { id: 'lost', type: 't/unknown', name: 'Lost' },
    ];

    it('lists presets in their group after the numbered symbols, drawn with their data', () => {
      const { container } = render(<SymbolPalette symbols={all} presets={presets} />);
      const group = container.querySelector('[aria-label="Instrumentation"]')!;
      expect([...group.querySelectorAll('.pv-palette-name')].map((n) => n.textContent)).toEqual([
        'Tag',
        'Analyzer',
        'PT',
      ]);
      expect(screen.getByTestId('palette-preset-pt').querySelector('text')!.textContent).toBe('PT');
      expect(screen.getByTestId('palette-item-t/tag').querySelector('text')!.textContent).toBe(
        '??',
      );
      // The preview takes the size the data gives the symbol.
      expect(
        screen.getByTestId('palette-preset-wide').querySelector('svg')!.getAttribute('viewBox'),
      ).toBe('-2 -2 84 24');
      // A category of its own, and no entry for a symbol that isn't there.
      expect(container.querySelector('[aria-label="Acme"]')!.textContent).toContain('My gate');
      expect(screen.queryByTestId('palette-preset-lost')).toBeNull();
    });

    it('finds a preset by its name, its own keywords and its symbol', () => {
      const { container } = render(<SymbolPalette symbols={all} presets={presets} />);
      const shown = (q: string) => {
        fireEvent.change(screen.getByRole('searchbox'), { target: { value: q } });
        return [...container.querySelectorAll('.pv-palette-name')].map((n) => n.textContent);
      };
      expect(shown('pressure')).toEqual(['PT']);
      expect(shown('analyzer')).toEqual(['Analyzer']);
      expect(shown('bubble')).toEqual(['Tag', 'Analyzer', 'PT']);
    });

    it('puts the preset on the drag data next to the symbol type', () => {
      render(<SymbolPalette symbols={all} presets={presets} />);
      const drag = (testId: string) => {
        const data = new Map<string, string>();
        const dataTransfer = {
          setData: (k: string, v: string) => data.set(k, v),
          effectAllowed: 'none',
        };
        fireEvent.dragStart(screen.getByTestId(testId), { dataTransfer });
        return data;
      };
      const wide = drag('palette-preset-wide');
      expect(wide.get(SYMBOL_MIME)).toBe('t/tag');
      expect(JSON.parse(wide.get(SYMBOL_INIT_MIME)!)).toEqual({
        label: 'AT-1',
        data: { wide: true },
      });
      expect(drag('palette-item-t/tag').has(SYMBOL_INIT_MIME)).toBe(false);
    });

    it('inserts a clicked preset with its data and label', async () => {
      const ref = createRef<Diagram>();
      render(
        <PipelineView
          ref={ref}
          mode="edit"
          symbols={all}
          model={{ version: 1, nodes: [], links: [] }}
        >
          <SymbolPalette presets={presets} />
        </PipelineView>,
      );
      await act(async () => {});
      fireEvent.click(screen.getByTestId('palette-preset-pt'));
      fireEvent.click(screen.getByTestId('palette-preset-wide'));
      expect(ref.current!.toJSON().nodes.map((n) => [n.id, n.type, n.label, n.data])).toEqual([
        ['tag_1', 't/tag', undefined, { letters: 'PT' }],
        ['tag_2', 't/tag', 'AT-1', { wide: true }],
      ]);
      // One undo step per insert.
      ref.current!.undo();
      expect(ref.current!.toJSON().nodes).toHaveLength(1);
    });
  });
});
