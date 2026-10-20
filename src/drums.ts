import { PPQ } from './progression';
import type { TimeSignature } from './song';

// ---- drum patterns: a short loop of 1/16 steps that repeats under the whole song ------------

export const DRUM_VOICES = ['kick', 'snare', 'clap', 'hat', 'openhat', 'tomlo', 'tomhi', 'rim'] as const;
export type DrumVoice = (typeof DRUM_VOICES)[number];

export const DRUM_LABELS: { [v in DrumVoice]: string } = {
    kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hat', openhat: 'Open hat', tomlo: 'Low tom', tomhi: 'High tom', rim: 'Rim',
};

/** Lane order in the grid, top to bottom: cymbals on top, kick at the bottom, as drum machines do. */
export const DRUM_ROWS: DrumVoice[] = ['openhat', 'hat', 'rim', 'clap', 'snare', 'tomhi', 'tomlo', 'kick'];

export const PATTERN_BARS = [1, 2, 4] as const;
export type PatternBars = (typeof PATTERN_BARS)[number];

/** One 1/16 note in ticks. */
export const TICKS_PER_SIXTEENTH = PPQ / 4;

export interface DrumPattern {
    bars: PatternBars;
    /** Per voice, the 1/16 steps (from the start of the pattern) that sound. */
    hits: { [v in DrumVoice]?: number[] };
}

/** 1/16 steps in one bar: 16 in 4/4, 12 in 3/4 and 6/8, 14 in 7/8. */
export const sixteenthsPerBar = (ts: TimeSignature) => (ts.beats * 16) / ts.unit;
/** 1/16 steps in one sequencer step (one beat): 4 for x/4, 2 for x/8. */
export const sixteenthsPerStep = (ts: TimeSignature) => 16 / ts.unit;

export const patternLength = (p: DrumPattern, ts: TimeSignature) => p.bars * sixteenthsPerBar(ts);
export const patternTicks = (p: DrumPattern, ts: TimeSignature) => patternLength(p, ts) * TICKS_PER_SIXTEENTH;

export const hasHit = (p: DrumPattern, voice: DrumVoice, i: number) => !!p.hits[voice]?.includes(i);

export function toggleHit(p: DrumPattern, voice: DrumVoice, i: number): DrumPattern {
    const now = p.hits[voice] ?? [];
    const next = now.includes(i) ? now.filter(x => x !== i) : [...now, i].sort((a, b) => a - b);
    return { ...p, hits: { ...p.hits, [voice]: next } };
}

/** Change the loop length: growing repeats what is there, shrinking cuts the end off. */
export function setBars(p: DrumPattern, bars: PatternBars, ts: TimeSignature): DrumPattern {
    const bar = sixteenthsPerBar(ts);
    const oldLen = p.bars * bar;
    const newLen = bars * bar;
    const hits: DrumPattern['hits'] = {};
    for (const v of DRUM_VOICES) {
        const src = p.hits[v];
        if (!src?.length) continue;
        const out: number[] = [];
        for (let i = 0; i < newLen; i++) if (src.includes(i % oldLen)) out.push(i);
        hits[v] = out;
    }
    return { bars, hits };
}

/** Keep the same 1/16 positions after a time-signature change, dropping any that no longer fit. */
export function fitPattern(p: DrumPattern, ts: TimeSignature): DrumPattern {
    const len = patternLength(p, ts);
    const hits: DrumPattern['hits'] = {};
    for (const v of DRUM_VOICES) {
        const kept = p.hits[v]?.filter(i => i < len);
        if (kept?.length) hits[v] = kept;
    }
    return { ...p, hits };
}

export const emptyPattern = (bars: PatternBars = 1): DrumPattern => ({ bars, hits: {} });
export const isEmptyPattern = (p: DrumPattern) => DRUM_VOICES.every(v => !p.hits[v]?.length);

export interface DrumHit {
    voice: DrumVoice;
    /** Song position in ticks. */
    tick: number;
}

/** Every hit of the pattern, repeated from the top of the song up to `end` ticks. */
export function expandPattern(p: DrumPattern, ts: TimeSignature, end: number): DrumHit[] {
    const len = patternTicks(p, ts);
    const out: DrumHit[] = [];
    if (len <= 0) return out;
    for (let base = 0; base < end; base += len) {
        for (const v of DRUM_VOICES) {
            for (const i of p.hits[v] ?? []) {
                const tick = base + i * TICKS_PER_SIXTEENTH;
                if (tick < end) out.push({ voice: v, tick });
            }
        }
    }
    return out.sort((a, b) => a.tick - b.tick);
}

