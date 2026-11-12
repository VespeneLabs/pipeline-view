import type { LinkKind, PortDef, SymbolDef } from '@pipeline-view/core';
import { type Label, type Part, VALVES, port, sym } from '../shared';

/** Closed circle path. */
/* @__NO_SIDE_EFFECTS__ */
export function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
}

/** Two-way valve body (bow-tie) with its pipe stubs, 106 px wide, centred on `y`. */
/* @__NO_SIDE_EFFECTS__ */
export function bow(y: number): string {
  return `M1 ${y}H25M81 ${y}H105M25 ${y - 16}L81 ${y + 16}V${y - 16}L25 ${y + 16}V${y - 16}Z`;
}

/** Marks drawn inside a two-way body centred on `y`. */
export type Mark = (y: number) => Part[];

/* @__NO_SIDE_EFFECTS__ */
export function globe(y: number): Part[] {
  return [{ d: circle(53, y, 7), fill: 'ink' }];
}

/* @__NO_SIDE_EFFECTS__ */
export function ball(y: number): Part[] {
  return [{ d: circle(53, y, 9), fill: 'bg' }];
}

/* @__NO_SIDE_EFFECTS__ */
export function plug(y: number): Part[] {
  return [{ d: `M45 ${y - 7}H61L57 ${y + 7}H49L45 ${y - 7}Z`, fill: 'bg' }];
}

/* @__NO_SIDE_EFFECTS__ */
export function fly(y: number): Part[] {
  return [{ d: `M58 ${y - 20}L48 ${y + 20}` }];
}

/* @__NO_SIDE_EFFECTS__ */
export function weir(y: number): Part[] {
  return [{ d: `M40 ${y - 7}C48.67 ${y - 21} 57.33 ${y - 21} 66 ${y - 7}` }];
}

export interface Extra {
  labels?: Label[];
  keywords?: string[];
  /** Ports besides `in` and `out`. */
  more?: PortDef[];
  /** Link kinds the `in` and `out` ports accept. */
  accepts?: LinkKind[];
}

/** A symbol that sits in a horizontal line: `in` on the left edge and `out` on the right, both at `cy`. */
/* @__NO_SIDE_EFFECTS__ */
export function inline(
  id: string,
  name: string,
  category: string,
  size: [number, number],
  cy: number,
  parts: Part[],
  x: Extra = {},
): SymbolDef {
  return sym({
    type: `pid/${id}`,
    name,
    category,
    size,
    ports: [
      port('in', 1, cy, 'left', x.accepts),
      port('out', size[0] - 1, cy, 'right', x.accepts),
      ...(x.more ?? []),
    ],
    parts,
    labels: x.labels ?? [],
    keywords: x.keywords ?? [],
  });
}

/** A two-way valve: the bow-tie body (filled when `data.open === false`) plus extra linework. */
/* @__NO_SIDE_EFFECTS__ */
export function valve(
  id: string,
  name: string,
  cy: number,
  height: number,
  parts: Part[],
  keywords: string[] = [],
): SymbolDef {
  return inline(id, name, VALVES, [106, height], cy, [{ d: bow(cy), closable: true }, ...parts], {
    keywords,
  });
}
