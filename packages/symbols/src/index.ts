import { type SymbolRegistry, globalSymbols } from '@pipeline-view/core';
import { gasSymbols } from './gas';
import { pidSymbols } from './pid';
import { processSymbols } from './process';

export * from './gas';
export * from './pid';
export * from './process';
export {
  ISA_FUNCTIONS,
  ISA_MODIFIERS,
  ISA_VARIABLES,
  describeInstrumentLetters,
  type InstrumentLetters,
} from './isa';
export {
  ACTUATION,
  EQUIPMENT,
  INSTRUMENTATION,
  PIPING,
  PROCESS,
  VALVES,
  type InstrumentData,
  type InstrumentDevice,
  type InstrumentLocation,
  type LevelData,
  type ValveData,
} from './shared';

/** Register all 50 gas-service symbols, globally by default or in the given registry. */
export function registerGasSymbols(registry: SymbolRegistry = globalSymbols): void {
  registry.register(...gasSymbols);
}

/** Register the process symbols (tanks, pump, control valve, connectors, instruments, header, burner). */
export function registerProcessSymbols(registry: SymbolRegistry = globalSymbols): void {
  registry.register(...processSymbols);
}

/** Register the extended P&ID pack (165 symbols: more valves, actuators, instruments, piping, equipment). */
export function registerPidSymbols(registry: SymbolRegistry = globalSymbols): void {
  registry.register(...pidSymbols);
}
