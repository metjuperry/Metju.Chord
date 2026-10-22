import { ArpPattern, KEYS, MusicalKey, ChordType, SCALE_IDS, ScaleId } from './theory';
import type { ArpRate } from './audio/engine';
import { INSTRUMENTS, InstrumentId } from './audio/instruments';
import { Clip, PPQ, STEPS_PER_ROW } from './progression';
import { DRUM_VOICES, DrumPattern, PATTERN_BARS, PatternBars, TICKS_PER_SIXTEENTH, fitPattern, sixteenthsPerBar } from './drums';
import { BASS_STYLES, BassStyle, FX_KEYS, MAX_PARTS, MELODY_STEPS, Note, PART_COLORS, Part, PartFx, PartKind, PlayMode, fxAvailable, newPart } from './parts';

// ---- the song: everything undo/redo, saving and sharing cover ---------------------------

export interface TimeSignature {
    /** Beats per bar (2–12). */
    beats: number;
    /** Note value of one beat, and of one sequencer step: 4 = quarter, 8 = eighth. */
    unit: 4 | 8;
}

/** One sequencer step is one beat of the time signature: a quarter (x/4) or an eighth (x/8). */
export const ticksPerStep = (ts: TimeSignature) => (PPQ * 4) / ts.unit;
export const ticksPerBar = (ts: TimeSignature) => ticksPerStep(ts) * ts.beats;

/** Signatures offered in the picker. */
export const TIME_SIGNATURES: TimeSignature[] = [
    { beats: 2, unit: 4 }, { beats: 3, unit: 4 }, { beats: 4, unit: 4 }, { beats: 5, unit: 4 },
    { beats: 6, unit: 8 }, { beats: 7, unit: 8 }, { beats: 9, unit: 8 }, { beats: 12, unit: 8 },
];
export const tsLabel = (ts: TimeSignature) => `${ts.beats}/${ts.unit}`;

/** A sequencer row holds whole bars and is about 8 steps wide: 4/4 → 8, 3/4 → 9, 6/8 → 6. */
export const stepsPerRow = (ts: TimeSignature) => ts.beats * Math.max(1, Math.round(8 / ts.beats));

/** Compound meters (6/8, 9/8, 12/8) are felt in groups of three beats. */
export const isCompound = (ts: TimeSignature) => ts.unit === 8 && ts.beats % 3 === 0;

/** The Transport counts quarter notes; the song's BPM counts its own beats. */
export const transportBpm = (bpm: number, ts: TimeSignature) => (bpm * 4) / ts.unit;

/**
 * Switch time signature. Every chord keeps its step position and length, so a chord on step 5
 * stays on step 5; the song grows to a whole number of rows of the new size.
 */
