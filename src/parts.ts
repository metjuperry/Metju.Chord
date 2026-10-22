import { ArpPattern, MusicalKey, ResolvedChord, SCALES, ScaleId, arpOrder, keyPitchClass, resolveChord } from './theory';
import type { ArpRate } from './audio/engine';
import type { InstrumentId } from './audio/instruments';
import { ChordClip, Clip, PPQ, clipEnd, isChordClip, lastEnd, TICKS_PER_BAR } from './progression';
import type { DrumPattern } from './drums';

// ---- parts: everything that plays the song's one chord row, each in its own way -----------------

export type PartKind = 'chords' | 'bass' | 'melody' | 'drums';
export type PlayMode = 'Chord' | 'Arp';
export type BassStyle =
    | 'hold' | 'pulse' | 'eighths' | 'octaves' | 'offbeat' | 'rootFifth' | 'arp' | 'tresillo' | 'walk' | 'kick';

export const BASS_STYLES: { id: BassStyle; label: string; hint: string }[] = [
    { id: 'hold', label: 'Hold', hint: 'the root, held for the whole chord' },
    { id: 'pulse', label: 'Beats', hint: 'the root on every beat' },
    { id: 'eighths', label: '8ths', hint: 'driving 1/8 roots' },
    { id: 'octaves', label: 'Octaves', hint: 'root and the octave above, bouncing in 1/8s (disco)' },
    { id: 'offbeat', label: 'Off-beat', hint: 'the root between the beats, leaving room for the kick (house)' },
    { id: 'rootFifth', label: 'Root–5th', hint: 'root and fifth, beat by beat' },
    { id: 'arp', label: 'Arpeggio', hint: 'up through the chord: root, 3rd, 5th, octave' },
    { id: 'tresillo', label: '3-3-2', hint: 'the 3-3-2 groove: two long notes and a short one' },
    { id: 'walk', label: 'Walk', hint: 'roots, stepping into the next chord on the last beat' },
    { id: 'kick', label: 'Follow kick', hint: 'a note on every kick of the drums, so bass and kick lock together' },
];

/** A melody note: `step` counts scale notes up from the key's root in the part's octave (0–14 is two octaves). */
export interface Note {
    start: number;
    len: number;
    step: number;
}

export const MELODY_STEPS = 15;

/**
 * A part's effects, each 0..1 with 0 meaning off. Drive and chorus colour this part only; reverb and
 * delay are how much of it is sent into the song's shared reverb and delay. Drums only use the sends.
 */
export interface PartFx {
    drive: number;
    chorus: number;
    reverb: number;
    delay: number;
}

export const FX_KEYS: (keyof PartFx)[] = ['drive', 'chorus', 'reverb', 'delay'];
export const noFx = (): PartFx => ({ drive: 0, chorus: 0, reverb: 0, delay: 0 });
/** Drive and chorus would smear a beat, so drum parts only get the reverb and delay sends. */
export const fxAvailable = (kind: PartKind, key: keyof PartFx) => kind !== 'drums' || key === 'reverb' || key === 'delay';

interface PartBase {
    id: string;
    name: string;
    color: string;
    /** Level in dB, 0 = as matched by `npm run levels`. */
    volume: number;
    mute: boolean;
    solo: boolean;
    fx: PartFx;
}

/** Plays the chords: held as block chords, or broken into an arpeggio. */
export interface ChordPart extends PartBase {
    kind: 'chords';
    instrument: InstrumentId;
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    /** Gate of each arp note, in seconds. */
    noteLength: number;
}

/** Follows the chord roots in a chosen rhythm. */
export interface BassPart extends PartBase {
    kind: 'bass';
    instrument: InstrumentId;
    style: BassStyle;
    octave: number;
}

/** Notes you write on a scale-locked grid. */
export interface MelodyPart extends PartBase {
    kind: 'melody';
    instrument: InstrumentId;
    octave: number;
    notes: Note[];
}

/** A drum pattern that loops under the song. */
export interface DrumPart extends PartBase {
    kind: 'drums';
    drums: DrumPattern;
}

export type Part = ChordPart | BassPart | MelodyPart | DrumPart;
export type InstrumentPart = ChordPart | BassPart | MelodyPart;
export const hasInstrument = (p: Part): p is InstrumentPart => p.kind !== 'drums';

