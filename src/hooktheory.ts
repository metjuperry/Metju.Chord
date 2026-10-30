import { ChordType, KEYS, MusicalKey, SCALES, ScaleId, buildChordMidi, keyPitchClass, noteNames, resolveChord, scaleLabel } from './theory';
import { Clip, place } from './progression';
import { MAX_PARTS, MELODY_STEPS, MelodyPart, Note, Part, newPart } from './parts';
import { Song, stepsPerRow, ticksPerBar, ticksPerStep } from './song';
import { TICKS_PER_SIXTEENTH } from './drums';

// ---- Paste from Hooktheory -------------------------------------------------------------------
//
// Hookpad / TheoryTab put JSON on the clipboard when you copy a selection. Two shapes live side by
// side in it: the legacy one (`notes`, `chords`, `keys` with 1-based `beat` and `duration` in beats)
// and `modern.payload` (`startTick` / `durationTicks` at 480 per beat). Pitches are scale degrees of
// the key's mode (`sd` "1"–"7", maybe with ♭/♯), `octave` relative to the tonic.
//
// Everything here is pure: `parseHooktheory` reads untrusted text into a small clean model (never
// throws), `importHooktheory` turns that into an edited Song plus a summary for the preview.

/** Hooktheory's ticks per beat in `modern.payload`. */
const HT_TICKS = 480;
/** One Hooktheory beat (a quarter note) in app ticks. */
const APP_BEAT = 96;

export const MAX_INPUT_CHARS = 2_000_000;
export const MAX_NOTES = 4000;
export const MAX_CHORDS = 1000;
const MAX_KEYS = 200;
/** No single event longer than this many beats, nor starting later than `MAX_BEAT`. */
const MAX_LEN_BEATS = 1024;
const MAX_BEAT = 100_000;

// ---- scales Hooktheory knows, and how they map onto the app's eight ---------------------------

const HT_SCALES: { [name: string]: number[] } = {
    major: [0, 2, 4, 5, 7, 9, 11],
    ionian: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    naturalminor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    harmonicminor: [0, 2, 3, 5, 7, 8, 11],
    melodicminor: [0, 2, 3, 5, 7, 9, 11],
    phrygiandominant: [0, 1, 4, 5, 7, 8, 10],
};

const scaleKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

/** The app scale with the most pitch classes in common with `steps` (ties: the earlier in SCALES). */
export function closestScale(steps: number[]): ScaleId {
    const set = new Set(steps);
    let best: ScaleId = 'major';
    let bestDiff = Infinity;
    for (const sc of SCALES) {
        const diff = sc.steps.filter(s => !set.has(s)).length;
        if (diff < bestDiff) {
            best = sc.id;
            bestDiff = diff;
        }
    }
    return best;
}

const SCALE_STEPS = (id: ScaleId) => (SCALES.find(s => s.id === id) ?? SCALES[0]).steps;

/** Seven ascending semitone offsets from 0, as Hooktheory's custom `borrowed` scales are. */
const isScaleSteps = (v: unknown): v is number[] =>
    Array.isArray(v) && v.length === 7 && v[0] === 0
    && v.every((x, i) => Number.isInteger(x) && x >= 0 && x < 12 && (i === 0 || x > v[i - 1]));

// ---- the parsed model --------------------------------------------------------------------------

export interface HtKey {
    /** In beats from the start of the paste. */
    start: number;
    tonic: number;
    /** The tonic as written in the paste (B♭, F♯…), for the preview. */
    tonicName: string;
    scaleName: string;
    /** The paste's own scale, which may not be one the app has (Locrian…). */
    steps: number[];
    /** The app scale used for it. */
    scale: ScaleId;
    /** False when `scale` is only the closest the app has (or a guess for an unknown name). */
    exact: boolean;
    known: boolean;
}

export interface HtNote {
    start: number;
    len: number;
    /** Scale degree 0–6 of the key's mode. */
    degree: number;
    /** ♯ / ♭ on that degree, in semitones. */
    shift: number;
    octave: number;
}

export interface HtChord {
    start: number;
    len: number;
    rest: boolean;
    /** Scale degree 0–6. */
    root: number;
    /** 5 triad, 7 seventh, 9, 11, 13. */
    type: number;
    inversion: number;
    /** 0 = none, otherwise the chord is that degree of the major key on `root` (V/V = root 5, applied 5). */
    applied: number;
    adds: number[];
    omits: number[];
    alterations: { degree: number; shift: number; label: string }[];
    suspensions: number[];
    /** Mode name or custom scale (semitones above the tonic) the chord is borrowed from; null = diatonic. */
    borrowed: string | number[] | null;
    /** Things in the chord the import doesn't understand (pedal, substitutions…), for the preview. */
    ignored: string[];
}

export interface HtClip {
    source: 'modern' | 'legacy';
    notes: HtNote[];
    chords: HtChord[];
    keys: HtKey[];
    /** Note and chord entries that couldn't be read. */
    skipped: number;
    /** Rests in the melody (skipped). */
    rests: number;
    /** True when the paste had no key and C major was assumed. */
    noKey: boolean;
}

