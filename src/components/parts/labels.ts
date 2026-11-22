import { ArpPattern, StrumDirection } from '../../theory';
import { StrumPattern } from '../../strum';
import { ArpRate } from '../../audio/engine';
import { INSTRUMENTS, InstrumentId } from '../../audio/instruments';
import { FX_KEYS, PartFx, PartKind, PartTone, PlayMode, shapePan } from '../../parts';
import { PartsTab } from '../../song';
import { DriveType, FilterType, LfoRate, ShapeKnob } from '../../sound';

export const ARP_RATES: { rate: ArpRate; label: string }[] = [
    { rate: '4n', label: '1/4' },
    { rate: '8n', label: '1/8' },
    { rate: '8t', label: '1/8T' },
    { rate: '16n', label: '1/16' },
    { rate: '16t', label: '1/16T' },
    { rate: '32n', label: '1/32' },
];

export const ARP_PATTERNS: { id: ArpPattern; label: string }[] = [
    { id: 'up', label: 'Up' },
    { id: 'down', label: 'Down' },
    { id: 'upDown', label: 'Up-Down' },
    { id: 'random', label: 'Random' },
];

/** Arp note lengths offered (seconds). A saved length that isn't one of these is kept and listed too. */
export const NOTE_LENGTHS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2];

export const WAVES: { [id in InstrumentId]: string } = {
    piano: 'M2 11 V2 M6 11 V2 M10 11 V2 M14 11 V2 M18 11 V2 M22 11 V2 M4 2 V7 M8 2 V7 M16 2 V7 M20 2 V7',
    pad: 'M1 9 L7 3 L7 9 L13 3 L13 9 L19 3 L19 9 L25 3',
    epiano: 'M1 6 Q2 0 3 6 T5 6 Q8 0 11 6 T17 6 Q20 0 21 6 T25 6',
    organ: 'M1 6 Q3 1 5 6 T9 6 Q11 3 13 6 T17 6 Q19 1 21 6 T25 6',
    pluck: 'M1 6 Q3 -2 5 6 Q7 11 9 6 Q11 3 13 6 Q16 8 19 6 L25 6',
    lead: 'M1 10 V2 H7 V10 H13 V2 H19 V10 H25',
    strings: 'M1 9 L5 3 L9 9 L13 3 L17 9 L21 3 L25 9',
    warmpad: 'M1 6 C5 0 9 0 13 6 S21 12 25 6',
    brass: 'M1 10 L4 2 L4 10 L9 2 L9 10 L14 2 L14 10 L19 2 L19 10 L25 4',
    drawbar: 'M3 11 V5 M7 11 V2 M11 11 V4 M15 11 V7 M19 11 V5 M23 11 V8',
    bells: 'M13 2 C8 2 7 6 6 9 H20 C19 6 18 2 13 2 M11 11 H15',
    mallets: 'M1 6 L5 1 L7 9 L9 4 L11 7 L14 5.5 L25 6',
    chip: 'M1 10 V2 H4 V10 H10 V2 H13 V10 H19 V2 H22 V10 H25',
    bass: 'M1 11 L7 3 V11 L13 3 V11 L19 3 V11 L25 3',
    voice: 'M1 6 C3 2 5 2 7 6 S11 10 13 6 S17 2 19 6 S23 10 25 6',
};

export const instrumentLabel = (id: InstrumentId) => (id === 'voice' ? 'the voice' : INSTRUMENTS.find(i => i.id === id)?.label ?? id);

/** How a chord part plays the chords: held, strummed, or arpeggiated. */
export interface ChordStyle {
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
    strumSpread: number;
    strumDirection: StrumDirection;
    strumPattern: StrumPattern;
}

export const STRUM_LABELS: { [d in StrumDirection]: string } = { down: 'Down ↓', up: 'Up ↑', alternate: 'Alt ↕' };
export const STRUM_HINTS: { [d in StrumDirection]: string } = {
    down: 'low note first, like a downstroke',
    up: 'high note first, like an upstroke',
    alternate: 'down, then up, then down… every chord hit',
};
export const ms = (s: number) => `${Math.round(s * 1000)} ms`;

export const KIND_TAG: { [k in PartKind]: string } = { chords: 'Chords', bass: 'Bass', melody: 'Melody', voice: 'Voice', drums: 'Drums' };
export const KIND_HINT: { [k in PartKind]: string } = {
    chords: 'plays the chords',
    bass: 'follows the roots',
    melody: 'your notes',
    voice: 'a voice singing "ooh": the chords, or its own notes',
    drums: 'loops a beat',
};

export const TONE_LABELS: { [k in keyof PartTone]: string } = { pan: 'Pan' };
export const TONE_HINTS: { [k in keyof PartTone]: string } = { pan: 'left to right' };

/** What a tone knob reads as. */

export function toneText(_k: keyof PartTone, v: number): string {
    const p = shapePan(v);
    return Math.abs(p) < 0.02 ? 'centre' : `${Math.round(Math.abs(p) * 100)}% ${p < 0 ? 'L' : 'R'}`;
}

export const SIMPLE_KNOBS: ShapeKnob[] = ['attack', 'release', 'cutoff', 'resonance', 'envAmount', 'drive'];
export const SHAPE_HINTS: { [k in ShapeKnob]: string } = {
    attack: 'Attack: how fast a note comes in. Short = a click or pluck, long = a slow swell',
    decay: 'Decay: how fast it falls from its peak to the Sustain level',
    sustain: 'Sustain: the level a held note settles at',
    release: 'Release: how long a note rings after you let go',
    cutoff: 'Cutoff: where the filter starts cutting the highs. Lower = darker, muffled',
    resonance: 'Resonance: a boost right at the cutoff. Higher = sharper, squelchier, whistling',
    envAmount: 'Env Amount: each note opens (right) or closes (left) the filter, then it settles. Needs the Cutoff turned down to hear',
    lfoDepth: 'LFO Depth: how far the LFO sweeps the cutoff up and down',
    drive: 'Drive: pushes the sound until it saturates. Warm, Crunch or Bitcrush',
};


/** Effect amounts a newly added effect starts at. */
export const FX_START: { [k in keyof PartFx]: number } = { chorus: 0.35, tremolo: 0.4, glide: 0.3, reverb: 0.3, delay: 0.25 };
/** Effects shown under EFFECTS (glide sits with the tone: it's how notes connect). */
export const EFFECT_KEYS = FX_KEYS.filter(k => k !== 'glide');

export const MASTER = 'master';

export const TAB_LABELS: { [t in PartsTab]: string } = { sound: 'Sound', shape: 'Shape', effects: 'Effects' };

export const FILTER_LABELS: { [t in FilterType]: [string, string] } = {
    lowpass: ['Low-pass', 'lets the lows through: turning Cutoff down makes it darker'],
    highpass: ['High-pass', 'lets the highs through: turning Cutoff up makes it thinner'],
    bandpass: ['Band-pass', 'only a band around the cutoff: nasal, like a radio or a telephone'],
};
export const DRIVE_LABELS: { [t in DriveType]: [string, string] } = {
    warm: ['Warm', 'soft saturation: rounder, fuller, like tape or a tube'],
    crunch: ['Crunch', 'hard distortion: buzzy and aggressive'],
    bitcrush: ['Bitcrush', 'fewer bits: grainy, stepped lo-fi, like old samplers'],
};
export const LFO_LABELS: { [r in LfoRate]: string } = { '1n': '1/1', '2n': '1/2', '4n': '1/4', '8n': '1/8', '16n': '1/16', '8t': '1/8T' };
