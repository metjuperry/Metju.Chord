import { ArpPattern, MusicalKey, ResolvedChord, SCALES, ScaleId, StrumDirection, arpOrder, keyPitchClass, resolveChord } from './theory';
import { StrumPattern, strokeNotes, strumStrokes, strumVoicing } from './strum';
import type { ArpRate } from './audio/engine';
import type { InstrumentId, ShapeOverrides } from './sound';
import { ChordClip, Clip, PPQ, RestClip, clipEnd, isChordClip, lastEnd, TICKS_PER_BAR } from './progression';
import type { DrumPattern } from './drums';

// ---- parts: everything that plays the song's one chord row, each in its own way -----------------

export type PartKind = 'chords' | 'bass' | 'melody' | 'voice' | 'drums';
export type PlayMode = 'Chord' | 'Strum' | 'Arp';

export { STRUM_SPREADS } from './strum';
export const STRUM_DIRECTIONS: StrumDirection[] = ['down', 'up', 'alternate'];
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

/** A semitone off the scale step: -1 flat, 1 sharp (absent or 0 = natural). */
export type Accidental = -1 | 0 | 1;

/**
 * A melody note: `step` counts scale notes up from the key's root in the part's octave (0–14 is two
 * octaves); `acc` raises or lowers it a semitone (F♯ in A minor is step 5 with acc 1). The note stays
 * a scale step, so it follows key and scale changes (F♯ in A minor becomes C♯ in E minor).
 */
export interface Note {
    start: number;
    len: number;
    step: number;
    /** Left out when natural (saves and links stay as before). */
    acc?: -1 | 1;
}

/** `note` with accidental `acc`; natural drops the field. */
export function withAcc<N extends Note>(note: N, acc: Accidental): N {
    const { acc: _old, ...rest } = note;
    return (acc ? { ...rest, acc } : rest) as N;
}

export const MELODY_STEPS = 15;

/**
 * A part's effects, each 0..1 with 0 meaning off. Chorus, tremolo and glide colour this part only;
 * reverb and delay are how much of it is sent into the song's shared reverb and delay. Drums only use
 * the sends. (Drive lives in the part's shape, sound.ts.)
 */
export interface PartFx {
    chorus: number;
    /** Depth of a volume wobble at 1/8 notes of the song's tempo. */
    tremolo: number;
    /** Portamento: single notes slide in from the part's previous note (see `glideSeconds`). */
    glide: number;
    reverb: number;
    delay: number;
}

export const FX_KEYS: (keyof PartFx)[] = ['chorus', 'tremolo', 'glide', 'reverb', 'delay'];
export const noFx = (): PartFx => ({ chorus: 0, tremolo: 0, glide: 0, reverb: 0, delay: 0 });
/** Chorus, tremolo and glide would smear a beat, so drum parts only get the reverb and delay sends. */
export const fxAvailable = (kind: PartKind, key: keyof PartFx) => kind !== 'drums' || key === 'reverb' || key === 'delay';

/** Glide time in seconds for knob value `v`: 0 off, then up to half a second (fine control at the short end). */
export const glideSeconds = (v: number) => (v <= 0 ? 0 : 0.5 * v * v);

/**
 * Whether a note event glides in from the part's previous note: only single notes do (a bass or
 * melody line, an arpeggio). Block chords never glide: there's no telling which note of one
 * chord should slide to which note of the next.
 */
export const glides = (fx: PartFx, notes: number) => fx.glide > 0 && notes === 1;

/** Where an instrument part sits left to right: 0..1, 0.5 = centre. (How it sounds is its `shape`, sound.ts.) */
export interface PartTone {
    pan: number;
}

export const TONE_KEYS: (keyof PartTone)[] = ['pan'];
export const neutralTone = (): PartTone => ({ pan: 0.5 });

