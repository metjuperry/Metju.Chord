import { ArpPattern, KEYS, MusicalKey, ChordType, SCALE_IDS, ScaleId } from './theory';
import type { ArpRate } from './audio/engine';
import { INSTRUMENTS, InstrumentId } from './audio/instruments';
import { Clip, PPQ, STEPS_PER_ROW } from './progression';
import { DRUM_VOICES, DrumPattern, PATTERN_BARS, PatternBars, TICKS_PER_SIXTEENTH, emptyPattern, fitPattern, isEmptyPattern, sixteenthsPerBar } from './drums';
import type { LearnTab } from './learn';
import { STRUM_PATTERN_IDS, StrumPattern, nearestSpread } from './strum';
import { legacyShape, readShape } from './sound';
import { BASS_STYLES, BassStyle, FX_KEYS, MAX_PARTS, MELODY_STEPS, Note, PART_COLORS, Part, PartFx, PartKind, PartTone, PlayMode, STRUM_DIRECTIONS, TONE_KEYS, fxAvailable, neutralTone, newPart } from './parts';

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

/**
 * One section of the song as the editors and playback see it: its chord row and length, with every
 * part's content for this section (melody notes, drum pattern) filled into the parts. This was the
 * whole song before sections (save format v2); now `sectionView(fullSong, id)` builds one and
 * `applySectionEdit` writes edits made to it back into that section.
 */
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

/** What a section holds for one part: a Melody part's notes or a Drums part's pattern. */
export interface PartContent {
    notes?: Note[];
    drums?: DrumPattern;
}

/** A section (verse, chorus…): its own chord row, length, melody notes and drum patterns, and per-section mutes. */
export interface Section {
    id: string;
    name: string;
    /** Shown on the dark badge, e.g. "V" for Verse. */
    letter: string;
    /** Length in sequencer steps (beats), whole rows. */
    steps: number;
    chords: Clip[];
    content: { [partId: string]: PartContent };
    /** Parts silenced in this section only. */
    mutes: { [partId: string]: true };
    /**
     * How parts sound and play in this section where that differs from the song: instrument, volume,
     * effects, pan, shape, play mode and so on (anything but a part's name, colour, mute and solo).
     * Only the differences are kept; `sectionView` lays them over the song's parts.
     */
    sound?: { [partId: string]: SectionSound };
}

/** A section's own values for some of a part's settings (see `Section.sound`). */
export type SectionSound = { [key: string]: unknown };

/** One slot of the chain (the song's running order); a repeat is the same section twice in a row. */
export interface ChainEntry {
    sectionId: string;
}

/**
 * The whole song (save format v3): everything song-wide (key, scale, tempo, time signature, the shared
 * effects, and the parts: instrument, tone, effects, volume, style), its sections and the chain. Parts
 * carry no content here (a Melody part's `notes` is empty, a Drums part's `drums` an empty pattern):
 * that lives in each section's `content`.
 */
export interface FullSong {
    key: MusicalKey;
    scale: ScaleId;
    bpm: number;
    timeSignature: TimeSignature;
    space: Space;
    parts: Part[];
    sections: Section[];
    chain: ChainEntry[];
}

export const MAX_SECTIONS = 26;
export const MAX_CHAIN = 128;

/** Light, dark, or following the system (`prefers-color-scheme`). */
export type ThemeSetting = 'dark' | 'light' | 'auto';
export const THEMES: ThemeSetting[] = ['light', 'dark', 'auto'];

/** Live playing settings, saved with the song but not part of undo. */
export interface Settings {
    /** Pick each chord's inversion automatically so it moves as little as possible from the last one. */
    voiceLeading: boolean;
    octave: number;
    inversion: number;
    loop: boolean;
    theme: ThemeSetting;
    /** Show the chords that commonly come next on the screen. */
    nextHint: boolean;
    /** The chord part the pads play through ('' = the first chord part). */
    padPart: string;
    /** The click plays the downbeat higher (and the middle of compound bars a little higher). */
    clickAccent: boolean;
    /** The section open in Song (and looped in Loop mode). */
    openSection: string;
    /** Play the chain of sections, or loop the open one. */
    playMode: PlaybackMode;
    /** The Learn page's last tab. */
    learnTab: LearnTab;
    /** Play mode's chord info adds a one-word mood ("i · 9th · bittersweet"). */
    chordMood: boolean;
    /** While stopped, changing a part's sound in Parts plays its root on the beat, to hear the change. */
    soundPreview: boolean;
}

