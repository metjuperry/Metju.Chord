import { ArpPattern, KEYS, MusicalKey, ChordType, SCALE_IDS, ScaleId } from './theory';
import type { ArpRate } from './audio/engine';
import { INSTRUMENTS, InstrumentId } from './audio/instruments';
import { Clip, PPQ, PlayMode, STEPS_PER_ROW, TRACK_COLORS, Track, newTrack } from './progression';

// ---- the song: everything undo/redo, saving and sharing cover ---------------------------

export interface TimeSignature {
    /** Beats per bar (2–7). */
    beats: number;
    /** Note value of one beat, and of one sequencer step: 4 = quarter, 8 = eighth. */
    unit: 4 | 8;
}

/** One sequencer step is one beat of the time signature: a quarter (x/4) or an eighth (x/8). */
export const ticksPerStep = (ts: TimeSignature) => (PPQ * 4) / ts.unit;
export const ticksPerBar = (ts: TimeSignature) => ticksPerStep(ts) * ts.beats;

export interface Song {
    tracks: Track[];
    /** Length of the sequencer, in steps. */
    steps: number;
    bpm: number;
    timeSignature: TimeSignature;
}

/** Live playing settings, saved with the song but not part of undo. */
export interface Settings {
    key: MusicalKey;
    scale: ScaleId;
    /** Pick each chord's inversion automatically so it moves as little as possible from the last one. */
    voiceLeading: boolean;
    octave: number;
    inversion: number;
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
    loop: boolean;
    theme: 'dark' | 'light';
}

export interface SavedState {
    version: 1;
    song: Song;
    settings: Settings;
}

export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'metju.chord.v1';

export function newSong(): Song {
    const keys = newTrack([], 'epiano', 'Keys');
    return {
        tracks: [keys, newTrack([keys], 'warmpad', 'Pad')],
        steps: STEPS_PER_ROW,
        bpm: 100,
        timeSignature: { beats: 4, unit: 4 },
    };
}

export const defaultSettings = (): Settings => ({
    key: 'C', scale: 'major', voiceLeading: false, octave: 4, inversion: 0, playMode: 'Chord', arpPattern: 'up', arpRate: '8n', noteLength: 0.3, loop: true, theme: 'dark',
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
    if (v.rest === true) return { start, len, rest: true };
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
            scale: oneOf<ScaleId>(c.scale, SCALE_IDS, 'major'),
            key: oneOf(c.key, KEYS, 'C'),
            playMode: oneOf<PlayMode>(c.playMode, ['Chord', 'Arp'], 'Chord'),
            arpPattern: oneOf(c.arpPattern, ARP_PATTERNS, 'up'),
            arpRate: oneOf(c.arpRate, ARP_RATES, '8n'),
            noteLength: num(c.noteLength, 0.05, 2, 0.3),
        },
    };
}

function readTrack(v: unknown, index: number, maxTick: number): Track | null {
    if (!isObj(v)) return null;
    const clips = (Array.isArray(v.clips) ? v.clips : [])
        .map(c => readClip(c, maxTick))
        .filter((c): c is Clip => c !== null)
        .sort((a, b) => a.start - b.start)
        // drop anything overlapping the clip before it
        .filter((c, i, all) => i === 0 || c.start >= all[i - 1].start + all[i - 1].len);
    return {
        id: typeof v.id === 'string' && v.id ? v.id : `t${index + 1}`,
        name: typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 24) : `Track ${index + 1}`,
        color: oneOf(v.color, TRACK_COLORS, TRACK_COLORS[index % TRACK_COLORS.length]),
        instrument: oneOf(v.instrument, INSTRUMENT_IDS, 'epiano') as InstrumentId,
        volume: int(v.volume, -24, 6, 0),
        mute: bool(v.mute, false),
        solo: bool(v.solo, false),
        clips,
    };
}

/** Rebuild a song from untrusted data (a file, a link, storage). Returns null if it isn't a song at all. */
export function readSong(v: unknown): Song | null {
    if (!isObj(v) || !Array.isArray(v.tracks)) return null;
    const ts = isObj(v.timeSignature) ? v.timeSignature : {};
    const timeSignature: TimeSignature = { beats: int(ts.beats, 2, 7, 4), unit: oneOf<4 | 8>(ts.unit, [4, 8], 4) };
    const steps = int(v.steps, 1, 512, STEPS_PER_ROW);
    const maxTick = steps * ticksPerStep(timeSignature);
    const tracks = v.tracks.slice(0, TRACK_COLORS.length)
        .map((t, i) => readTrack(t, i, maxTick))
        .filter((t): t is Track => t !== null);
    if (tracks.length === 0) return null;
    // ids must be unique
    const seen = new Set<string>();
    tracks.forEach((t, i) => {
        if (seen.has(t.id)) t.id = `t${100 + i}`;
        seen.add(t.id);
    });
    return { tracks, steps, bpm: int(v.bpm, 40, 240, 100), timeSignature };
}

export function readSettings(v: unknown): Settings {
    const d = defaultSettings();
    if (!isObj(v)) return d;
    return {
        key: oneOf(v.key, KEYS, d.key),
        scale: oneOf<ScaleId>(v.scale, SCALE_IDS, d.scale),
        voiceLeading: bool(v.voiceLeading, d.voiceLeading),
        octave: int(v.octave, 2, 6, d.octave),
        inversion: int(v.inversion, 0, 3, d.inversion),
        playMode: oneOf<PlayMode>(v.playMode, ['Chord', 'Arp'], d.playMode),
        arpPattern: oneOf(v.arpPattern, ARP_PATTERNS, d.arpPattern),
        arpRate: oneOf(v.arpRate, ARP_RATES, d.arpRate),
        noteLength: num(v.noteLength, 0.05, 2, d.noteLength),
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
