import { DRUM_VOICES, DrumPattern, PATTERN_BARS, PatternBars, TICKS_PER_SIXTEENTH, emptyPattern, fitPattern, isEmptyPattern } from './drums';
import { MELODY_STEPS, Note, Part, fitNotes, hasNotes, writesNotes } from './parts';
import { Clip, TICKS_PER_BAR, lastEnd } from './progression';
import { int, isObj, oneOf } from './reading';
import type { TimeSignature } from './song';

// ---- part content: what a part holds per section, one entry per kind ------------------------------
//
// Melody and Voice parts hold notes, Drums parts a pattern. In a FullSong that content lives in each
// section (`Section.content[partId]`), in a section view it's filled into the parts, and a part in the
// FullSong itself carries the empty value. Everything that moves content around (filling a view,
// writing one back, reading saves, fitting to a shorter section, a time-signature change, song length)
// loops over `CONTENT`, so a new kind of content is one entry here plus its field on the parts.

/** Each kind of content, by the field it's kept in (on a part, and in `PartContent`). */
export interface ContentValues {
    notes: Note[];
    drums: DrumPattern;
}
export type ContentKey = keyof ContentValues;

/** The parts that hold content `K`: those with a field `K` of its type. */
export type HolderOf<K extends ContentKey> = Extract<Part, { [k in K]: ContentValues[K] }>;

/** What a section holds for one part (only the kind that part holds). */
export type PartContent = { [K in ContentKey]?: ContentValues[K] };

/** How a time-signature change moves content: ticks get `factor` times as many, in signature `to`. */
export interface Rescale {
    factor: number;
    to: TimeSignature;
}

/** Bounds for reading content from a save: the section's length in ticks, and 1/16s per bar. */
export interface ReadBounds {
    maxTick: number;
    barLen: number;
}

export interface ContentKind<K extends ContentKey> {
    /** The parts that hold this content (a voice singing chords still holds its notes). */
    holds: (p: Part) => p is HolderOf<K>;
    /** Whether the part plays its content now (a voice singing the chords doesn't): what counts for song length and the section tiles. */
    plays: (p: HolderOf<K>) => boolean;
    get: (p: HolderOf<K>) => ContentValues[K];
    set: (p: HolderOf<K>, v: ContentValues[K]) => HolderOf<K>;
    /** What a part has where a section holds none, and what a FullSong's part carries. */
    empty: () => ContentValues[K];
    /** Nothing worth keeping: a section leaves it out (a two-bar empty pattern is still kept: its length plays). */
    isEmpty: (v: ContentValues[K]) => boolean;
    /** Nothing to play (an empty pattern of any length). */
    silent: (v: ContentValues[K]) => boolean;
    /** Fitted into a section `ticks` long. */
    fit: (v: ContentValues[K], ticks: number) => ContentValues[K];
    /** Read from untrusted data, repaired (never throws). */
    read: (raw: unknown, bounds: ReadBounds) => ContentValues[K];
    /** Moved to another time signature. */
    scale: (v: ContentValues[K], r: Rescale) => ContentValues[K];
    /** Where it ends, in ticks. */
    end: (v: ContentValues[K], barTicks: number) => number;
}