// ---- starter patterns --------------------------------------------------------------------

/** A pattern written as one string per voice, one character per 1/16: `x` = hit, anything else = rest. */
type Grid = { [v in DrumVoice]?: string };

function fromGrid(bars: PatternBars, grid: Grid): DrumPattern {
    const hits: DrumPattern['hits'] = {};
    for (const v of DRUM_VOICES) {
        const row = grid[v]?.replace(/\s/g, '');
        if (!row) continue;
        hits[v] = [...row].flatMap((ch, i) => (ch === 'x' ? [i] : []));
    }
    return { bars, hits };
}

export interface DrumPreset {
    id: string;
    label: string;
    make: (ts: TimeSignature) => DrumPattern;
}

const PRESETS_4_4: DrumPreset[] = [
    {
        id: 'rock', label: 'Rock', make: () => fromGrid(1, {
            hat: '   x.x. x.x. x.x. x.x.',
            snare: ' .... x... .... x...',
            kick: '  x... .... x.x. ....',
        }),
    },
    {
        id: 'four', label: 'Four on the floor', make: () => fromGrid(1, {
            openhat: '..x. ..x. ..x. ..x.',
            hat: '    x... x... x... x...',
            clap: '   .... x... .... x...',
            kick: '   x... x... x... x...',
        }),
    },
    {
        id: 'halftime', label: 'Half-time', make: () => fromGrid(1, {
            hat: '   x.x. x.x. x.x. x.x.',
            snare: ' .... .... x... ....',
            kick: '  x... ...x .... ..x.',
        }),
    },
    {
        id: 'boombap', label: 'Boom bap', make: () => fromGrid(2, {
            hat: '   x.x. x.x. x.x. x.xx  x.x. x.x. x.x. x.x.',
            snare: ' .... x... .... x...  .... x... .... x..x',
            kick: '  x... ...x ..x. ....  x.x. ...x ..x. ....',
        }),
    },
    {
        id: 'bossa', label: 'Bossa nova', make: () => fromGrid(2, {
            hat: '   x.x. x.x. x.x. x.x.  x.x. x.x. x.x. x.x.',
            rim: '   x..x ..x. ..x. ....  x..x ..x. .x.. ....',
            kick: '  x..x x..x x..x x..x  x..x x..x x..x x..x',
        }),
    },
    {
        id: 'disco', label: 'Disco', make: () => fromGrid(1, {
            openhat: '..x. ..x. ..x. ..x.',
            hat: '    xx.x xx.x xx.x xx.x',
            snare: '  .... x... .... x...',
            kick: '   x... x... x... x...',
        }),
    },
];

/**
 * A plain beat for any meter: kick on the first beat, snare on the beat that starts the second half
 * (or the second group of three), a hat on every beat.
 */
export function basicPattern(ts: TimeSignature): DrumPattern {
    const per = sixteenthsPerStep(ts);
    const compound = ts.unit === 8 && ts.beats % 3 === 0;
    const backbeat = compound ? 3 : Math.ceil(ts.beats / 2);
    const hat: number[] = [];
    for (let b = 0; b < ts.beats; b++) hat.push(b * per);
    const kick = [0];
    if (compound && ts.beats >= 9) kick.push(6 * per);
    const snare = [backbeat * per];
    if (compound && ts.beats === 12) snare.push(9 * per);
    return { bars: 1, hits: { hat, kick, snare } };
}

const WALTZ: DrumPreset = {
    id: 'waltz', label: 'Waltz', make: () => fromGrid(1, {
        hat: '  x.x. x.x. x.x.',
        snare: '.... x... x...',
        kick: ' x... .... ....',
    }),
};

const SIX_EIGHT: DrumPreset = {
    id: 'sixeight', label: '6/8 groove', make: () => fromGrid(1, {
        hat: '  x.x.x. x.x.x.',
        snare: '...... x.....',
        kick: ' x..... ....x.',
    }),
};

const BASIC: DrumPreset = { id: 'basic', label: 'Basic', make: basicPattern };

/** Starter patterns that fit the time signature; the first is what a new drum track starts with. */
export function presetsFor(ts: TimeSignature): DrumPreset[] {
    if (ts.beats === 4 && ts.unit === 4) return PRESETS_4_4;
    if (ts.beats === 3 && ts.unit === 4) return [WALTZ, BASIC];
    if (ts.beats === 6 && ts.unit === 8) return [SIX_EIGHT, BASIC];
    return [BASIC];
}
