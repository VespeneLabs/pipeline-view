import { describe, expect, it } from 'vitest';
import { ISA_FUNCTIONS, ISA_VARIABLES, describeInstrumentLetters } from './isa';

const read = (letters: string) => describeInstrumentLetters(letters).text;

describe('describeInstrumentLetters', () => {
  it('reads variable, functions and the last function as the noun', () => {
    expect(read('PI')).toBe('Pressure indicator');
    expect(read('PT')).toBe('Pressure transmitter');
    expect(read('FIC')).toBe('Flow indicating controller');
    expect(read('TIT')).toBe('Temperature indicating transmitter');
    expect(read('FRC')).toBe('Flow recording controller');
    expect(read('PCV')).toBe('Pressure control valve');
    expect(read('TE')).toBe('Temperature element');
    expect(read('LG')).toBe('Level gauge');
    expect(read('AT')).toBe('Analysis transmitter');
    expect(read('HS')).toBe('Hand switch');
  });

  it('reads a second letter that changes the variable', () => {
    expect(read('PDT')).toBe('Pressure differential transmitter');
    expect(read('PDAH')).toBe('Pressure differential alarm high');
    expect(read('FQI')).toBe('Flow totalizing indicator');
    expect(read('FFC')).toBe('Flow ratio controller');
  });

  it('reads S as safety only in front of a valve or an element', () => {
    expect(read('PSV')).toBe('Pressure safety valve');
    expect(read('PSE')).toBe('Pressure safety element');
    expect(read('PS')).toBe('Pressure switch');
    expect(read('PSH')).toBe('Pressure switch high');
  });

  it('reads alarm and switch levels, and the ends of a position switch', () => {
    expect(read('LSHH')).toBe('Level switch high-high');
    expect(read('LAL')).toBe('Level alarm low');
    expect(read('LSLL')).toBe('Level switch low-low');
    expect(read('PAHL')).toBe('Pressure alarm high-low');
    expect(read('ZSO')).toBe('Position switch open');
    expect(read('ZSC')).toBe('Position switch closed');
    expect(read('ZIC')).toBe('Position indicating controller');
    // A lone L is a light, not a level.
    expect(read('ZL')).toBe('Position light');
  });

  it('ignores case and surrounding spaces', () => {
    expect(describeInstrumentLetters(' pdt ')).toEqual({
      text: 'Pressure differential transmitter',
      warnings: [],
    });
  });

  it('has no warnings for regular tags', () => {
    for (const t of ['PI', 'PT', 'FIC', 'PDT', 'LSHH', 'PSV', 'FQI', 'ZSO', 'TE', 'LAL']) {
      expect(describeInstrumentLetters(t).warnings, t).toEqual([]);
    }
  });

  it('warns about what does not fit', () => {
    expect(describeInstrumentLetters('')).toEqual({ text: '', warnings: [] });
    expect(describeInstrumentLetters('P-1').warnings).toHaveLength(1);
    expect(describeInstrumentLetters('P-1').text).toBe('');
    expect(describeInstrumentLetters('P').warnings[0]).toMatch(/No function letter/);
    expect(describeInstrumentLetters('PD').warnings[0]).toMatch(/No function letter/);
    expect(describeInstrumentLetters('PIQ').warnings).toEqual([
      '"Q" has no meaning as a function letter.',
    ]);
    expect(describeInstrumentLetters('PII').warnings).toEqual(['"I" is given twice.']);
    // The reading keeps what it understood.
    expect(read('PIQ')).toBe('Pressure indicator');
  });

  it('has a meaning for every first letter, and tables with upper-case keys only', () => {
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(ISA_VARIABLES[c], c).toBeTruthy();
    for (const k of Object.keys(ISA_FUNCTIONS)) expect(k).toMatch(/^[A-Z]$/);
  });
});
