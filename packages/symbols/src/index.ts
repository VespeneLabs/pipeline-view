import { type SymbolRegistry, globalSymbols } from '@pipeline-view/core';
import { gasSymbols } from './gas';
import { processSymbols } from './process';

export * from './gas';
export * from './process';
export {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  type InstrumentData,
  type ValveData,
} from './shared';

/** Register all 50 gas-service symbols, globally by default or in the given registry. */
export function registerGasSymbols(registry: SymbolRegistry = globalSymbols): void {
  registry.register(...gasSymbols);
}

/** Register the process equipment symbols (tank, pump, control valve). */
export function registerProcessSymbols(registry: SymbolRegistry = globalSymbols): void {
  registry.register(...processSymbols);
}
