import { sidePorts, type NodeModel, type SymbolDef } from '@pipeline-view/core';

/** Inlet / outlet counts of a manifold node, from its data. Demo symbol. */
export interface ManifoldData extends Record<string, unknown> {
  inputs?: number;
  outputs?: number;
}

const counts = (data: Record<string, unknown> | undefined) => {
  const d = (data ?? {}) as ManifoldData;
  return { inputs: Math.max(1, d.inputs ?? 2), outputs: Math.max(1, d.outputs ?? 1) };
};

const sizeFor = (data: Record<string, unknown> | undefined) => {
  const { inputs, outputs } = counts(data);
  return { width: 48, height: Math.max(64, (Math.max(inputs, outputs) + 1) * 28) };
};

/**
 * A header with a variable number of inlets (left, role 'in') and outlets (right, role 'out').
 * Size and ports are functions of the node, so changing `data.inputs` adds or removes ports.
 */
export const manifold: SymbolDef = {
  type: 'demo/manifold',
  name: 'Manifold',
  category: 'Piping & signals',
  size: (n: NodeModel) => sizeFor(n.data),
  ports: (n: NodeModel) => {
    const size = sizeFor(n.data);
    const { inputs, outputs } = counts(n.data);
    return [
      ...sidePorts(size, 'left', inputs, {
        idPrefix: 'in-',
        role: 'in',
        labels: true,
        maxLinks: 1,
      }),
      ...sidePorts(size, 'right', outputs, { idPrefix: 'out-', role: 'out', labels: true }),
    ];
  },
  render: ({ data }) => {
    const { width, height } = sizeFor(data);
    return (
      `<g fill="none" stroke="currentColor" stroke-width="2">` +
      `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="4" style="fill:var(--pv-symbol-fill,var(--pv-bg,Canvas))"/>` +
      `<line x1="${width / 2}" y1="8" x2="${width / 2}" y2="${height - 8}" stroke-dasharray="3 4"/>` +
      `</g>`
    );
  },
  keywords: ['header', 'manifold', 'distributor'],
};