export type PlaybackMode = 'loop' | 'chain';

export interface SavedState {
    version: 3;
    song: FullSong;
    settings: Settings;
}

export const SAVE_VERSION = 3;
export const STORAGE_KEY = 'metju.chord.v3';
/** Where version 2 kept the song; read once if there's nothing under `STORAGE_KEY` yet (and left alone). */
export const LEGACY_STORAGE_KEY = 'metju.chord.v2';

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
    voiceLeading: false, octave: 4, inversion: 0, loop: true, theme: 'dark', nextHint: true, padPart: '', clickAccent: true,
    openSection: '', playMode: 'loop', learnTab: 'progressions', chordMood: false, soundPreview: true,
});

/** A part without its content: what a FullSong keeps song-wide. */
export function stripContent(p: Part): Part {
    if (p.kind === 'melody') return p.notes.length ? { ...p, notes: [] } : p;
    if (p.kind === 'drums') return p.drums.bars === 1 && Object.keys(p.drums.hits).length === 0 ? p : { ...p, drums: emptyPattern() };
    return p;
}

/** A part's content in a section view, ready to store in the section. */
export function contentOf(p: Part): PartContent | undefined {
    if (p.kind === 'melody') return p.notes.length ? { notes: p.notes } : undefined;
    if (p.kind === 'drums') return isEmptyPattern(p.drums) && p.drums.bars === 1 ? undefined : { drums: p.drums };
    return undefined;
}

// ---- a section's own sound for a part ----------------------------------------------------------

/** What a part is everywhere: its identity, its song-wide mute and solo, and its content. A section can set everything else its own way. */
const SONG_WIDE_KEYS = ['id', 'kind', 'name', 'color', 'mute', 'solo', 'notes', 'drums'];
export const isSoundKey = (k: string) => !SONG_WIDE_KEYS.includes(k);
/** Keys that change the engine strip a part plays through (the rest only changes which notes it plays). */
export const STRIP_KEYS = ['instrument', 'volume', 'fx', 'tone', 'shape'];

/** Equal values, looking one level into objects (fx, tone and shape are flat records). */
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!isObj(a) || !isObj(b)) return false;
    const ka = Object.keys(a).filter(k => a[k] !== undefined);
    const kb = Object.keys(b).filter(k => b[k] !== undefined);
    return ka.length === kb.length && ka.every(k => a[k] === b[k]);
}

/** A part as it sounds in a section: the section's own values laid over the song's. */
export const withSound = (p: Part, own: SectionSound | undefined): Part => (own && Object.keys(own).length ? { ...p, ...own } as Part : p);

/** A version-2 song (one chord row) as a version-3 song: one section "A" holding all of it, chained once. */
export function fromSingleSection(song: Song, id = 's1', name = 'A'): FullSong {
    const content: Section['content'] = {};
    song.parts.forEach(p => {
        const c = contentOf(p);
        if (c) content[p.id] = c;
    });
    return {
        key: song.key,
        scale: song.scale,
        bpm: song.bpm,
        timeSignature: song.timeSignature,
        space: song.space,
        parts: song.parts.map(stripContent),
        sections: [{ id, name, letter: name.charAt(0).toUpperCase() || 'A', steps: song.steps, chords: song.chords, content, mutes: {} }],
        chain: [{ sectionId: id }],
    };
}

/** A new song: one section, Keys, Bass and an empty Melody. */
export const newFullSong = (): FullSong => fromSingleSection(newSong());

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
        const step = int(n.step, 0, MELODY_STEPS - 1, 0);
        // only a flat or a sharp is kept; anything else (missing, 0, 2, "#"...) is natural and left out
        return [n.acc === 1 || n.acc === -1 ? { start, len, step, acc: n.acc } : { start, len, step }];
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