export function changeTimeSignature(song: Song, next: TimeSignature): Song {
    const from = song.timeSignature;
    if (from.beats === next.beats && from.unit === next.unit) return song;
    const scale = ticksPerStep(next) / ticksPerStep(from);
    const row = stepsPerRow(next);
    // about as long as before (nearest whole number of rows), but never cutting off a chord
    const contentSteps = Math.max(0, ...song.chords.map(c => (c.start + c.len) / ticksPerStep(from)));
    const steps = Math.max(row, Math.round(song.steps / row) * row, Math.ceil(contentSteps / row) * row);
    // melody notes move with the beats, snapped back onto the 1/16 grid
    const snap = (t: number) => Math.round((t * scale) / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH;
    return {
        ...song,
        timeSignature: next,
        steps,
        chords: song.chords.map(c => ({ ...c, start: Math.round(c.start * scale), len: Math.max(1, Math.round(c.len * scale)) })),
        parts: song.parts.map(p => {
            if (p.kind === 'drums') return { ...p, drums: fitPattern(p.drums, next) };
            if (p.kind === 'melody') return { ...p, notes: p.notes.map(n => ({ ...n, start: snap(n.start), len: Math.max(TICKS_PER_SIXTEENTH, snap(n.len)) })) };
            return p;
        }),
    };
}

/** Delay times offered for the shared delay, synced to the tempo. */
export const DELAY_TIMES = ['16n', '8n', '8t', '4n', '2n'] as const;
export type DelayTime = (typeof DELAY_TIMES)[number];

/** The shared effects every part can send into, and the output. */
export interface Space {
    /** Reverb length in seconds, and how loud the reverb comes back (0..1). */
    reverb: { size: number; ret: number };
    /** Delay time (tempo-synced), feedback (0..0.9) and how loud it comes back (0..1). */
    delay: { time: DelayTime; feedback: number; ret: number };
    /** Overall level into the limiter (0..1; 1 is the level the instruments are matched at). */
    out: { level: number };
}

export const defaultSpace = (): Space => ({
    reverb: { size: 2.5, ret: 0.8 },
    delay: { time: '8n', feedback: 0.35, ret: 0.7 },
    out: { level: 1 },
});

export interface Song {
    /** Key and scale of the whole song: changing them transposes or re-harmonises every part. */
    key: MusicalKey;
    scale: ScaleId;
    /** The one chord row every part follows. */
    chords: Clip[];
    parts: Part[];
    /** Length of the sequencer, in steps. */
    steps: number;
    bpm: number;
    timeSignature: TimeSignature;
    space: Space;
}

/** Live playing settings, saved with the song but not part of undo. */
export interface Settings {
    /** Pick each chord's inversion automatically so it moves as little as possible from the last one. */
    voiceLeading: boolean;
    octave: number;
    inversion: number;
    loop: boolean;
    theme: 'dark' | 'light';
}

export interface SavedState {
    version: 2;
    song: Song;
    settings: Settings;
}

export const SAVE_VERSION = 2;
export const STORAGE_KEY = 'metju.chord.v2';

/** A new song: Keys, Bass and an empty Melody, all following an empty chord row. */
export function newSong(): Song {
    const parts: Part[] = [];
    for (const kind of ['chords', 'bass', 'melody'] as PartKind[]) parts.push(newPart(kind, parts));
    return {
        key: 'C',
        scale: 'major',
        chords: [],
        parts,
        steps: stepsPerRow({ beats: 4, unit: 4 }),
        bpm: 100,
        timeSignature: { beats: 4, unit: 4 },
        space: defaultSpace(),
    };
}

export const defaultSettings = (): Settings => ({
    voiceLeading: false, octave: 4, inversion: 0, loop: true, theme: 'dark',
});

// ---- reading saved data: anything malformed is dropped or replaced with a default --------

const CHORD_TYPES: ChordType[] = ['root', 'triad', 'flip', 'minor', 'dim', 'aug', 'six', 'dom7', 'diatonic7', 'diatonic9', 'sus2', 'sus4'];
const ARP_PATTERNS: ArpPattern[] = ['up', 'down', 'upDown', 'random'];
const ARP_RATES: ArpRate[] = ['4n', '8n', '8t', '16n', '16t', '32n'];
const INSTRUMENT_IDS = INSTRUMENTS.map(i => i.id) as string[];

type Obj = { [k: string]: unknown };
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const int = (v: unknown, min: number, max: number, fallback: number) => Math.round(num(v, min, max, fallback));
const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

function readClip(v: unknown, maxTick: number): Clip | null {
    if (!isObj(v)) return null;
    const start = int(v.start, 0, maxTick, -1);
    const len = int(v.len, 1, maxTick, -1);
    if (start < 0 || len < 1 || start + len > maxTick) return null;
    if (v.rest === true) {
        const plays = isObj(v.plays) ? Object.entries(v.plays).filter(([, on]) => typeof on === 'boolean') : [];
        return plays.length ? { start, len, rest: true, plays: Object.fromEntries(plays) as { [id: string]: boolean } } : { start, len, rest: true };
    }
    const c = v.chord;
    if (!isObj(c)) return null;
    if (!CHORD_TYPES.includes(c.type as ChordType)) return null;
    return {
        start,
        len,
        chord: {
            degree: int(c.degree, 0, 6, 0),
            type: c.type as ChordType,
            inversion: int(c.inversion, 0, 4, 0),
            octave: int(c.octave, 1, 7, 4),
        },
    };
}

/** Clips sorted, dropping anything that overlaps the clip before it. */
const sortClips = (clips: Clip[]) => clips
    .sort((a, b) => a.start - b.start)
    .filter((c, i, all) => i === 0 || c.start >= all[i - 1].start + all[i - 1].len);

function readPattern(v: unknown, barLen: number): DrumPattern {
    const src = isObj(v) ? v : {};
    const bars = oneOf<PatternBars>(src.bars, PATTERN_BARS, 1);
    const len = bars * barLen;
    const hitsIn = isObj(src.hits) ? src.hits : {};
    const hits: DrumPattern['hits'] = {};
    for (const voice of DRUM_VOICES) {
        const list = hitsIn[voice];
        if (!Array.isArray(list)) continue;
        const kept = [...new Set(list.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < len))].sort((a, b) => a - b);
        if (kept.length) hits[voice] = kept;
    }
    return { bars, hits };
}

