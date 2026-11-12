import type { SymbolDef } from '@pipeline-view/core';
import { conicalTank } from './conical-tank';
import { controlValve } from './control-valve';
import { pump } from './pump';
import { tank } from './tank';
import { offPageInlet, offPageOutlet } from './off-page';
import { inlineInstrument } from './inline-instrument';
import { instrumentBubble } from './instrument';
import { header } from './header';
import { burner } from './burner';

export {
  conicalTank,
  controlValve,
  pump,
  tank,
  offPageInlet,
  offPageOutlet,
  inlineInstrument,
  instrumentBubble,
  header,
  burner,
};
export type { PumpData } from './pump';
export type { TankData } from './tank';
export type { OffPageData } from './off-page';
export type { InlineInstrumentData } from './inline-instrument';
export type { InstrumentBubbleData, InstrumentMounting } from './instrument';
export type { HeaderData } from './header';

/**
 * Industry-neutral process symbols: tanks, pump and control valve from the process diagram, plus
 * off-page connectors, an inline instrument, the generic instrument bubble, a variable-port header and a consumer / burner.
 */
export const processSymbols: SymbolDef[] = [
  tank,
  conicalTank,
  pump,
  controlValve,
  offPageInlet,
  offPageOutlet,
  inlineInstrument,
  instrumentBubble,
  header,
  burner,
];
