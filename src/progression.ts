import type { ArpPattern, ChordParams, MusicalKey } from './theory';
import type { ArpRate } from './audio/engine';
import type { InstrumentId } from './audio/instruments';

export type PlayMode = 'Chord' | 'Arp';

/** How a recorded chord is played, captured when it was recorded. The instrument belongs to the track. */
export interface ClipSound {
    key: MusicalKey;
    playMode: PlayMode;
    arpPattern: ArpPattern;
    arpRate: ArpRate;
    noteLength: number;
}

export const BEATS_PER_BAR = 4;

/** The sequencer grows a row of 8 steps (two bars) at a time: SEQ-8, SEQ-16, ... */
export const STEPS_PER_ROW = 8;

/**
 * Time resolution. Events are stored in ticks, not grid steps, so the grid is only a view:
 * a step is one quarter note = 96 ticks, which leaves room for 1/8, 1/16, triplets and nudges.
 */
export const PPQ = 96;
export const TICKS_PER_STEP = PPQ;
export const TICKS_PER_BAR = PPQ * BEATS_PER_BAR;

export const stepsToTicks = (steps: number) => steps * TICKS_PER_STEP;
export const ticksToSteps = (ticks: number) => ticks / TICKS_PER_STEP;

/** A chord that starts at tick `start` and is held for `len` ticks. */
export interface ChordClip {
    start: number;
    len: number;
    rest?: false;
    chord: ChordParams & ClipSound;
}

/** Silence for `len` ticks. */
export interface RestClip {
    start: number;
    len: number;
    rest: true;
}

export type Clip = ChordClip | RestClip;

export const clipEnd = (c: Clip) => c.start + c.len;

export const isChordClip = (c: Clip | undefined): c is ChordClip => !!c && !c.rest;

/** The clip covering `tick`, if any. */
export function clipAt(clips: Clip[], tick: number): Clip | undefined {
    return clips.find(c => tick >= c.start && tick < clipEnd(c));
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

/** Change a clip's length (min `minLen`, never past `total`), pushing aside what follows. */
export function setLength(clips: Clip[], clip: Clip, len: number, total: number, minLen = TICKS_PER_STEP): Clip[] {
    const next = Math.max(minLen, Math.min(len, total - clip.start));
    if (next === clip.len) return clips;
    return place(remove(clips, clip), { ...clip, len: next });
}

/** Split a held clip at `tick` (or after its first `step`) so the chord is struck again there. */
export function split(clips: Clip[], clip: Clip, tick: number, step = TICKS_PER_STEP): Clip[] {
    if (clip.len < 2 * step) return clips;
    const at = tick > clip.start && tick < clipEnd(clip) ? tick : clip.start + step;
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

/** The end of the last clip, in ticks (0 when empty). */
export const lastEnd = (clips: Clip[]) => clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);

/** Where playback wraps: the end of the last clip, rounded up to a whole bar of `barTicks`. */
export function loopEnd(clips: Clip[], barTicks = TICKS_PER_BAR): number {
    return Math.max(barTicks, Math.ceil(lastEnd(clips) / barTicks) * barTicks);
}

// ---- tracks ----------------------------------------------------------------------------

/** A lane of the sequencer with its own instrument and level. */
export interface Track {
    id: string;
    name: string;
    color: string;
    instrument: InstrumentId;
    /** Level in dB, 0 = as matched by `npm run levels`. */
    volume: number;
    mute: boolean;
    solo: boolean;
    clips: Clip[];
}

export const TRACK_COLORS = ['#ffcc00', '#4fd1c5', '#7fb4ff', '#d38cff', '#ff7aa8', '#c8e06e'];
export const MAX_TRACKS = TRACK_COLORS.length;

/** The next free id, so tracks loaded from a saved song never collide with new ones. */
const nextTrackId = (existing: Track[]) =>
    `t${existing.reduce((m, t) => Math.max(m, parseInt(t.id.replace(/\D/g, ''), 10) || 0), 0) + 1}`;

export function newTrack(existing: Track[], instrument: InstrumentId, name?: string): Track {
    const used = new Set(existing.map(t => t.color));
    return {
        id: nextTrackId(existing),
        name: name ?? `Track ${existing.length + 1}`,
        color: TRACK_COLORS.find(c => !used.has(c)) ?? TRACK_COLORS[existing.length % TRACK_COLORS.length],
        instrument,
        volume: 0,
        mute: false,
        solo: false,
        clips: [],
    };
}

/** Tracks the sequencer should play: soloed ones if any are soloed, otherwise all that aren't muted. */
export function audibleTracks(tracks: Track[]): Track[] {
    const soloed = tracks.filter(t => t.solo);
    return soloed.length ? soloed : tracks.filter(t => !t.mute);
}

/** Where all tracks together end, in ticks. */
export const songEnd = (tracks: Track[]) => Math.max(0, ...tracks.map(t => lastEnd(t.clips)));

/** Where playback wraps for all tracks: the end of the last clip on any track, rounded up to a bar. */
export const songLoopEnd = (tracks: Track[], barTicks = TICKS_PER_BAR) => loopEnd(tracks.flatMap(t => t.clips), barTicks);
