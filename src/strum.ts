import { PPQ } from './progression';
import { StrumDirection, strumOffsets } from './theory';

/**
 * Strumming like a guitarist: a chord part in Strum mode plays a pattern of down and up strokes
 * through each chord (lined up to the bar), not one roll per chord. Down strokes hit every note of a
 * wider, guitar-like voicing, low to high; up strokes are lighter, quicker and catch only the top
 * notes, high to low; the first down stroke of a bar is a little accented; each stroke cuts the one
 * before it off, the way new strokes damp a guitar's strings.
 */

export type StrumPattern = 'once' | 'beats' | 'pop' | 'ballad' | 'eighths' | 'offbeats';

/** A pattern's strokes over one 4/4 bar in 8th notes: D down, U up, - nothing. 'once' is special. */
export const STRUM_PATTERNS: { id: StrumPattern; label: string; hint: string; strokes: string }[] = [
    { id: 'once', label: 'Once', hint: 'one stroke per chord, then it rings', strokes: 'D-------' },
    { id: 'beats', label: 'Beats', hint: 'a down stroke on every beat', strokes: 'D-D-D-D-' },
    { id: 'pop', label: 'Pop', hint: 'the campfire pattern: down, down-up, up-down-up', strokes: 'D-DU-UDU' },
    { id: 'ballad', label: 'Ballad', hint: 'a held downbeat, then down, down-up', strokes: 'D---D-DU' },
    { id: 'eighths', label: '8ths', hint: 'down-up on every 8th note', strokes: 'DUDUDUDU' },
    { id: 'offbeats', label: 'Off-beats', hint: 'light up strokes between the beats', strokes: '-U-U-U-U' },
];
export const STRUM_PATTERN_IDS = STRUM_PATTERNS.map(p => p.id);

/** Strum speeds offered: seconds from the first note of a down stroke to the last. */
export const STRUM_SPREADS = [0.02, 0.035, 0.05, 0.08] as const;
export const STRUM_SPREAD_LABELS = ['Tight', 'Medium', 'Loose', 'Lazy'];
/** The offered speed nearest to `s` (older saves had 12–60 ms). */
export const nearestSpread = (s: number) =>
    STRUM_SPREADS.reduce((best, x) => (Math.abs(x - s) < Math.abs(best - s) ? x : best), STRUM_SPREADS[1] as number);

/** Pattern slots are 8th notes. */
export const STRUM_SLOT = PPQ / 2;

/** Velocities: an accented down stroke (the bar's first), other downs, and ups. */
export const STROKE_VELOCITY = { accent: 1, down: 0.82, up: 0.6 };
/** Up strokes catch this many of the highest notes, and roll this much faster than downs. */
export const UP_NOTES = 3;
export const UP_SPEED = 0.55;

export interface Stroke {
    /** Song tick. */
    at: number;
    down: boolean;
    /** The first down stroke of a bar. */
    accent: boolean;
}

/**
 * The strokes of `pattern` over a chord from `start` to `end` (song ticks), lined up to bars of
 * `barTicks` (a pattern longer than the bar is cut at the bar line; 3/4 plays its first 6 slots).
 * A chord always gets a down stroke where it starts, like a guitarist changing chords. 'once' is just
 * that one stroke. Off-grid starts (between 8ths) still get it.
 */
export function strumStrokes(pattern: StrumPattern, start: number, end: number, barTicks: number): Stroke[] {
    const accentAt = (t: number) => ((t % barTicks) + barTicks) % barTicks === 0;
    const first: Stroke = { at: start, down: true, accent: accentAt(start) };
    if (pattern === 'once' || end <= start) return [first];
    const strokes = (STRUM_PATTERNS.find(p => p.id === pattern) ?? STRUM_PATTERNS[0]).strokes;
    const out: Stroke[] = [first];
    const firstSlot = Math.floor(start / STRUM_SLOT) * STRUM_SLOT + STRUM_SLOT;
    for (let t = firstSlot; t < end; t += STRUM_SLOT) {
        const inBar = ((t % barTicks) + barTicks) % barTicks;
        const ch = strokes[Math.floor(inBar / STRUM_SLOT) % strokes.length];
        if (ch === 'D' || ch === 'U') out.push({ at: t, down: ch === 'D', accent: ch === 'D' && accentAt(t) });
    }
    return out;
}

/**
 * A wider, guitar-like voicing for strumming: the chord as voiced, plus its lowest note an octave up
 * and (for a triad) its second note an octave up, so a stroke sweeps 5 notes instead of 3. The bass
 * note, the chord and its name don't change.
 */
export function strumVoicing(midi: number[]): number[] {
    const notes = [...new Set(midi)].sort((a, b) => a - b);
    if (notes.length < 2) return notes;
    const add = [notes[0] + 12];
    if (notes.length === 3) add.push(notes[1] + 12);
    return [...new Set([...notes, ...add])].sort((a, b) => a - b);
}

/** One stroke's notes, each note's delay (s, in the order of `midi`) and its velocity. */
export interface StrokeNotes {
    midi: number[];
    offsets: number[];
    velocity: number;
}

/** What one stroke plays: all of `voicing` low to high for a down, the top notes high to low (lighter, quicker) for an up. */
export function strokeNotes(voicing: number[], spread: number, down: boolean, accent = false): StrokeNotes {
    if (down) {
        return { midi: voicing, offsets: strumOffsets(voicing, spread, 'down'), velocity: accent ? STROKE_VELOCITY.accent : STROKE_VELOCITY.down };
    }
    const top = voicing.slice(-UP_NOTES);
    return { midi: top, offsets: strumOffsets(top, spread * UP_SPEED, 'up'), velocity: STROKE_VELOCITY.up };
}

/** A live stroke from the pads: one stroke per press, in the part's direction ('alternate': down, up, down… per press). */
export function liveStroke(midi: number[], spread: number, direction: StrumDirection, hit: number): StrokeNotes {
    const down = direction === 'down' || (direction === 'alternate' && hit % 2 === 0);
    return strokeNotes(strumVoicing(midi), spread, down, down);
}