/** Part colours. Yellow is left out: it belongs to the chord row and to whatever is active. */
export const PART_COLORS = ['#4fd1c5', '#ff7aa8', '#7fb4ff', '#d38cff', '#c8e06e', '#e8b98a'];
export const MAX_PARTS = PART_COLORS.length;

export const PART_LABELS: { [k in PartKind]: string } = { chords: 'Chords', bass: 'Bass', melody: 'Melody', drums: 'Drums' };

/** The next free id, so parts loaded from a saved song never collide with new ones. */
const nextId = (existing: Part[]) =>
    `p${existing.reduce((m, p) => Math.max(m, parseInt(p.id.replace(/\D/g, ''), 10) || 0), 0) + 1}`;

const DEFAULT_NAMES: { [k in PartKind]: string } = { chords: 'Keys', bass: 'Bass', melody: 'Melody', drums: 'Drums' };

/** A new part of `kind`, named and coloured so it doesn't clash with `existing`. */
export function newPart(kind: PartKind, existing: Part[], drums?: DrumPattern): Part {
    const used = new Set(existing.map(p => p.color));
    const same = existing.filter(p => p.kind === kind).length;
    const base: PartBase = {
        id: nextId(existing),
        name: same ? `${DEFAULT_NAMES[kind]} ${same + 1}` : DEFAULT_NAMES[kind],
        color: PART_COLORS.find(c => !used.has(c)) ?? PART_COLORS[existing.length % PART_COLORS.length],
        volume: 0,
        mute: false,
        solo: false,
        fx: noFx(),
    };
    switch (kind) {
        case 'chords':
            return { ...base, kind, instrument: same ? 'warmpad' : 'epiano', playMode: 'Chord', arpPattern: 'up', arpRate: '8n', noteLength: 0.3 };
        case 'bass':
            return { ...base, kind, instrument: 'bass', style: 'pulse', octave: 2 };
        case 'melody':
            return { ...base, kind, instrument: 'lead', octave: 4, notes: [] };
        case 'drums':
            return { ...base, kind, drums: drums ?? { bars: 1, hits: {} } };
    }
}

/** Parts the sequencer should play: soloed ones if any are soloed, otherwise all that aren't muted. */
export function audibleParts(parts: Part[]): Part[] {
    const soloed = parts.filter(p => p.solo);
    return soloed.length ? soloed : parts.filter(p => !p.mute);
}

// ---- what a part plays ------------------------------------------------------------------------

/** The harmony everything follows: the song's chord row, key and scale. */
export interface Harmony {
    chords: Clip[];
    key: MusicalKey;
    scale: ScaleId;
}

/** Something a part plays: one or more notes from `start` for `len` ticks. */
export interface NoteEvent {
    start: number;
    len: number;
    midi: number[];
    /** How long the notes sound, in seconds, when shorter than `len` (arp gates). */
    gate?: number;
}

export const resolveClip = (h: Harmony, clip: ChordClip): ResolvedChord =>
    resolveChord(h.key, { ...clip.chord, scale: h.scale });

/** The chord sounding at `tick`, if any. */
export const chordAt = (chords: Clip[], tick: number): ChordClip | undefined => {
    const c = chords.find(x => tick >= x.start && tick < clipEnd(x));
    return isChordClip(c) ? c : undefined;
};

export const ARP_RATE_TICKS: { [r in ArpRate]: number } = {
    '4n': PPQ, '8n': PPQ / 2, '8t': PPQ / 3, '16n': PPQ / 4, '16t': PPQ / 6, '32n': PPQ / 8,
};