/** Pan position -1 (left) .. 1 (right). */
export const shapePan = (v: number) => Math.max(-1, Math.min(1, (v - 0.5) * 2));

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
    tone: PartTone;
    /** What the part changes of its instrument's envelope, filter and drive; the rest is the instrument's own (sound.ts). */
    shape: ShapeOverrides;
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    /** Gate of each arp note, in seconds. */
    noteLength: number;
    /** Strum: seconds from the first note of a down stroke to the last. */
    strumSpread: number;
    /** Strum: which way a single stroke goes (the pads, and the 'once' pattern). */
    strumDirection: StrumDirection;
    /** Strum: the stroke pattern through each chord (strum.ts). */
    strumPattern: StrumPattern;
}

/** Follows the chord roots in a chosen rhythm. */
export interface BassPart extends PartBase {
    kind: 'bass';
    instrument: InstrumentId;
    tone: PartTone;
    /** What the part changes of its instrument's envelope, filter and drive; the rest is the instrument's own (sound.ts). */
    shape: ShapeOverrides;
    style: BassStyle;
    octave: number;
}

/** Notes you write on a scale-locked grid. */
export interface MelodyPart extends PartBase {
    kind: 'melody';
    instrument: InstrumentId;
    tone: PartTone;
    /** What the part changes of its instrument's envelope, filter and drive; the rest is the instrument's own (sound.ts). */
    shape: ShapeOverrides;
    octave: number;
    notes: Note[];
}

// ---- voice: singers -------------------------------------------------------------------------------

/** The vowel the singers sing. */
export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
export const VOWELS: { id: Vowel; label: string; hint: string }[] = [
    { id: 'a', label: 'A', hint: 'aah, as in "father"' },
    { id: 'e', label: 'E', hint: 'eh, as in "bed"' },
    { id: 'i', label: 'I', hint: 'ee, as in "see"' },
    { id: 'o', label: 'O', hint: 'oh, as in "go"' },
    { id: 'u', label: 'U', hint: 'ooh, as in "moon"' },
];
/** One singer, or a few singing together. */
export type Singers = 'solo' | 'choir';
/** Men's voices or women's. */
export type VoiceRange = 'low' | 'high';
/** What the voice sings: its own notes (played from the keys or written), or the chord row, like a chord part. */
export type Sings = 'notes' | 'chords';

/** How a voice sings, besides its shape: what the engine needs to build the singers. */
export interface VoiceSettings {
    singers: Singers;
    range: VoiceRange;
    vowel: Vowel;
    /** Vibrato depth, 0..1. */
    vibrato: number;
    /** Breath noise, 0..1. */
    breath: number;
}

/** Singers: a solo voice or a choir, singing its own notes or the chords, on a vowel. */
export interface VoicePart extends PartBase, VoiceSettings {
    kind: 'voice';
    /** Always 'voice': the singers' own instrument (their shape's defaults come from it). */
    instrument: 'voice';
    tone: PartTone;
    shape: ShapeOverrides;
    sings: Sings;
    octave: number;
    notes: Note[];
}

export const voiceSettings = (p: VoicePart): VoiceSettings =>
    ({ singers: p.singers, range: p.range, vowel: p.vowel, vibrato: p.vibrato, breath: p.breath });

/** The octave a voice range sings in by default. */
export const RANGE_OCTAVE: { [r in VoiceRange]: number } = { low: 3, high: 4 };

/** A drum pattern that loops under the song. */
export interface DrumPart extends PartBase {
    kind: 'drums';
    drums: DrumPattern;
}

export type Part = ChordPart | BassPart | MelodyPart | VoicePart | DrumPart;
export type InstrumentPart = ChordPart | BassPart | MelodyPart | VoicePart;
export const hasInstrument = (p: Part): p is InstrumentPart => p.kind !== 'drums';
/** Parts with notes of their own, played from the keys in Notes mode and written in the note grid: melodies and voices. */
export type NotesPart = MelodyPart | VoicePart;
export const hasNotes = (p: Part | undefined): p is NotesPart => p?.kind === 'melody' || p?.kind === 'voice';
/** Parts that play their own notes now: a melody, or a voice singing notes (one singing the chords follows the chord row). */
export const writesNotes = (p: Part | undefined): boolean => p?.kind === 'melody' || (p?.kind === 'voice' && p.sings === 'notes');
/** `p` as a part with notes to write, or null (see `writesNotes`). */
export const noteWriter = (p: Part | undefined): NotesPart | null => (hasNotes(p) && writesNotes(p) ? p : null);
/** Parts whose instrument is picked from the instrument list (a voice's is its singers). */
export type PickedPart = ChordPart | BassPart | MelodyPart;
export const picksInstrument = (p: Part): p is PickedPart => hasInstrument(p) && p.kind !== 'voice';

