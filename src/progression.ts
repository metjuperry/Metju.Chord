import { ChordParams } from './theory';

export type PlayMode = 'Chord' | 'Arp';

export const BEATS_PER_BAR = 4;

/** A chord that starts on `start` and is held for `len` beats. */
export interface ChordClip {
    start: number;
    len: number;
    rest?: false;
    chord: ChordParams & { playMode: PlayMode };
}

/** Silence for `len` beats. */
export interface RestClip {
    start: number;
    len: number;
    rest: true;
}

export type Clip = ChordClip | RestClip;

export const clipEnd = (c: Clip) => c.start + c.len;

export const isChordClip = (c: Clip | undefined): c is ChordClip => !!c && !c.rest;

/** The clip covering `beat`, if any. */
export function clipAt(clips: Clip[], beat: number): Clip | undefined {
    return clips.find(c => beat >= c.start && beat < clipEnd(c));
}

/**
 * Put `clip` on the lane. Anything it overlaps is trimmed: a clip that starts
 * before it keeps its head, one that runs past it keeps its tail, one fully
 * covered is removed.
 */
export function place(clips: Clip[], clip: Clip): Clip[] {
    const end = clipEnd(clip);
    const out: Clip[] = [];
    for (const c of clips) {
        const ce = clipEnd(c);
        if (ce <= clip.start || c.start >= end) {
            out.push(c);
            continue;
        }
        if (c.start < clip.start) out.push({ ...c, len: clip.start - c.start });
        if (ce > end) out.push({ ...c, start: end, len: ce - end });
    }
    out.push(clip);
    return out.sort((a, b) => a.start - b.start);
}

export function remove(clips: Clip[], clip: Clip): Clip[] {
    return clips.filter(c => c !== clip);
}

/** Change a clip's length (min 1, never past `total`), pushing aside what follows. */
export function setLength(clips: Clip[], clip: Clip, len: number, total: number): Clip[] {
    const next = Math.max(1, Math.min(len, total - clip.start));
    if (next === clip.len) return clips;
    return place(remove(clips, clip), { ...clip, len: next });
}

/** Split a held clip at `beat` so the chord is struck again there. */
export function split(clips: Clip[], clip: Clip, beat: number): Clip[] {
    if (clip.len < 2) return clips;
    const at = beat > clip.start && beat < clipEnd(clip) ? beat : clip.start + 1;
    const head = { ...clip, len: at - clip.start };
    const tail = { ...clip, start: at, len: clipEnd(clip) - at };
    return [...remove(clips, clip), head, tail].sort((a, b) => a.start - b.start);
}

/** Drop or shorten clips that no longer fit in `total` beats. */
export function fitTo(clips: Clip[], total: number): Clip[] {
    return clips
        .filter(c => c.start < total)
        .map(c => (clipEnd(c) > total ? { ...c, len: total - c.start } : c));
}

/** Where playback wraps: the end of the last clip, rounded up to a whole bar. */
export function loopEnd(clips: Clip[]): number {
    const last = clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
    return Math.max(BEATS_PER_BAR, Math.ceil(last / BEATS_PER_BAR) * BEATS_PER_BAR);
}