/** A repeatable shuffle, so a random arpeggio looks and plays the same every time. */
function seeded(seed: number) {
    let a = seed + 0x6d2b79f5;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function arpCycle(midi: number[], pattern: ArpPattern, rand: () => number): number[] {
    if (pattern !== 'random') return arpOrder(midi, pattern);
    const out = [...midi].sort((a, b) => a - b);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export function chordPartNotes(part: ChordPart, h: Harmony): NoteEvent[] {
    const out: NoteEvent[] = [];
    for (const clip of h.chords.filter(isChordClip)) {
        const midi = resolveClip(h, clip).midi;
        if (part.playMode === 'Chord') {
            out.push({ start: clip.start, len: clip.len, midi });
            continue;
        }
        const step = ARP_RATE_TICKS[part.arpRate];
        const rand = seeded(clip.start);
        let cycle = arpCycle(midi, part.arpPattern, rand);
        for (let t = clip.start, k = 0; t < clipEnd(clip); t += step, k++) {
            if (k >= cycle.length) {
                cycle = arpCycle(midi, part.arpPattern, rand);
                k = 0;
            }
            out.push({ start: t, len: Math.min(step, clipEnd(clip) - t), midi: [cycle[k]], gate: part.noteLength });
        }
    }
    return out;
}

/** The chord's fifth above its root, in semitones (6 for diminished, 8 for augmented). */
function fifthOf(chord: ResolvedChord): number {
    const pcs = new Set(chord.midi.map(m => (((m - chord.rootPc) % 12) + 12) % 12));
    return pcs.has(7) ? 7 : pcs.has(6) ? 6 : pcs.has(8) ? 8 : 7;
}

/** Scale steps of `h` as pitch classes. */
const scalePcs = (h: Harmony) => {
    const keyPc = keyPitchClass(h.key);
    return (SCALES.find(s => s.id === h.scale) ?? SCALES[0]).steps.map(s => (keyPc + s) % 12);
};

/** The scale note next to `target`, approaching from `from`'s side. */
function approach(target: number, from: number, pcs: number[]): number {
    const dir = target >= from ? -1 : 1;
    for (let m = target + dir; Math.abs(m - target) <= 2; m += dir) {
        if (pcs.includes(((m % 12) + 12) % 12)) return m;
    }
    return target + dir;
}

/** What a bass line can lock to besides the chords: the beat length and the drums' kick hits (song ticks). */
export interface Groove {
    beatTicks: number;
    kicks?: number[];
}

const SIXTEENTH = PPQ / 4;

export function bassNotes(part: BassPart, h: Harmony, groove: Groove): NoteEvent[] {
    const { beatTicks, kicks = [] } = groove;
    const chords = h.chords.filter(isChordClip);
    const pcs = scalePcs(h);
    const rootMidi = (c: ChordClip) => 12 * (part.octave + 1) + resolveClip(h, c).rootPc;
    const out: NoteEvent[] = [];
    chords.forEach((clip, i) => {
        const chord = resolveClip(h, clip);
        const root = rootMidi(clip);
        const end = clipEnd(clip);
        const note = (t: number, len: number, midi: number) => {
            if (t < end) out.push({ start: t, len: Math.min(len, end - t), midi: [midi] });
        };
        const fifth = fifthOf(chord);
        // keep the fifth below the root when the root sits high, so the line stays low
        const fifthMidi = root + fifth > 12 * (part.octave + 1) + 16 ? root + fifth - 12 : root + fifth;
        const next = chords[i + 1];
        const approachNext = next && next.start === end ? approach(rootMidi(next), root, pcs) : null;

        switch (part.style) {
            case 'hold':
                note(clip.start, clip.len, root);
                break;
            case 'octaves':
                for (let t = clip.start, k = 0; t < end; t += PPQ / 2, k++) note(t, PPQ / 2, k % 2 ? root + 12 : root);
                break;
            case 'offbeat':
                for (let t = clip.start; t < end; t += beatTicks) note(t + beatTicks / 2, beatTicks / 2, root);
                break;
            case 'arp': {
                // the chord's own 3rd (or sus note) and 5th, then the octave
                const tones = [...new Set(chord.midi.map(m => (((m - chord.rootPc) % 12) + 12) % 12))].filter(x => x > 0).sort((a, b) => a - b);
                const third = tones.find(x => x >= 2 && x <= 5) ?? 4;
                const cycle = [0, third, fifth, 12];
                for (let t = clip.start, k = 0; t < end; t += PPQ / 2, k++) note(t, PPQ / 2, root + cycle[k % 4]);
                break;
            }
            case 'tresillo': {
                // 3-3-2 in 1/16s, counted from the top of the song so it lines up across chords
                const cycle = 8 * SIXTEENTH;
                const hits: [number, number, boolean][] = [[0, 3, false], [3, 3, false], [6, 2, true]];
                for (let base = Math.floor(clip.start / cycle) * cycle; base < end; base += cycle) {
                    for (const [at, len, high] of hits) {
                        const t = base + at * SIXTEENTH;
                        if (t >= clip.start) note(t, len * SIXTEENTH, high ? fifthMidi : root);
                    }
                }
                break;
            }
            case 'kick': {
                const here = kicks.filter(k => k >= clip.start && k < end).sort((a, b) => a - b);
                // no drums (or no kick under this chord): hold the root instead
                if (here.length === 0) note(clip.start, clip.len, root);
                here.forEach((t, k) => note(t, Math.min((here[k + 1] ?? end) - t, beatTicks), root));
                break;
            }
            default: {
                // hold handled above; pulse, eighths, root-5th and walk step through the chord
                const every = part.style === 'eighths' ? PPQ / 2 : beatTicks;
                const leadsIn = part.style === 'walk' && approachNext !== null && clip.len >= 2 * beatTicks;
                for (let t = clip.start, k = 0; t < end; t += every, k++) {
                    let m = root;
                    if (part.style === 'rootFifth' && k % 2 === 1) m = fifthMidi;
                    if (leadsIn && t + every >= end) m = approachNext!;
                    note(t, every, m);
                }
            }
        }
    });
    return out;
}

/** The pitch of a melody row. */
export function melodyMidi(part: { octave: number }, h: { key: MusicalKey; scale: ScaleId }, step: number): number {
    const steps = (SCALES.find(s => s.id === h.scale) ?? SCALES[0]).steps;
    return 12 * (part.octave + 1) + keyPitchClass(h.key) + steps[((step % 7) + 7) % 7] + 12 * Math.floor(step / 7);
}

export const melodyNotes = (part: MelodyPart, h: Harmony): NoteEvent[] =>
    part.notes.map(n => ({ start: n.start, len: n.len, midi: [melodyMidi(part, h, n.step)] }));

/** Everything an instrument part plays, in song ticks. */
export function partNotes(part: InstrumentPart, h: Harmony, groove: Groove): NoteEvent[] {
    switch (part.kind) {
        case 'chords': return chordPartNotes(part, h);
        case 'bass': return bassNotes(part, h, groove);
        case 'melody': return melodyNotes(part, h);
    }
}

// ---- melody editing: one note at a time, like a voice ------------------------------------------

/** Put `note` in, cutting short or removing whatever it overlaps. */
export function placeNote(notes: Note[], note: Note): Note[] {
    const end = note.start + note.len;
    const out: Note[] = [];
    for (const n of notes) {
        const ne = n.start + n.len;
        if (ne <= note.start || n.start >= end) out.push(n);
        else if (n.start < note.start) out.push({ ...n, len: note.start - n.start });
        // a note starting inside the new one is replaced by it
    }
    out.push(note);
    return out.sort((a, b) => a.start - b.start);
}

/** The note covering `tick` on row `step`, if any. */
export const noteAt = (notes: Note[], tick: number, step: number) =>
    notes.find(n => n.step === step && tick >= n.start && tick < n.start + n.len);

export const removeNote = (notes: Note[], note: Note) => notes.filter(n => n !== note);

/** Drop or shorten notes past `total` ticks. */
export const fitNotes = (notes: Note[], total: number) =>
    notes.filter(n => n.start < total).map(n => (n.start + n.len > total ? { ...n, len: total - n.start } : n));

// ---- song length ---------------------------------------------------------------------------------

/** Where a part's own material ends: a melody's last note, one pass of a drum pattern. */
const partEnd = (p: Part, barTicks: number) =>
    p.kind === 'melody' ? p.notes.reduce((m, n) => Math.max(m, n.start + n.len), 0)
        : p.kind === 'drums' ? p.drums.bars * barTicks
            : 0;

/** Where the music ends, in ticks: the last chord, melody note or drum pattern. */
export const musicEnd = (chords: Clip[], parts: Part[], barTicks = TICKS_PER_BAR) =>
    Math.max(lastEnd(chords), ...parts.map(p => partEnd(p, barTicks)));

/** Where looping playback wraps: the end of the music rounded up to a whole bar. */
export const musicLoopEnd = (chords: Clip[], parts: Part[], barTicks = TICKS_PER_BAR) =>
    Math.max(barTicks, Math.ceil(musicEnd(chords, parts, barTicks) / barTicks) * barTicks);
