import type { Diagram, NodeModel } from '@pipeline-view/core';
import type { SymbolPreset } from '@pipeline-view/react';
import {
  type InstrumentBubbleData,
  behindLocalPanelInstrument,
  behindPanelInstrument,
  computerFunction,
  describeInstrumentLetters,
  differentialPressureTransmitter,
  flowIndicatingController,
  flowTransmitter,
  gasAnalyzerTransmitter,
  highHighLevelSwitch,
  inlineInstrument,
  instrumentBubble,
  levelTransmitter,
  localPanelInstrument,
  plcFunction,
  pressureIndicator,
  pressureTransmitter,
  sharedDisplayInstrument,
  temperatureIndicator,
  temperatureTransmitter,
} from '@pipeline-view/symbols';
import { type ReactNode, useState } from 'react';

/** Palette group of the presets below. The editor lists it first. */
export const PRESET_CATEGORY = 'Instrument presets';

/**
 * One-click instruments: the generic bubble with data of its own. Nothing is registered for them;
 * the inspector changes the same data afterwards.
 */
export const INSTRUMENT_PRESETS: SymbolPreset[] = (
  [
    ['pt', 'PT · field', { letters: 'PT' }, ['pressure transmitter']],
    ['pdt', 'PDT · field', { letters: 'PDT' }, ['differential pressure']],
    [
      'ft-inline',
      'FT · in the line',
      { letters: 'FT', mounting: 'inline', flowElement: true },
      ['flow meter'],
    ],
    ['at', 'AT · CH₄', { letters: 'AT', high: 'CH₄' }, ['analyzer', 'methane']],
    [
      'fic',
      'FIC · panel',
      { letters: 'FIC', location: 'panel', mounting: 'none' },
      ['flow controller'],
    ],
    [
      'pa',
      'PA · shared display',
      {
        letters: 'PA',
        device: 'shared',
        location: 'panel',
        high: 'HH',
        low: 'LL',
        mounting: 'none',
      },
      ['alarm', 'DCS'],
    ],
    [
      'plc',
      'YC · PLC',
      { letters: 'YC', device: 'plc', location: 'panel', mounting: 'none' },
      ['logic', 'interlock'],
    ],
  ] as [string, string, InstrumentBubbleData, string[]][]
).map(([id, name, data, keywords]) => ({
  id,
  type: instrumentBubble.type,
  name,
  data,
  keywords,
  category: PRESET_CATEGORY,
}));

/** Every symbol that draws an instrument bubble from its data: the generic one and its presets in the packs. */
const BUBBLES = new Set(
  [
    instrumentBubble,
    inlineInstrument,
    pressureIndicator,
    pressureTransmitter,
    differentialPressureTransmitter,
    temperatureIndicator,
    temperatureTransmitter,
    flowTransmitter,
    levelTransmitter,
    flowIndicatingController,
    highHighLevelSwitch,
    gasAnalyzerTransmitter,
    behindPanelInstrument,
    localPanelInstrument,
    behindLocalPanelInstrument,
    sharedDisplayInstrument,
    computerFunction,
    plcFunction,
  ].map((d) => d.type),
);

export const isBubble = (type: string) => BUBBLES.has(type);

const DEVICES = [
  ['discrete', 'Discrete instrument'],
  ['shared', 'Shared display / control'],
  ['computer', 'Computer function'],
  ['plc', 'Programmable logic'],
];
const LOCATIONS = [
  ['field', 'Field'],
  ['panel', 'Main panel'],
  ['behind-panel', 'Behind main panel'],
  ['local-panel', 'Local panel'],
  ['behind-local-panel', 'Behind local panel'],
];
const MOUNTINGS = [
  ['tap', 'On a tap'],
  ['inline', 'In the line'],
  ['none', 'On its own'],
];

/** A text field that writes on blur or Enter, so an edit is one undo step. */
function TextField(props: {
  name: string;
  label: string;
  value: string;
  maxLength: number;
  onCommit(value: string): void;
  /** Shown under the field for what is being typed. */
  hint?: (draft: string) => ReactNode;
}) {
  const [draft, setDraft] = useState(props.value);
  return (
    <label className="editor-field">
      <span>{props.label}</span>
      <input
        type="text"
        data-testid={`inst-${props.name}`}
        value={draft}
        maxLength={props.maxLength}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== props.value && props.onCommit(draft)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {props.hint?.(draft)}
    </label>
  );
}

function Reading({ letters }: { letters: string }) {
  const { text, warnings } = describeInstrumentLetters(letters);
  if (!text && !warnings.length) return null;
  return (
    <small className="editor-reading" data-testid="inst-reading">
      {text}
      {warnings.map((w) => (
        <em key={w}>{w}</em>
      ))}
    </small>
  );
}

/**
 * The fields of an instrument bubble. They write plain node data through `diagram.update`, so every
 * change is one undo step; the symbol redraws from the data, and its ports follow the mounting.
 */
export function InstrumentFields(props: {
  diagram: Diagram;
  node: NodeModel;
  edit(fn: () => void): void;
}) {
  const { diagram, node, edit } = props;
  const data = (node.data ?? {}) as InstrumentBubbleData;
  const set = (key: keyof InstrumentBubbleData, value: string) =>
    edit(() =>
      diagram.update((tx) => {
        const next: Record<string, unknown> = { ...node.data };
        if (value === '') delete next[key];
        else next[key] = value;
        tx.updateNode(node.id, { data: next });
      }),
    );
  const text = (
    key: 'letters' | 'loop' | 'high' | 'low',
    label: string,
    maxLength: number,
    hint?: (draft: string) => ReactNode,
  ) => {
    const value = data[key] === undefined ? '' : String(data[key]);
    return (
      <TextField
        // A value that changes from outside (undo, another node) starts a fresh draft.
        key={`${node.id}:${key}:${value}`}
        name={key}
        label={label}
        value={value}
        maxLength={maxLength}
        onCommit={(v) => set(key, v.trim())}
        hint={hint}
      />
    );
  };
  const select = (key: 'device' | 'location' | 'mounting', label: string, options: string[][]) => (
    <label className="editor-field">
      <span>{label}</span>
      <select
        data-testid={`inst-${key}`}
        value={data[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
      >
        <option value="">Symbol default</option>
        {options.map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="editor-fields" data-testid="instrument-fields">
      {text('letters', 'Tag letters', 6, (draft) => (
        <Reading letters={draft} />
      ))}
      {text('loop', 'Loop number', 8)}
      {select('device', 'Device', DEVICES)}
      {select('location', 'Location', LOCATIONS)}
      {node.type === instrumentBubble.type && select('mounting', 'Mounting', MOUNTINGS)}
      {text('high', 'Upper qualifier', 5)}
      {text('low', 'Lower qualifier', 5)}
      <p className="editor-note">
        One symbol draws every bubble from this data. An empty field keeps the symbol&apos;s own
        default.
      </p>
    </div>
  );
}
