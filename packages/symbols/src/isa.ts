/**
 * ISA-5.1 identification letters, for editors that let a user type an instrument tag: the meaning of
 * each letter, and a reader that turns a tag such as "PDT" into words and points out letters that
 * don't fit. The instrument symbols draw any text, so nothing here limits what a diagram may hold.
 */

/** First letter: the measured or initiating variable. Letters the standard leaves to the user carry their usual meaning. */
export const ISA_VARIABLES: Readonly<Record<string, string>> = {
  A: 'Analysis',
  B: 'Burner',
  C: 'Conductivity',
  D: 'Density',
  E: 'Voltage',
  F: 'Flow',
  G: 'Gauging',
  H: 'Hand',
  I: 'Current',
  J: 'Power',
  K: 'Time',
  L: 'Level',
  M: 'Moisture',
  N: "User's choice",
  O: "User's choice",
  P: 'Pressure',
  Q: 'Quantity',
  R: 'Radiation',
  S: 'Speed',
  T: 'Temperature',
  U: 'Multivariable',
  V: 'Vibration',
  W: 'Weight',
  X: 'Unclassified',
  Y: 'Event',
  Z: 'Position',
};

/** Second letter, when it changes the variable instead of naming a function. */
export const ISA_MODIFIERS: Readonly<Record<string, string>> = {
  D: 'differential',
  F: 'ratio',
  J: 'scanning',
  Q: 'totalizing',
  S: 'safety',
};

/** Succeeding letters: what the instrument does. */
export const ISA_FUNCTIONS: Readonly<Record<string, string>> = {
  A: 'alarm',
  B: "user's choice",
  C: 'controller',
  E: 'element',
  G: 'gauge',
  I: 'indicator',
  K: 'control station',
  L: 'light',
  N: "user's choice",
  O: 'orifice',
  P: 'test point',
  R: 'recorder',
  S: 'switch',
  T: 'transmitter',
  U: 'multifunction',
  V: 'valve',
  W: 'well',
  X: 'unclassified',
  Y: 'relay',
  Z: 'actuator',
};

/** A function followed by another one reads as an adjective: "indicating controller". */
const ADJECTIVES: Record<string, string> = {
  C: 'control',
  I: 'indicating',
  R: 'recording',
  T: 'transmitting',
  Y: 'computing',
};

const LEVELS: Record<string, string> = {
  H: 'high',
  HH: 'high-high',
  L: 'low',
  LL: 'low-low',
  HL: 'high-low',
  M: 'middle',
  O: 'open',
  C: 'closed',
};

export interface InstrumentLetters {
  /** The tag in words, for example "Pressure differential transmitter". Empty when nothing could be read. */
  text: string;
  /** What doesn't fit ISA-5.1, in plain English. Empty for a regular tag. */
  warnings: string[];
}

/**
 * Reads ISA-5.1 tag letters: "PDT" is a pressure differential transmitter, "LSHH" a level switch
 * high-high, "FQI" a flow totalizing indicator. Case and surrounding spaces don't matter. The result
 * is English; use the tables above to phrase it in another language.
 */
export function describeInstrumentLetters(letters: string): InstrumentLetters {
  const tag = String(letters ?? '')
    .trim()
    .toUpperCase();
  const warnings: string[] = [];
  if (!tag) return { text: '', warnings };
  if (!/^[A-Z]+$/.test(tag)) {
    return { text: '', warnings: ['ISA-5.1 tag letters are the letters A to Z only.'] };
  }

  const first = tag[0]!;
  const words = [ISA_VARIABLES[first]!];
  let rest = tag.slice(1);

  // A second letter that changes the variable. S does so only in front of a valve or an element
  // (PSV, PSE); anywhere else it is a switch.
  const second = rest[0];
  if (second && ISA_MODIFIERS[second] && (second !== 'S' || /^S[VE]/.test(rest))) {
    words.push(ISA_MODIFIERS[second]);
    rest = rest.slice(1);
  }

  // What may end the tag after a function: the open / closed end of a position switch or light
  // (ZSO, ZLC), or an alarm or switch level (H, HH, L, LL). A lone L is a light.
  let level = '';
  const end =
    (first === 'Z' && /^(.*[SL])([OC])$/.exec(rest)) || /^(.+?)(HH|LL|HL|H|L|M)$/.exec(rest);
  if (end) {
    rest = end[1]!;
    level = LEVELS[end[2]!]!;
  }

  if (!rest) warnings.push('No function letter after the variable, for example I, T or C.');
  const known: string[] = [];
  for (const c of rest) {
    if (!ISA_FUNCTIONS[c]) warnings.push(`"${c}" has no meaning as a function letter.`);
    else if (known.includes(c)) warnings.push(`"${c}" is given twice.`);
    else known.push(c);
  }
  known.forEach((c, i) =>
    words.push(i < known.length - 1 ? (ADJECTIVES[c] ?? ISA_FUNCTIONS[c]!) : ISA_FUNCTIONS[c]!),
  );
  if (level) words.push(level);
  return { text: words.join(' '), warnings };
}