/** Part colours. Yellow is left out: it belongs to the chord row and to whatever is active. */
export const PART_COLORS = ['#4fd1c5', '#ff7aa8', '#7fb4ff', '#d38cff', '#c8e06e', '#e8b98a'];
export const MAX_PARTS = PART_COLORS.length;

export const PART_LABELS: { [k in PartKind]: string } = { chords: 'Chords', bass: 'Bass', melody: 'Melody', voice: 'Voice', drums: 'Drums' };

/** The next free id, so parts loaded from a saved song never collide with new ones. */
const nextId = (existing: Part[]) =>
    `p${existing.reduce((m, p) => Math.max(m, parseInt(p.id.replace(/\D/g, ''), 10) || 0), 0) + 1}`;

const DEFAULT_NAMES: { [k in PartKind]: string } = { chords: 'Keys', bass: 'Bass', melody: 'Melody', voice: 'Voice', drums: 'Drums' };

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
            return { ...base, kind, instrument: same ? 'warmpad' : 'epiano', tone: neutralTone(), shape: {}, playMode: 'Chord', arpPattern: 'up', arpRate: '8n', noteLength: 0.3, strumSpread: 0.035, strumDirection: 'down', strumPattern: 'pop' };
        case 'bass':
            return { ...base, kind, instrument: 'bass', tone: neutralTone(), shape: {}, style: 'pulse', octave: 2 };
        case 'melody':
            return { ...base, kind, instrument: 'lead', tone: neutralTone(), shape: {}, octave: 4, notes: [] };
        case 'voice':
            // a choir on "ooh", singing the chords: something to hear straight away
            return {
                ...base, kind, instrument: 'voice', tone: neutralTone(), shape: {}, fx: { ...noFx(), reverb: 0.35 },
                singers: 'choir', range: 'low', vowel: 'u', vibrato: 0.35, breath: 0.15, sings: 'chords', octave: RANGE_OCTAVE.low, notes: [],
            };
        case 'drums':
            return { ...base, kind, drums: drums ?? { bars: 1, hits: {} } };
    }
}

/** Parts the sequencer should play: soloed ones if any are soloed, otherwise all that aren't muted. */
export function audibleParts(parts: Part[]): Part[] {
    const soloed = parts.filter(p => p.solo);
    return soloed.length ? soloed : parts.filter(p => !p.mute);
}

// ---- rests: each rest on the chord row says which parts it silences -----------------------------

/** What a rest does to a part it doesn't mention: the parts that follow the chords stop, melody and drums play on. */
export const REST_PLAYS: { [k in PartKind]: boolean } = { chords: false, bass: false, melody: true, voice: true, drums: true };

/** A voice singing the chords stops at rests like a chord part; singing its own notes, it goes on like a melody. */
const restPlaysByDefault = (part: Part) => (part.kind === 'voice' ? part.sings === 'notes' : REST_PLAYS[part.kind]);

export const playsThroughRest = (rest: RestClip, part: Part) => rest.plays?.[part.id] ?? restPlaysByDefault(part);

export type Span = [start: number, end: number];

/** Where rests silence `part`, as [start, end) in ticks. */
export const restSpans = (chords: Clip[], part: Part): Span[] =>
    chords.filter((c): c is RestClip => !!c.rest && !playsThroughRest(c, part)).map(c => [c.start, clipEnd(c)]);