/** Notes, sorted, one at a time: anything malformed, out of bounds or overlapping the note before is dropped. */
export function readNotes(v: unknown, maxTick: number): Note[] {
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

/** A drum pattern: 1, 2 or 4 bars, known voices only, hits inside the pattern, each once, sorted. */
export function readPattern(v: unknown, barLen: number): DrumPattern {
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

export const CONTENT: { [K in ContentKey]: ContentKind<K> } = {
    notes: {
        holds: hasNotes,
        plays: writesNotes,
        get: p => p.notes,
        set: (p, notes) => ({ ...p, notes }),
        empty: () => [],
        isEmpty: v => !v.length,
        silent: v => !v.length,
        fit: fitNotes,
        read: (raw, b) => readNotes(raw, b.maxTick),
        // notes move with the beats, snapped back onto the 1/16 grid
        scale: (v, r) => {
            const snap = (t: number) => Math.round((t * r.factor) / TICKS_PER_SIXTEENTH) * TICKS_PER_SIXTEENTH;
            return v.map(n => ({ ...n, start: snap(n.start), len: Math.max(TICKS_PER_SIXTEENTH, snap(n.len)) }));
        },
        end: v => v.reduce((m, n) => Math.max(m, n.start + n.len), 0),
    },
    drums: {
        holds: (p): p is HolderOf<'drums'> => p.kind === 'drums',
        plays: () => true,
        get: p => p.drums,
        set: (p, drums) => ({ ...p, drums }),
        empty: () => emptyPattern(),
        isEmpty: v => isEmptyPattern(v) && v.bars === 1,
        silent: isEmptyPattern,
        // a pattern loops, whatever the section's length
        fit: v => v,
        read: (raw, b) => readPattern(raw, b.barLen),
        // the same 1/16 positions, dropping any that no longer fit
        scale: (v, r) => fitPattern(v, r.to),
        // one pass of the pattern
        end: (v, barTicks) => v.bars * barTicks,
    },
};

export const CONTENT_KEYS = Object.keys(CONTENT) as ContentKey[];

/** Runs `fn` on the content kind part `p` holds; undefined for a part that holds none (chords, bass). */
export function withContent<R>(p: Part, fn: <K extends ContentKey>(kind: ContentKind<K>, key: K, part: HolderOf<K>) => R): R | undefined {
    const visit = <K extends ContentKey>(key: K): { r: R } | undefined => {
        const kind = CONTENT[key];
        return kind.holds(p) ? { r: fn(kind, key, p) } : undefined;
    };
    for (const key of CONTENT_KEYS) {
        const hit = visit(key);
        if (hit) return hit.r;
    }
    return undefined;
}

/** `{ [key]: v }` as a section's content for a part. */
function contentEntry<K extends ContentKey>(key: K, v: ContentValues[K]): PartContent {
    const out: PartContent = {};
    out[key] = v;
    return out;
}

/** A part without its content: what a FullSong keeps song-wide (same object when it has none). */
export const stripContent = (p: Part): Part =>
    withContent<Part>(p, (kind, _key, h) => (kind.isEmpty(kind.get(h)) ? h : kind.set(h, kind.empty()))) ?? p;

/** A part's content in a section view, ready to store in the section (undefined when there's nothing to keep). */
export const contentOf = (p: Part): PartContent | undefined =>
    withContent(p, (kind, key, h) => {
        const v = kind.get(h);
        return kind.isEmpty(v) ? undefined : contentEntry(key, v);
    });

/** A part with its content for one section filled in (the empty value when the section has none). */
export const fillContent = (p: Part, c: PartContent | undefined): Part =>
    withContent<Part>(p, (kind, key, h) => {
        const v = c?.[key];
        if (v !== undefined) return kind.set(h, v);
        return kind.isEmpty(kind.get(h)) ? h : kind.set(h, kind.empty());
    }) ?? p;

/** Two sections' content for a part, the same objects? */
export const sameContentOf = (a: PartContent, b: PartContent) => CONTENT_KEYS.every(k => a[k] === b[k]);

/** A part's content read from a save's section, for a section `bounds.maxTick` long (undefined when there's nothing to keep). */
export const readContent = (p: Part, raw: unknown, bounds: ReadBounds): PartContent | undefined =>
    isObj(raw) ? withContent(p, (kind, key) => {
        const v = kind.read(raw[key], bounds);
        return kind.isEmpty(v) ? undefined : contentEntry(key, v);
    }) : undefined;

/** A part with its content fitted into a section `ticks` long. */
export const fitContent = (p: Part, ticks: number): Part => withContent<Part>(p, (kind, _key, h) => kind.set(h, kind.fit(kind.get(h), ticks))) ?? p;

/** A part with its content moved to another time signature. */
export const rescaleContent = (p: Part, r: Rescale): Part => withContent<Part>(p, (kind, _key, h) => kind.set(h, kind.scale(kind.get(h), r))) ?? p;

/** Does the part play something of its own in a section holding `c`? Undefined for parts that follow the chords. */
export const playsContent = (p: Part, c: PartContent | undefined): boolean | undefined =>
    withContent(p, (kind, key, h) => {
        const v = c?.[key];
        return kind.plays(h) && v !== undefined && !kind.silent(v);
    });

// ---- song length ---------------------------------------------------------------------------------

/**
 * Where a part's own material ends: a melody's last note, one pass of a drum pattern. A voice singing
 * the chords follows the chord row: notes it still holds from when it sang its own don't count.
 */
export const partEnd = (p: Part, barTicks: number): number =>
    withContent(p, (kind, _key, h) => (kind.plays(h) ? kind.end(kind.get(h), barTicks) : 0)) ?? 0;

/** Where the music ends, in ticks: the last chord, melody note or drum pattern. */
export const musicEnd = (chords: Clip[], parts: Part[], barTicks = TICKS_PER_BAR) =>
    Math.max(lastEnd(chords), ...parts.map(p => partEnd(p, barTicks)));

/** Where looping playback wraps: the end of the music rounded up to a whole bar. */
export const musicLoopEnd = (chords: Clip[], parts: Part[], barTicks = TICKS_PER_BAR) =>
    Math.max(barTicks, Math.ceil(musicEnd(chords, parts, barTicks) / barTicks) * barTicks);