function readTone(v: unknown): PartTone {
    const src = isObj(v) ? v : {};
    const d = neutralTone();
    const tone = {} as PartTone;
    for (const k of TONE_KEYS) tone[k] = num(src[k], 0, 1, d[k]);
    return tone;
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
    const inst = oneOf(v.instrument, INSTRUMENT_IDS, (base as { instrument: string }).instrument) as InstrumentId;
    const instrument = () => inst;
    const tone = readTone(v.tone);
    // the part's sound shape; a song saved before it had relative Attack/Release/Brightness knobs and a
    // Drive effect, which turn into the same sound as shape changes
    const oldTone = isObj(v.tone) ? v.tone : {};
    const oldFx = isObj(v.fx) ? v.fx : {};
    const shape = isObj(v.shape)
        ? readShape(v.shape)
        : readShape(legacyShape(inst, {
            attack: typeof oldTone.attack === 'number' ? oldTone.attack : undefined,
            release: typeof oldTone.release === 'number' ? oldTone.release : undefined,
            brightness: typeof oldTone.brightness === 'number' ? oldTone.brightness : undefined,
        }, typeof oldFx.drive === 'number' ? oldFx.drive : undefined));
    switch (kind) {
        case 'chords':
            return {
                ...common, kind, instrument: instrument(), tone, shape,
                playMode: oneOf<PlayMode>(v.playMode, ['Chord', 'Strum', 'Arp'], 'Chord'),
                arpPattern: oneOf(v.arpPattern, ARP_PATTERNS, 'up'),
                arpRate: oneOf(v.arpRate, ARP_RATES, '8n'),
                noteLength: num(v.noteLength, 0.05, 2, 0.3),
                // older saves had 12–60 ms spreads: they snap to the nearest speed offered now
                strumSpread: nearestSpread(num(v.strumSpread, 0.005, 0.1, 0.035)),
                strumDirection: oneOf(v.strumDirection, STRUM_DIRECTIONS, 'down'),
                strumPattern: oneOf<StrumPattern>(v.strumPattern, STRUM_PATTERN_IDS, 'pop'),
            };
        case 'bass':
            return {
                ...common, kind, instrument: instrument(), tone, shape,
                style: oneOf<BassStyle>(v.style, BASS_STYLES.map(b => b.id), 'pulse'),
                octave: int(v.octave, 1, 3, 2),
            };
        case 'melody':
            return { ...common, kind, instrument: instrument(), tone, shape, octave: int(v.octave, 3, 5, 4), notes: readNotes(v.notes, maxTick) };
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
        theme: oneOf<ThemeSetting>(v.theme, THEMES, d.theme),
        nextHint: bool(v.nextHint, d.nextHint),
        padPart: typeof v.padPart === 'string' ? v.padPart.slice(0, 24) : d.padPart,
        clickAccent: bool(v.clickAccent, d.clickAccent),
        openSection: typeof v.openSection === 'string' ? v.openSection.slice(0, 24) : d.openSection,
        playMode: oneOf<PlaybackMode>(v.playMode, ['loop', 'chain'], d.playMode),
        learnTab: oneOf<LearnTab>(v.learnTab, ['progressions', 'chords', 'melody'], d.learnTab),
        chordMood: bool(v.chordMood, d.chordMood),
        soundPreview: bool(v.soundPreview, d.soundPreview),
    };
}