export const outsideRests = (spans: Span[], tick: number) => spans.every(([a, b]) => tick < a || tick >= b);

/** `events` without what falls in `spans`: an event starting inside one is dropped, one running into one is cut short. */
export function silence<E extends { start: number; len: number }>(events: E[], spans: Span[]): E[] {
    return events.flatMap(e => {
        if (!outsideRests(spans, e.start)) return [];
        const end = spans.reduce((m, [a]) => (a > e.start && a < m ? a : m), e.start + e.len);
        return [end < e.start + e.len ? { ...e, len: end - e.start } : e];
    });
}

/** The chords `part` follows: a rest it plays through keeps the chord before it going. */
export function chordsFor(part: Part, chords: Clip[]): ChordClip[] {
    const out: ChordClip[] = [];
    for (const c of chords) {
        if (isChordClip(c)) {
            out.push(c);
            continue;
        }
        const last = out[out.length - 1];
        if (last && clipEnd(last) === c.start && playsThroughRest(c, part)) out[out.length - 1] = { ...last, len: last.len + c.len };
    }
    return out;
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
    /** Strummed: each note's start delay in seconds, in the order of `midi`. */
    strum?: number[];
    /** How hard, 0–1 (1 when left out): strum strokes are lighter on up strokes. */
    velocity?: number;
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

export function chordPartNotes(part: ChordPart, h: Harmony, barTicks = TICKS_PER_BAR): NoteEvent[] {
    const out: NoteEvent[] = [];
    let hit = 0;
    for (const clip of chordsFor(part, h.chords)) {
        const midi = resolveClip(h, clip).midi;
        if (part.playMode === 'Chord') {
            out.push({ start: clip.start, len: clip.len, midi });
            continue;
        }
        if (part.playMode === 'Strum') {
            const voicing = strumVoicing(midi);
            const end = clipEnd(clip);
            if (part.strumPattern === 'once') {
                // one stroke, in the part's direction; alternating counts chords along the row, so it
                // doesn't depend on where playback starts
                const down = part.strumDirection === 'down' || (part.strumDirection === 'alternate' && hit++ % 2 === 0);
                const s = strokeNotes(voicing, part.strumSpread, down, down);
                out.push({ start: clip.start, len: clip.len, midi: s.midi, strum: s.offsets, velocity: s.velocity });
                continue;
            }
            // each stroke lasts until the next one (it damps the strings), the last until the chord ends
            const strokes = strumStrokes(part.strumPattern, clip.start, end, barTicks);
            strokes.forEach((k, i) => {
                const until = i + 1 < strokes.length ? strokes[i + 1].at : end;
                const s = strokeNotes(voicing, part.strumSpread, k.down, k.accent);
                out.push({ start: k.at, len: until - k.at, midi: s.midi, strum: s.offsets, velocity: s.velocity });
            });
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
    /** A bar, for patterns that line up to it (strums); 4 beats when left out. */
    barTicks?: number;
    kicks?: number[];
}

const SIXTEENTH = PPQ / 4;

export function bassNotes(part: BassPart, h: Harmony, groove: Groove): NoteEvent[] {
    const { beatTicks, kicks = [] } = groove;
    const chords = chordsFor(part, h.chords);
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

/** The pitch of a melody row, raised or lowered a semitone by `acc`. */
export function melodyMidi(part: { octave: number }, h: { key: MusicalKey; scale: ScaleId }, step: number, acc = 0): number {
    const steps = (SCALES.find(s => s.id === h.scale) ?? SCALES[0]).steps;
    return 12 * (part.octave + 1) + keyPitchClass(h.key) + steps[((step % 7) + 7) % 7] + 12 * Math.floor(step / 7) + acc;
}

/** The pitch a melody note plays: its row, plus its accidental. */
export const noteMidi = (part: { octave: number }, h: { key: MusicalKey; scale: ScaleId }, n: Pick<Note, 'step' | 'acc'>) =>
    melodyMidi(part, h, n.step, n.acc ?? 0);

export const melodyNotes = (part: NotesPart, h: Harmony): NoteEvent[] =>
    silence(part.notes, restSpans(h.chords, part)).map(n => ({ start: n.start, len: n.len, midi: [noteMidi(part, h, n)] }));

/** Everything an instrument part plays, in song ticks. */
export function partNotes(part: InstrumentPart, h: Harmony, groove: Groove): NoteEvent[] {
    switch (part.kind) {
        case 'chords': return chordPartNotes(part, h, groove.barTicks ?? 4 * groove.beatTicks);
        case 'bass': return bassNotes(part, h, groove);
        case 'melody': return melodyNotes(part, h);
        case 'voice': return part.sings === 'chords' ? voiceChordNotes(part, h) : melodyNotes(part, h);
    }
}

/** The chord row's chords as a voice sings them: block chords, moved by octaves into the voice's range. */
export function voiceChordNotes(part: VoicePart, h: Harmony): NoteEvent[] {
    // chords resolve around C4; a choir in octave 3 sings them an octave lower
    const shift = 12 * (part.octave - 4);
    return chordsFor(part, h.chords).map(clip => ({ start: clip.start, len: clip.len, midi: resolveClip(h, clip).midi.map(m => m + shift) }));
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

/** The notes starting in [from, to), cut off at `to` and moved to start at 0: a copied stretch of a melody. */
export const notesIn = (notes: Note[], from: number, to: number): Note[] =>
    notes
        .filter(n => n.start >= from && n.start < to)
        .map(n => ({ ...n, start: n.start - from, len: Math.min(n.len, to - n.start) }));

/**
 * Replace the stretch [at, at + span) with `clip` (positioned from 0, moved to `at`): notes starting
 * inside it go, a note running into it from before is cut short, notes after it stay.
 * `span` = Infinity replaces everything from `at` on (a whole lane).
 */
export function replaceRange(notes: Note[], at: number, span: number, clip: Note[]): Note[] {
    const end = at + span;
    const kept = notes
        .filter(n => n.start < at || n.start >= end)
        .map(n => (n.start < at && n.start + n.len > at ? { ...n, len: at - n.start } : n));
    const placed = clip.map(n => ({ ...n, start: n.start + at, len: Math.min(n.len, end - (n.start + at)) })).filter(n => n.len > 0);
    return [...kept, ...placed].sort((x, y) => x.start - y.start);
}

/**
 * Melody notes copied from a part at octave `from`, for a part at octave `to` in a section `total`
 * ticks long: same pitches (steps move 7 per octave), notes outside the grid's two octaves or past
 * the end left out (and counted), notes running past the end shortened.
 */
export function pasteNotes(notes: Note[], from: number, to: number, total: number): { notes: Note[]; dropped: number } {
    const shift = 7 * (from - to);
    const moved = notes
        .map(n => ({ ...n, step: n.step + shift }))
        .filter(n => n.step >= 0 && n.step < MELODY_STEPS);
    const fitted = fitNotes(moved, total);
    return { notes: fitted, dropped: notes.length - fitted.length };
}

// ---- song length ---------------------------------------------------------------------------------

/** Where a part's own material ends: a melody's last note, one pass of a drum pattern. */
const partEnd = (p: Part, barTicks: number) =>
    hasNotes(p) ? p.notes.reduce((m, n) => Math.max(m, n.start + n.len), 0)
        : p.kind === 'drums' ? p.drums.bars * barTicks
            : 0;

/** Where the music ends, in ticks: the last chord, melody note or drum pattern. */
export const musicEnd = (chords: Clip[], parts: Part[], barTicks = TICKS_PER_BAR) =>
    Math.max(lastEnd(chords), ...parts.map(p => partEnd(p, barTicks)));

/** Where looping playback wraps: the end of the music rounded up to a whole bar. */
export const musicLoopEnd = (chords: Clip[], parts: Part[], barTicks = TICKS_PER_BAR) =>
    Math.max(barTicks, Math.ceil(musicEnd(chords, parts, barTicks) / barTicks) * barTicks);
