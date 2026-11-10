// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('symbols in a DOM-less environment', () => {
  it('imports, registers and renders every symbol without a DOM', async () => {
    expect(typeof document).toBe('undefined');
    const { gasSymbols, processSymbols, registerGasSymbols, registerProcessSymbols } =
      await import('./index');
    const { SymbolRegistry } = await import('@pipeline-view/core');
    const reg = new SymbolRegistry();
    registerGasSymbols(reg);
    registerProcessSymbols(reg);
    for (const def of [...gasSymbols, ...processSymbols]) {
      expect(typeof (def.render?.({ data: {} }) ?? def.svg)).toBe('string');
    }
  });
});