/** A section's name, cleaned; an empty one falls back to `fallback`. */
export const cleanName = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 24) : fallback);
/** The badge letter for a name: its first letter or digit, upper case. */
export const letterFor = (name: string) => (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();

/**
 * A section's own sound for each part, repaired the way a part is: its values are laid over the song's
 * part and read back, and only what then differs from the song is kept. Undefined when nothing is.
 */
function readSectionSound(v: unknown, parts: Part[], barLen: number): Section['sound'] {
    if (!isObj(v)) return undefined;
    const out: NonNullable<Section['sound']> = {};
    parts.forEach((p, i) => {
        const raw = v[p.id];
        if (!isObj(raw)) return;
        const own = Object.fromEntries(Object.entries(raw).filter(([k]) => isSoundKey(k)));
        const read = readPart({ ...p, ...own }, i, [], 0, barLen);
        if (!read || read.kind !== p.kind) return;
        const keep: SectionSound = {};
        for (const k of Object.keys(own)) {
            const val = (read as unknown as Obj)[k];
            if (k in read && !sameValue(val, (p as unknown as Obj)[k])) keep[k] = val;
        }
        if (Object.keys(keep).length) out[p.id] = keep;
    });
    return Object.keys(out).length ? out : undefined;
}

/**
 * Rebuild a version-3 song from untrusted data. Sections are repaired like a v2 song's chord row
 * (clamped, overlaps dropped, unknown parts' content dropped); chain entries naming no section are
 * dropped; there is always at least one section and the chain is never empty.
 */
export function readFullSong(v: unknown): FullSong | null {
    if (!isObj(v) || !Array.isArray(v.parts) || !Array.isArray(v.sections)) return null;
    const ts = isObj(v.timeSignature) ? v.timeSignature : {};
    const timeSignature: TimeSignature = { beats: int(ts.beats, 2, 12, 4), unit: oneOf<4 | 8>(ts.unit, [4, 8], 4) };
    const barLen = sixteenthsPerBar(timeSignature);
    const parts: Part[] = [];
    v.parts.slice(0, MAX_PARTS).forEach((p, i) => {
        const part = readPart(p, i, parts, 0, barLen);
        if (part) parts.push(stripContent(part));
    });
    if (!parts.some(p => p.kind === 'chords')) {
        if (parts.length >= MAX_PARTS) parts.pop();
        parts.unshift(newPart('chords', parts));
    }
    const sections: Section[] = [];
    v.sections.slice(0, MAX_SECTIONS).forEach((raw, i) => {
        if (!isObj(raw)) return;
        const id = typeof raw.id === 'string' && raw.id && raw.id.length <= 24 && !sections.some(x => x.id === raw.id) ? raw.id : `s${i + 1}${sections.some(x => x.id === `s${i + 1}`) ? 'b' : ''}`;
        const name = cleanName(raw.name, String.fromCharCode(65 + (i % 26)));
        const letter = typeof raw.letter === 'string' && raw.letter.trim() ? raw.letter.trim().slice(0, 2).toUpperCase() : letterFor(name);
        const steps = int(raw.steps, 1, 512, STEPS_PER_ROW);
        const maxTick = steps * ticksPerStep(timeSignature);
        const chords = Array.isArray(raw.chords) ? sortClips(raw.chords.map(c => readClip(c, maxTick)).filter((c): c is Clip => c !== null)) : [];
        const content: Section['content'] = {};
        const src = isObj(raw.content) ? raw.content : {};
        for (const p of parts) {
            const c = src[p.id];
            if (!isObj(c)) continue;
            if (p.kind === 'melody') {
                const notes = readNotes(c.notes, maxTick);
                if (notes.length) content[p.id] = { notes };
            } else if (p.kind === 'drums' && isObj(c.drums)) {
                content[p.id] = { drums: readPattern(c.drums, barLen) };
            }
        }
        const mutes: Section['mutes'] = {};
        if (isObj(raw.mutes)) for (const p of parts) if (raw.mutes[p.id] === true) mutes[p.id] = true;
        const sec: Section = { id, name, letter, steps, chords, content, mutes };
        const sound = readSectionSound(raw.sound, parts, barLen);
        if (sound) sec.sound = sound;
        sections.push(sec);
    });
    if (sections.length === 0) sections.push(fromSingleSection({ ...newSong(), timeSignature, parts }).sections[0]);
    const known = new Set(sections.map(x => x.id));
    const chain = (Array.isArray(v.chain) ? v.chain : [])
        .filter((e): e is Obj => isObj(e) && typeof e.sectionId === 'string' && known.has(e.sectionId))
        .slice(0, MAX_CHAIN)
        .map(e => ({ sectionId: e.sectionId as string }));
    return {
        key: oneOf(v.key, KEYS, 'C'),
        scale: oneOf<ScaleId>(v.scale, SCALE_IDS, 'major'),
        bpm: int(v.bpm, 40, 240, 100),
        timeSignature,
        space: readSpace(v.space),
        parts,
        sections,
        chain: chain.length ? chain : [{ sectionId: sections[0].id }],
    };
}

/** A saved state from storage, a file or a link: version 3 as is, version 2 moved into one section. */
export function readSaved(v: unknown): SavedState | null {
    if (!isObj(v)) return null;
    let song: FullSong | null = null;
    if (v.version === 3) song = readFullSong(v.song);
    else if (v.version === 2) {
        const old = readSong(v.song);
        song = old && fromSingleSection(old);
    }
    if (!song) return null;
    const settings = readSettings(v.settings);
    if (!song.sections.some(x => x.id === settings.openSection)) settings.openSection = song.sections[0].id;
    return { version: SAVE_VERSION, song, settings };
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