export type ParseResult = { ok: true; clip: HtClip } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const intIn = (v: unknown, lo: number, hi: number): number | null => {
    const n = num(v);
    return n !== null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

const LETTERS: { [l: string]: number } = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A", "Bb", "F#", "E♭" → pitch class, or null. */
export function parseTonic(v: unknown): number | null {
    if (typeof v !== 'string') return null;
    const m = v.trim().match(/^([A-Ga-g])([#b♯♭]{0,2})$/);
    if (!m) return null;
    let pc = LETTERS[m[1].toUpperCase()];
    for (const ch of m[2]) pc += ch === '#' || ch === '♯' ? 1 : -1;
    return ((pc % 12) + 12) % 12;
}

/** "3", "b7", "#4", "♭2" → degree 0–6 and a semitone shift, or null. */
export function parseSd(v: unknown): { degree: number; shift: number } | null {
    const s = typeof v === 'number' ? String(v) : v;
    if (typeof s !== 'string') return null;
    const m = s.trim().match(/^([#b♯♭]{0,2})([1-7])$/);
    if (!m) return null;
    let shift = 0;
    for (const ch of m[1]) shift += ch === '#' || ch === '♯' ? 1 : -1;
    return { degree: Number(m[2]) - 1, shift };
}

const prettyTonic = (s: string) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1).replace(/#/g, '♯').replace(/b/g, '♭');

function readKey(v: unknown, start: number | null): HtKey | null {
    if (!isObj(v) || start === null) return null;
    const tonic = parseTonic(v.tonic);
    if (tonic === null) return null;
    const scaleName = typeof v.scale === 'string' ? v.scale.slice(0, 40) : 'major';
    const known = HT_SCALES[scaleKey(scaleName)];
    const steps = known ?? HT_SCALES.major;
    const scale = closestScale(steps);
    const exact = !!known && SCALE_STEPS(scale).every((s, i) => s === steps[i]);
    return { start, tonic, tonicName: prettyTonic(v.tonic as string), scaleName, steps, scale, exact, known: !!known };
}

const numList = (v: unknown, lo: number, hi: number): number[] =>
    Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x >= lo && x <= hi).slice(0, 8) : [];

function readChord(v: Record<string, unknown>, start: number, len: number): HtChord | null {
    if (v.isRest === true) {
        return { start, len, rest: true, root: 0, type: 5, inversion: 0, applied: 0, adds: [], omits: [], alterations: [], suspensions: [], borrowed: null, ignored: [] };
    }
    const root = intIn(v.root, 1, 7);
    if (root === null) return null;
    const ignored: string[] = [];
    let type = intIn(v.type, 5, 13) ?? 5;
    if (type % 2 === 0) {
        ignored.push(`type ${type}`);
        type = 5;
    }
    const alterations = (Array.isArray(v.alterations) ? v.alterations : []).slice(0, 8).flatMap(a => {
        const m = typeof a === 'string' ? a.trim().match(/^([#b♯♭])(\d{1,2})$/) : null;
        if (!m || Number(m[2]) < 2 || Number(m[2]) > 13) {
            if (a !== null && a !== undefined && a !== '') ignored.push(`alteration ${String(a).slice(0, 12)}`);
            return [];
        }
        const shift = m[1] === '#' || m[1] === '♯' ? 1 : -1;
        return [{ degree: Number(m[2]), shift, label: `${shift > 0 ? '♯' : '♭'}${m[2]}` }];
    });
    let borrowed: string | number[] | null = null;
    if (typeof v.borrowed === 'string' && v.borrowed.trim()) {
        if (HT_SCALES[scaleKey(v.borrowed)]) borrowed = v.borrowed;
        else ignored.push(`borrowed from “${v.borrowed.slice(0, 20)}”`);
    } else if (Array.isArray(v.borrowed)) {
        if (isScaleSteps(v.borrowed)) borrowed = v.borrowed;
        else if (v.borrowed.length) ignored.push('a borrowed scale it couldn’t read');
    }
    const omits = numList(v.omits, 1, 13);
    for (const o of omits) if (o !== 3 && o !== 5) ignored.push(`omit ${o}`);
    if (v.pedal !== null && v.pedal !== undefined && v.pedal !== '' && v.pedal !== false) ignored.push('pedal');
    if (Array.isArray(v.substitutions) && v.substitutions.length) ignored.push('substitution');
    return {
        start, len, rest: false,
        root: root - 1,
        type,
        inversion: intIn(v.inversion, 0, 6) ?? 0,
        applied: intIn(v.applied, 0, 7) ?? 0,
        adds: numList(v.adds, 2, 13),
        omits: omits.filter(o => o === 3 || o === 5),
        alterations,
        suspensions: numList(v.suspensions, 2, 6),
        borrowed,
        ignored,
    };
}

/** Read clipboard text from Hookpad / TheoryTab. Never throws: garbage gives a friendly error. */
export function parseHooktheory(text: string): ParseResult {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Nothing pasted yet.' };
    if (text.length > MAX_INPUT_CHARS) return { ok: false, error: 'That paste is too big to be a Hooktheory selection.' };
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return { ok: false, error: 'That isn’t Hooktheory clipboard data. In Hookpad, select notes or chords, copy them (Ctrl/⌘ C) and paste here.' };
    }
    if (!isObj(data)) return { ok: false, error: 'That isn’t Hooktheory clipboard data.' };

    // prefer the modern payload; fall back to the legacy lists
    const payload = isObj(data.modern) && isObj(data.modern.payload) ? data.modern.payload : null;
    const modern = !!payload && (Array.isArray(payload.notes) || Array.isArray(payload.chords));
    const src = modern ? payload! : data;
    const rawNotes = Array.isArray(src.notes) ? src.notes : [];
    const rawChords = Array.isArray(src.chords) ? src.chords : [];
    const rawKeys = Array.isArray(src.keys) ? src.keys : [];
    if (!Array.isArray(src.notes) && !Array.isArray(src.chords)) {
        return { ok: false, error: 'No Hooktheory notes or chords found in that paste.' };
    }
    if (rawNotes.length > MAX_NOTES) return { ok: false, error: `That’s ${rawNotes.length} notes; at most ${MAX_NOTES} can be pasted at once.` };
    if (rawChords.length > MAX_CHORDS) return { ok: false, error: `That’s ${rawChords.length} chords; at most ${MAX_CHORDS} can be pasted at once.` };

    /** Start and length in beats, or null when unreadable. */
    const timing = (v: Record<string, unknown>): [number, number] | null => {
        const start = modern ? num(v.startTick) : num(v.beat);
        const len = modern ? num(v.durationTicks) : num(v.duration);
        if (start === null || len === null) return null;
        const s = modern ? start / HT_TICKS : start - 1;
        const l = modern ? len / HT_TICKS : len;
        if (Math.abs(s) > MAX_BEAT || !(l > 0) || l > MAX_LEN_BEATS) return null;
        return [s, l];
    };
    const keyStart = (v: unknown): number | null => {
        if (!isObj(v)) return null;
        const s = modern ? num(v.startTick) : num(v.beat);
        if (s === null) return modern ? null : 0;
        const b = modern ? s / HT_TICKS : s - 1;
        return Math.abs(b) > MAX_BEAT ? null : b;
    };

    let skipped = 0;
    let rests = 0;
    const notes: HtNote[] = [];
    const restStarts: number[] = [];
    for (const n of rawNotes) {
        const t = isObj(n) ? timing(n) : null;
        if (!isObj(n) || !t) {
            skipped++;
            continue;
        }
        if (n.isRest === true) {
            rests++;
            restStarts.push(t[0]);
            continue;
        }
        const sd = parseSd(n.sd);
        const octave = n.octave === undefined ? 0 : intIn(n.octave, -4, 4);
        if (!sd || octave === null) {
            skipped++;
            continue;
        }
        notes.push({ start: t[0], len: t[1], degree: sd.degree, shift: sd.shift, octave });
    }
    const chords: HtChord[] = [];
    for (const c of rawChords) {
        const t = isObj(c) ? timing(c) : null;
        const chord = isObj(c) && t ? readChord(c, t[0], t[1]) : null;
        if (chord) chords.push(chord);
        else skipped++;
    }
    if (!notes.length && !chords.some(c => !c.rest)) {
        return { ok: false, error: rawNotes.length || rawChords.length ? 'Nothing in that paste could be read as notes or chords.' : 'That Hooktheory paste is empty.' };
    }

    // the paste starts at its first event (rests included, so a leading rest is kept)
    const origin = Math.min(...notes.map(n => n.start), ...chords.map(c => c.start), ...restStarts);
    for (const e of [...notes, ...chords]) e.start -= origin;
    const keys = rawKeys.slice(0, MAX_KEYS)
        .map(k => readKey(k, keyStart(k)))
        .filter((k): k is HtKey => !!k)
        .map(k => ({ ...k, start: k.start - origin }))
        .sort((a, b) => a.start - b.start);
    const noKey = !keys.length;
    if (noKey) keys.push(readKey({ tonic: 'C', scale: 'major' }, 0)!);
    notes.sort((a, b) => a.start - b.start);
    chords.sort((a, b) => a.start - b.start);
    return { ok: true, clip: { source: modern ? 'modern' : 'legacy', notes, chords, keys, skipped, rests, noKey } };
}

// ---- pitch helpers -----------------------------------------------------------------------------

/** Semitones of scale index `i` (any integer) above the tonic. */
const pitchOf = (steps: number[], i: number) => steps[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);

/**
 * The scale index nearest to `semis` semitones above the tonic. A note between two scale notes,
 * equally far from both, goes DOWN (always: predictable, and easy to fix by hand).
 */
export function snapToScale(semis: number, steps: number[]): { index: number; exact: boolean } {
    const oct = Math.floor(semis / 12);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 7 * (oct - 1); i <= 7 * (oct + 2); i++) {
        const d = Math.abs(pitchOf(steps, i) - semis);
        // ascending scan: a later index only wins when strictly closer, so ties stay low
        if (d < bestDist) {
            best = i;
            bestDist = d;
        }
    }
    return { index: best, exact: bestDist === 0 };
}

/** -6…5: the nearest way to move from one pitch class to another. */
const nearest = (semis: number) => ((((semis + 6) % 12) + 12) % 12) - 6;

const pretty = (name: string) => name.replace(/#/g, '♯');

// ---- key choice ----------------------------------------------------------------------------------

export type KeyMode = 'paste' | 'song';

export interface KeyInfo {
    key: MusicalKey;
    scale: ScaleId;
    label: string;
}

/** The paste's key as the app would play it, and what keeping the song's key would do. */
export function keyChoice(clip: HtClip, song: Pick<Song, 'key' | 'scale'>) {
    const k = clip.keys[0];
    const paste: KeyInfo = { key: KEYS[k.tonic], scale: k.scale, label: `${pretty(noteNames(KEYS[k.tonic], k.scale)[k.tonic])} ${scaleLabel(k.scale).toLowerCase()}` };
    const songKey: KeyInfo = { key: song.key, scale: song.scale, label: `${pretty(noteNames(song.key, song.scale)[keyPitchClass(song.key)])} ${scaleLabel(song.scale).toLowerCase()}` };
    const same = paste.key === song.key && paste.scale === song.scale;
    // relative keys (A minor in C major) share every note: keeping the song's key moves nothing
    const pasteSet = new Set(k.steps.map(s => (s + k.tonic) % 12));
    const songPc = keyPitchClass(song.key);
    const sharesNotes = SCALE_STEPS(song.scale).every(s => pasteSet.has((s + songPc) % 12));
    return { paste, song: songKey, same, sharesNotes };
}

// ---- chords: Hooktheory chord → the closest chord the pads can play ------------------------------

interface Tone {
    pc: number;
    weight: number;
    label: string;
}

const EXT_LABEL: { [d: number]: string } = { 1: 'root', 3: '3rd', 5: '5th', 7: '7th', 9: '9th', 11: '11th', 13: '13th' };
const WEIGHT: { [d: number]: number } = { 1: 5, 3: 3, 5: 2, 7: 2 };

/**
 * The pitch classes a Hooktheory chord sounds, in a frame (tonic + the key's scale steps).
 * Degrees stack in thirds from the root up to `type`; suspensions replace the 3rd (later ones add);
 * adds are extra degrees (Hooktheory writes add 2/4/6 for the 9th/11th/13th); alterations raise or
 * lower a degree (adding it when it isn't there); omits take out the 3rd or 5th; `applied` builds
 * the chord on the major key of the root's degree (V/V = root 5, applied 5); `borrowed` swaps the
 * scale for a mode on the same tonic, or a custom scale.
 */
export function chordTones(ch: HtChord, tonic: number, keySteps: number[]): { tones: Tone[]; bass: number; rootPc: number } {
    let steps = keySteps;
    if (typeof ch.borrowed === 'string') steps = HT_SCALES[scaleKey(ch.borrowed)] ?? keySteps;
    else if (Array.isArray(ch.borrowed)) steps = ch.borrowed;
    let t = tonic;
    let rootIdx = ch.root;
    if (ch.applied > 0) {
        t = (tonic + steps[ch.root]) % 12;
        steps = HT_SCALES.major;
        rootIdx = ch.applied - 1;
    }
    const pcOf = (deg: number, shift = 0) => (((t + pitchOf(steps, rootIdx + deg - 1) + shift) % 12) + 12) % 12;

    // chord members as degree → label/weight, in stacking order
    const members = new Map<number, { shift: number; label: string; weight: number }>();
    for (let d = 1; d <= ch.type; d += 2) members.set(d, { shift: 0, label: EXT_LABEL[d], weight: WEIGHT[d] ?? 1 });
    ch.suspensions.forEach((s, i) => {
        if (i === 0) members.delete(3);
        members.set(s, { shift: 0, label: `sus${s}`, weight: 3 });
    });
    for (const o of ch.omits) members.delete(o);
    for (const a of ch.adds) {
        const shown = a <= 6 && a % 2 === 0 ? a + 7 : a;
        if (!members.has(a)) members.set(a, { shift: 0, label: `add${shown}`, weight: 1 });
    }
    for (const alt of ch.alterations) {
        // an altered 5th is the 5th; an altered 9th may be written as 2 elsewhere
        const at = [alt.degree, alt.degree - 7, alt.degree + 7].find(d => members.has(d));
        const prev = at !== undefined ? members.get(at)! : null;
        if (at !== undefined) members.delete(at);
        members.set(alt.degree, { shift: alt.shift, label: alt.label, weight: prev?.weight ?? 1 });
    }
    const order = [...members.entries()].sort((a, b) => a[0] - b[0]);
    const tones: Tone[] = [];
    for (const [d, m] of order) {
        const pc = pcOf(d, m.shift);
        const same = tones.find(x => x.pc === pc);
        if (same) same.weight = Math.max(same.weight, m.weight);
        else tones.push({ pc, weight: m.weight, label: m.label });
    }
    // the inversion counts chord members from the bottom: 1 = 3rd (or sus) in the bass, 3 = 7th
    const core = order.filter(([d]) => d % 2 === 1 || ch.suspensions.includes(d));
    const bassEntry = core[Math.min(ch.inversion, core.length - 1)] ?? order[0];
    const bass = bassEntry ? pcOf(bassEntry[0], bassEntry[1].shift) : pcOf(1);
    return { tones, bass, rootPc: pcOf(1) };
}

/** Types the import may pick, simplest first (ties go to the earlier one). */
const CANDIDATE_TYPES: ChordType[] = ['triad', 'diatonic7', 'dom7', 'flip', 'minor', 'six', 'sus4', 'sus2', 'dim', 'aug', 'diatonic9'];

export interface ChordMatch {
    degree: number;
    type: ChordType;
    inversion: number;
    /** Labels of Hooktheory chord tones the app chord doesn't play (add13, ♯9…). */
    dropped: string[];
    /** Pitch classes the app chord plays that the Hooktheory chord doesn't have. */
    extra: number[];
    rootMoved: boolean;
    bassMissing: boolean;
}

/**
 * Pick the app chord (degree of the target key + chord type + inversion) that sounds most like the
 * Hooktheory chord: matching pitch classes score their weight (root most, then 3rd, 5th and 7th,
 * extensions least), missing ones cost it, notes the Hooktheory chord doesn't have cost 2 each, and
 * a different root costs 6 more.
 */
export function matchChord(tones: Tone[], rootPc: number, bass: number, targetPc: number, scale: ScaleId): ChordMatch {
    let best: { score: number; degree: number; type: ChordType; base: number[] } | null = null;
    for (let degree = 0; degree < 7; degree++) {
        for (const type of CANDIDATE_TYPES) {
            const base = buildChordMidi(targetPc, degree, type, 4, scale);
            const pcs = new Set(base.map(m => m % 12));
            let score = 0;
            for (const t of tones) score += pcs.has(t.pc) ? t.weight : -t.weight;
            for (const p of pcs) if (!tones.some(t => t.pc === p)) score -= 2;
            if (base[0] % 12 !== rootPc) score -= 6;
            if (!best || score > best.score) best = { score, degree, type, base };
        }
    }
    const { degree, type, base } = best!;
    const pcs = base.map(m => m % 12);
    const inv = pcs.indexOf(bass);
    return {
        degree,
        type,
        inversion: Math.max(0, inv),
        dropped: tones.filter(t => !pcs.includes(t.pc)).map(t => t.label),
        extra: [...new Set(pcs)].filter(p => !tones.some(t => t.pc === p)),
        rootMoved: pcs[0] !== rootPc,
        bassMissing: inv < 0,
    };
}

// ---- melody: fitting notes into scale-locked Melody parts ---------------------------------------

interface Placed {
    start: number;
    len: number;
    /** Scale index from the target tonic in app octave 4 (Hooktheory octave 0). */
    index: number;
    /** Semitones above that tonic before snapping, to pick the highest of overlapping notes. */
    semis: number;
}

/** The window offsets k (in octaves) whose 15-step grid 7k…7k+14 holds every index in lo…hi. */
const windowsFor = (lo: number, hi: number): [number, number] | null => {
    const kmin = Math.ceil((hi - (MELODY_STEPS - 1)) / 7);
    const kmax = Math.floor(lo / 7);
    return kmin <= kmax ? [kmin, kmax] : null;
};

/**
 * Split a monophonic line into phrases that each fit one Melody grid (two octaves from the key's
 * root). A phrase grows until a note no longer fits; it is then cut at the longest gap (a rest,
 * a phrase boundary) that leaves the rest fitting. Returns, per note, the window it sits in.
 */
export function fitWindows(notes: Placed[]): number[] {
    const segments: [number, number][] = [];
    let s = 0;
    for (let i = 1; i <= notes.length; i++) {
        if (i === notes.length) {
            segments.push([s, i]);
            break;
        }
        const slice = notes.slice(s, i + 1).map(n => n.index);
        if (windowsFor(Math.min(...slice), Math.max(...slice))) continue;
        let cut = i;
        let gap = -1;
        for (let j = s + 1; j <= i; j++) {
            const tail = notes.slice(j, i + 1).map(n => n.index);
            if (!windowsFor(Math.min(...tail), Math.max(...tail))) continue;
            const g = notes[j].start - (notes[j - 1].start + notes[j - 1].len);
            if (g >= gap) {
                gap = g;
                cut = j;
            }
        }
        segments.push([s, cut]);
        s = cut;
    }
    const used: number[] = [];
    const out = new Array<number>(notes.length);
    for (const [a, b] of segments) {
        const idx = notes.slice(a, b).map(n => n.index);
        const [kmin, kmax] = windowsFor(Math.min(...idx), Math.max(...idx))!;
        // reuse a window already in use, else the one nearest Hooktheory's own octave 0
        const reuse = used.filter(k => k >= kmin && k <= kmax).sort((x, y) => Math.abs(x) - Math.abs(y))[0];
        const k = reuse ?? Math.max(kmin, Math.min(kmax, 0));
        if (!used.includes(k)) used.push(k);
        for (let i = a; i < b; i++) out[i] = k;
    }
    return out;
}

/** Keep one note at a time: of overlapping notes the highest wins; a lower note cut into is shortened. */
export function monophonic(notes: Placed[]): { kept: Placed[]; dropped: number } {
    const sorted = [...notes].sort((a, b) => a.start - b.start || b.semis - a.semis);
    const kept: Placed[] = [];
    let dropped = 0;
    for (const n of sorted) {
        const last = kept[kept.length - 1];
        if (!last || n.start >= last.start + last.len) {
            kept.push({ ...n });
        } else if (n.start > last.start && n.semis > last.semis) {
            last.len = n.start - last.start;
            kept.push({ ...n });
        } else {
            dropped++;
        }
    }
    return { kept, dropped };
}

// ---- the import --------------------------------------------------------------------------------

export interface ImportOptions {
    keyMode: KeyMode;
    /** Where the paste goes, in song ticks (a whole step). */
    at: number;
    /** 1 Hooktheory beat = a half note instead of a quarter. */
    halfTime: boolean;
    notes: boolean;
    chords: boolean;
    /** Octave of the imported chord clips (the pads' octave). */
    chordOctave: number;
}

export interface Warning {
    text: string;
    details?: string[];
}

export interface PartPlan {
    id: string;
    name: string;
    color: string;
    octave: number;
    notes: number;
    /** True when it fills an existing empty Melody part instead of adding one. */
    reused: boolean;
}

export interface ImportSummary {
    target: KeyInfo;
    keyChanged: boolean;
    notes: number;
    chords: number;
    /** Bars the paste covers, and the bar it starts in (1-based). */
    bars: number;
    startBar: number;
    parts: PartPlan[];
    /** Existing chords replaced (wholly or partly) by the imported ones. */
    replaced: number;
    warnings: Warning[];
    /** Set when the import can't be done as chosen (no room for the parts…). */
    problem?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** At most this many detail lines per warning in the preview. */
const DETAILS = 8;
const capped = (list: string[]) => (list.length > DETAILS ? [...list.slice(0, DETAILS), `…and ${list.length - DETAILS} more`] : list);

/** The song with the paste added, and what happened, for the preview. Pure. */
export function importHooktheory(song: Song, clip: HtClip, opts: ImportOptions): { song: Song; summary: ImportSummary } {
    const choice = keyChoice(clip, song);
    const target = opts.keyMode === 'paste' ? choice.paste : choice.song;
    const targetPc = keyPitchClass(target.key);
    const targetSteps = SCALE_STEPS(target.scale);
    const names = noteNames(target.key, target.scale).map(pretty);
    const ts = song.timeSignature;
    const T = ticksPerStep(ts);
    const barTicks = ticksPerBar(ts);
    const row = stepsPerRow(ts);
    const maxSteps = Math.floor(512 / row) * row;
    const maxTick = Math.max(song.steps, maxSteps) * T;
    const beat = APP_BEAT * (opts.halfTime ? 2 : 1);
    const at = Math.max(0, Math.round(opts.at / T) * T);
    const barOf = (tick: number) => Math.floor((at + tick) / barTicks) + 1;
    const warnings: Warning[] = [];

    // Which frame each paste key is read in. Keeping the song's key moves every note to the same
    // scale degree of the song's key (sd 3 stays the 3rd), unless the two keys share all their notes
    // (A minor in C major): then nothing needs to move and the pitches are kept.
    const degreeMap = opts.keyMode === 'song' && !choice.same && !choice.sharesNotes;
    const keyAt = (t: number) => clip.keys.filter(k => k.start <= t + 1e-9).pop() ?? clip.keys[0];
    const frame = (t: number) => {
        const k = keyAt(t);
        return degreeMap ? { tonic: targetPc, steps: targetSteps, offset: 0 } : { tonic: k.tonic, steps: k.steps, offset: nearest(k.tonic - targetPc) };
    };

    // ---- melody ----
    let offGrid = 0;
    const chromatic: string[] = [];
    const placed: Placed[] = [];
    if (opts.notes) {
        for (const n of clip.notes) {
            const f = frame(n.start);
            const semis = f.offset + pitchOf(f.steps, n.degree) + n.shift + 12 * n.octave;
            const snap = snapToScale(semis, targetSteps);
            const rawStart = n.start * beat;
            const rawLen = n.len * beat;
            const start = Math.round(rawStart / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH;
            const len = Math.max(TICKS_PER_SIXTEENTH, Math.round(rawLen / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH);
            if (Math.abs(start - rawStart) > 1e-6 || Math.abs(len - rawLen) > 1e-6) offGrid++;
            if (!snap.exact) {
                const from = names[(((targetPc + semis) % 12) + 12) % 12];
                const to = names[(targetPc + pitchOf(targetSteps, snap.index) + 1200) % 12];
                chromatic.push(`${from} → ${to} at bar ${barOf(start)}`);
            }
            placed.push({ start, len, index: snap.index, semis });
        }
    }
    const { kept, dropped: overlapped } = monophonic(placed);
    let cut = 0;
    const inSong = kept.filter(n => {
        if (at + n.start >= maxTick) {
            cut++;
            return false;
        }
        n.len = Math.min(n.len, maxTick - at - n.start);
        return true;
    });

    const windows = fitWindows(inSong);
    const ks = [...new Set(windows)].sort((a, b) => a - b);
    let problem: string | undefined;
    let shift = 0;
    if (ks.length) {
        const lo = ks[0];
        const hi = ks[ks.length - 1];
        // Melody parts sit in octave 3–5; Hooktheory's octave 0 is the app's octave 4
        const gmin = 3 - 4 - lo;
        const gmax = 5 - 4 - hi;
        if (gmin > gmax) problem = 'The melody spans more than four octaves, more than Melody parts can hold.';
        else shift = Math.max(gmin, Math.min(gmax, 0));
    }

    // fill empty Melody parts first, then add new ones
    let parts: Part[] = song.parts;
    const planned: PartPlan[] = [];
    if (!problem && ks.length) {
        const empty = song.parts.filter((p): p is MelodyPart => p.kind === 'melody' && p.notes.length === 0);
        const fresh = ks.length - Math.min(empty.length, ks.length);
        if (song.parts.length + fresh > MAX_PARTS) {
            const free = MAX_PARTS - song.parts.length;
            problem = `The melody needs ${plural(ks.length, 'Melody part')} (it’s wider than one part’s two octaves), but ${free <= 0 ? 'the song already has the most parts it can' : `there’s room for only ${plural(free + Math.min(empty.length, ks.length), 'more')}`}. Remove a part first${clip.chords.length ? ', or import the chords only' : ''}.`;
        } else {
            const built: MelodyPart[] = [];
            const filled = new Map<string, MelodyPart>();
            ks.forEach((k, i) => {
                const notes: Note[] = inSong
                    .filter((_, j) => windows[j] === k)
                    .map(n => ({ start: at + n.start, len: n.len, step: n.index - 7 * k }));
                const octave = 4 + k + shift;
                const reuse = empty[i];
                const part: MelodyPart = reuse
                    ? { ...reuse, octave, notes }
                    : { ...(newPart('melody', [...song.parts, ...built]) as MelodyPart), octave, notes };
                if (reuse) filled.set(part.id, part);
                else built.push(part);
                planned.push({ id: part.id, name: part.name, color: part.color, octave, notes: notes.length, reused: !!reuse });
            });
            parts = [...song.parts.map(p => filled.get(p.id) ?? p), ...built];
        }
    }

    // ---- chords ----
    let chordsOut = song.chords;
    let chordCount = 0;
    let offBeat = 0;
    let replaced = 0;
    const changed: string[] = [];
    const ignored: string[] = [];
    if (opts.chords && clip.chords.length) {
        const clips: Clip[] = [];
        for (const ch of clip.chords) {
            const rawStart = ch.start * beat;
            const rawLen = ch.len * beat;
            const start = Math.round(rawStart / T) * T;
            const len = Math.max(T, Math.round(rawLen / T) * T);
            if (Math.abs(start - rawStart) > 1e-6 || Math.abs(len - rawLen) > 1e-6) offBeat++;
            if (at + start >= maxTick) {
                if (!ch.rest) cut++;
                continue;
            }
            const clipLen = Math.min(len, maxTick - at - start);
            if (ch.rest) {
                clips.push({ start: at + start, len: clipLen, rest: true });
                continue;
            }
            const f = frame(ch.start);
            const { tones, bass, rootPc } = chordTones(ch, (f.tonic + 1200) % 12, f.steps);
            const m = matchChord(tones, rootPc, bass, targetPc, target.scale);
            const clipChord = { degree: m.degree, type: m.type, inversion: m.inversion, octave: Math.max(1, Math.min(7, opts.chordOctave)) };
            const name = pretty(resolveChord(target.key, { ...clipChord, scale: target.scale }).name.symbol);
            const notes: string[] = [];
            if (m.rootMoved) notes.push(`root ${names[rootPc]} → ${names[(targetPc + pitchOf(targetSteps, m.degree)) % 12]}`);
            if (m.dropped.length) notes.push(`${m.dropped.join(', ')} dropped`);
            if (m.extra.length) notes.push(`plays ${m.extra.map(p => names[p]).join(', ')} as well`);
            if (m.bassMissing) notes.push(`bass ${names[bass]} isn’t in it, so root position`);
            if (notes.length) changed.push(`${name} at bar ${barOf(start)}: ${notes.join('; ')}`);
            for (const what of ch.ignored) ignored.push(`${what} on ${name} at bar ${barOf(start)}`);
            clips.push({ start: at + start, len: clipLen, chord: clipChord });
            chordCount++;
        }
        if (clips.length) {
            // the imported chords replace whatever sits in the stretch they cover; the rest of the row stays
            const from = clips[0].start;
            const to = Math.max(...clips.map(c => c.start + c.len));
            replaced = song.chords.filter(c => c.start < to && c.start + c.len > from).length;
            const marker: Clip = { start: from, len: to - from, rest: true };
            let row = place(song.chords, marker).filter(c => c !== marker);
            for (const c of clips) row = place(row, c);
            chordsOut = row;
        }
    }

    // ---- song length ----
    const ends = [
        ...parts.flatMap(p => (p.kind === 'melody' ? p.notes.map(n => n.start + n.len) : [])),
        ...chordsOut.map(c => c.start + c.len),
    ];
    const end = Math.max(0, ...ends);
    const steps = Math.min(Math.max(song.steps, maxSteps), Math.max(song.steps, Math.ceil(end / T / row) * row));
    const contentEnd = Math.max(0, ...inSong.map(n => n.start + n.len), ...(opts.chords ? clip.chords.map(c => Math.round(c.start * beat / T) * T + Math.max(T, Math.round(c.len * beat / T) * T)) : []));

    // ---- warnings ----
    const first = clip.keys[0];
    if (clip.noKey) warnings.push({ text: 'The paste has no key, so it was read as C major.' });
    if (!first.known) warnings.push({ text: `Hooktheory’s “${first.scaleName}” scale isn’t one this app knows; it was read as major.` });
    else if (!first.exact) warnings.push({ text: `The app has no ${first.scaleName.replace(/([A-Z])/g, ' $1').toLowerCase()} scale; the closest it has is ${scaleLabel(first.scale).toLowerCase()}, so its odd notes are moved to it.` });
    if (clip.keys.length > 1) warnings.push({ text: `The paste changes key ${plural(clip.keys.length - 1, 'time')}; everything is fitted into ${target.label}.` });
    if (chromatic.length) warnings.push({ text: `${plural(chromatic.length, 'note')} outside ${target.label} ${chromatic.length === 1 ? 'was' : 'were'} moved to the nearest note of the scale (between two, the lower):`, details: capped(chromatic) });
    if (offGrid) warnings.push({ text: `${plural(offGrid, 'note')} didn’t sit on the 1/16 grid and ${offGrid === 1 ? 'was' : 'were'} moved to the nearest 1/16.` });
    if (overlapped) warnings.push({ text: `${plural(overlapped, 'overlapping note')} dropped: a Melody part plays one note at a time, so the highest was kept.` });
    if (offBeat) warnings.push({ text: `${plural(offBeat, 'chord')} didn’t start or end on a beat and ${offBeat === 1 ? 'was' : 'were'} moved to the nearest beat.` });
    if (changed.length) warnings.push({ text: `${plural(changed.length, 'chord')} played as the nearest chord the pads have:`, details: capped(changed) });
    if (ignored.length) warnings.push({ text: 'Ignored (not something this app can play):', details: capped(ignored) });
    if (cut) warnings.push({ text: `${plural(cut, 'note or chord', 'notes or chords')} past the longest song (${maxSteps} steps) left out.` });
    if (clip.skipped) warnings.push({ text: `${plural(clip.skipped, 'entry', 'entries')} in the paste couldn’t be read and ${clip.skipped === 1 ? 'was' : 'were'} skipped.` });
    if (!opts.notes && !opts.chords) problem = problem ?? 'Pick notes, chords or both to import.';
    else if (!inSong.length && !chordCount && !problem) problem = 'Nothing to import with these choices.';

    const keyChanged = opts.keyMode === 'paste' && !choice.same;
    const summary: ImportSummary = {
        target,
        keyChanged,
        notes: inSong.length,
        chords: chordCount,
        bars: Math.max(1, Math.ceil(contentEnd / barTicks)),
        startBar: barOf(0),
        parts: planned,
        replaced,
        warnings,
        problem,
    };
    if (problem) return { song, summary };
    return {
        song: { ...song, key: target.key, scale: target.scale, parts, chords: chordsOut, steps },
        summary,
    };
}
