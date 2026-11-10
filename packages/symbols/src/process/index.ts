import type { SymbolDef } from '@pipeline-view/core';
import { conicalTank } from './conical-tank';
import { controlValve } from './control-valve';
import { pump } from './pump';
import { tank } from './tank';

export { conicalTank, controlValve, pump, tank };
export type { PumpData } from './pump';
export type { TankData } from './tank';

/** Process equipment from the process diagram (tanks, pump, control valve). */
export const processSymbols: SymbolDef[] = [tank, conicalTank, pump, controlValve];