function readNotes(v: unknown, maxTick: number): Note[] {
    if (!Array.isArray(v)) return [];
    const notes = v.flatMap((n): Note[] => {
        if (!isObj(n)) return [];
        const start = int(n.start, 0, maxTick, -1);
        const len = int(n.len, 1, maxTick, -1);
        if (start < 0 || len < 1 || start + len > maxTick) return [];
        return [{ start, len, step: int(n.step, 0, MELODY_STEPS - 1, 0) }];
    });
    // one note at a time: drop any that overlaps the one before
    return notes.sort((a, b) => a.start - b.start).filter((n, i, all) => i === 0 || n.start >= all[i - 1].start + all[i - 1].len);
}

const PART_KINDS: PartKind[] = ['chords', 'bass', 'melody', 'drums'];

function readFx(v: unknown, kind: PartKind): PartFx {
    const src = isObj(v) ? v : {};
    const fx = {} as PartFx;
    for (const k of FX_KEYS) fx[k] = fxAvailable(kind, k) ? num(src[k], 0, 1, 0) : 0;
    return fx;
}

function readSpace(v: unknown): Space {
    const d = defaultSpace();
    const src = isObj(v) ? v : {};
    const rev = isObj(src.reverb) ? src.reverb : {};
    const dly = isObj(src.delay) ? src.delay : {};
    const out = isObj(src.out) ? src.out : {};
    return {
        reverb: { size: num(rev.size, 0.3, 8, d.reverb.size), ret: num(rev.ret, 0, 1, d.reverb.ret) },
        delay: { time: oneOf(dly.time, DELAY_TIMES, d.delay.time), feedback: num(dly.feedback, 0, 0.9, d.delay.feedback), ret: num(dly.ret, 0, 1, d.delay.ret) },
        out: { level: num(out.level, 0, 1, d.out.level) },
    };
}

