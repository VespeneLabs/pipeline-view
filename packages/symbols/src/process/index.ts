import type { SymbolDef } from '@pipeline-view/core';
import { controlValve } from './control-valve';
import { pump } from './pump';
import { tank } from './tank';

export { controlValve, pump, tank };
export type { PumpData } from './pump';
export type { TankData } from './tank';

/** Process equipment from the water-treatment process diagram (tank, pump, control valve). */
export const processSymbols: SymbolDef[] = [tank, pump, controlValve];