function readPart(v: unknown, index: number, existing: Part[], maxTick: number, barLen: number): Part | null {
    if (!isObj(v) || !PART_KINDS.includes(v.kind as PartKind)) return null;
    const kind = v.kind as PartKind;
    const base = newPart(kind, existing);
    const common = {
        id: typeof v.id === 'string' && v.id && !existing.some(p => p.id === v.id) ? v.id : base.id,
        name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 24) : base.name,
        color: oneOf(v.color, PART_COLORS, PART_COLORS[index % PART_COLORS.length]),
        volume: int(v.volume, -24, 6, 0),
        mute: bool(v.mute, false),
        solo: bool(v.solo, false),
        fx: readFx(v.fx, kind),
    };
    const instrument = () => oneOf(v.instrument, INSTRUMENT_IDS, (base as { instrument: string }).instrument) as InstrumentId;
    switch (kind) {
        case 'chords':
            return {
                ...common, kind, instrument: instrument(),
                playMode: oneOf<PlayMode>(v.playMode, ['Chord', 'Arp'], 'Chord'),
                arpPattern: oneOf(v.arpPattern, ARP_PATTERNS, 'up'),
                arpRate: oneOf(v.arpRate, ARP_RATES, '8n'),
                noteLength: num(v.noteLength, 0.05, 2, 0.3),
            };
        case 'bass':
            return {
                ...common, kind, instrument: instrument(),
                style: oneOf<BassStyle>(v.style, BASS_STYLES.map(b => b.id), 'pulse'),
                octave: int(v.octave, 1, 3, 2),
            };
        case 'melody':
            return { ...common, kind, instrument: instrument(), octave: int(v.octave, 3, 5, 4), notes: readNotes(v.notes, maxTick) };
        case 'drums':
            return { ...common, kind, drums: readPattern(v.drums, barLen) };
    }
}

/** Rebuild a song from untrusted data (a file, a link, storage). Returns null if it isn't a song at all. */
export function readSong(v: unknown): Song | null {
    if (!isObj(v) || !Array.isArray(v.parts) || !Array.isArray(v.chords)) return null;
    const ts = isObj(v.timeSignature) ? v.timeSignature : {};
    const timeSignature: TimeSignature = { beats: int(ts.beats, 2, 12, 4), unit: oneOf<4 | 8>(ts.unit, [4, 8], 4) };
    const steps = int(v.steps, 1, 512, STEPS_PER_ROW);
    const maxTick = steps * ticksPerStep(timeSignature);
    const parts: Part[] = [];
    v.parts.slice(0, MAX_PARTS).forEach((p, i) => {
        const part = readPart(p, i, parts, maxTick, sixteenthsPerBar(timeSignature));
        if (part) parts.push(part);
    });
    // the pads always need a chord part to play through
    if (!parts.some(p => p.kind === 'chords')) {
        if (parts.length >= MAX_PARTS) parts.pop();
        parts.unshift(newPart('chords', parts));
    }
    return {
        key: oneOf(v.key, KEYS, 'C'),
        scale: oneOf<ScaleId>(v.scale, SCALE_IDS, 'major'),
        chords: sortClips(v.chords.map(c => readClip(c, maxTick)).filter((c): c is Clip => c !== null)),
        parts,
        steps,
        bpm: int(v.bpm, 40, 240, 100),
        timeSignature,
        space: readSpace(v.space),
    };
}

export function readSettings(v: unknown): Settings {
    const d = defaultSettings();
    if (!isObj(v)) return d;
    return {
        voiceLeading: bool(v.voiceLeading, d.voiceLeading),
        octave: int(v.octave, 2, 6, d.octave),
        inversion: int(v.inversion, 0, 3, d.inversion),
        loop: bool(v.loop, d.loop),
        theme: oneOf<'dark' | 'light'>(v.theme, ['dark', 'light'], d.theme),
    };
}

export function readSaved(v: unknown): SavedState | null {
    if (!isObj(v) || v.version !== SAVE_VERSION) return null;
    const song = readSong(v.song);
    return song ? { version: SAVE_VERSION, song, settings: readSettings(v.settings) } : null;
}

// ---- share links: the saved state, deflated and base64url-encoded into the URL hash -----

const toBase64Url = (bytes: Uint8Array) => {
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, ch => ch.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
}

/** `#song=<data>`; deflated when the browser can, plain otherwise (prefix `z` / `p`). */
export async function encodeShare(state: SavedState): Promise<string> {
    const json = new TextEncoder().encode(JSON.stringify(state));
    if (typeof CompressionStream !== 'undefined') {
        return `z${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
    }
    return `p${toBase64Url(json)}`;
}

export async function decodeShare(data: string): Promise<unknown> {
    const bytes = fromBase64Url(data.slice(1));
    const raw = data[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return JSON.parse(new TextDecoder().decode(raw));
}
