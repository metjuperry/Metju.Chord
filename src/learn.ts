// The Learn page's content: chord progressions, what chord types and pads sound like, and melody
// guidelines. Pure data and helpers (no React, no audio): everything is stored in the app's own
// formats (degree + ChordType + length for chords, scale steps for melody notes) and resolved
// against the song's key with theory.ts, so it reads and sounds right in any key.

import {
    ChordType, MusicalKey, NOTE_NAMES, SCALES, STICK_DIRS, ScaleId, StickDir, TriadQuality, buildChordMidi, keyPitchClass,
    nameChord, noteNames, resolveChord, scaleLabel, stickChordType, triadQuality, voiceLead,
} from './theory';
import { Clip, PPQ, place } from './progression';
import type { Note } from './parts';
import { Song, TimeSignature, stepsPerRow, ticksPerBar, ticksPerStep } from './song';
import { TICKS_PER_SIXTEENTH } from './drums';

export type LearnTab = 'progressions' | 'chords' | 'melody';
export const LEARN_TABS: { id: LearnTab; label: string }[] = [
    { id: 'progressions', label: 'Progressions' },
    { id: 'chords', label: 'Chords' },
    { id: 'melody', label: 'Melody' },
];

const stepsOf = (scale: ScaleId) => (SCALES.find(s => s.id === scale) ?? SCALES[0]).steps;
const pcSet = (midi: number[]) => [...new Set(midi.map(m => ((m % 12) + 12) % 12))].sort((a, b) => a - b);
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isMajorTonic = (scale: ScaleId) => triadQuality(0, scale) === 'major';

/** The arrow for a stick direction, as on the instrument's wedges. */
export const STICK_ARROWS: { [d in StickDir]: string } = {
    C: '•', U: '↑', UR: '↗', R: '→', DR: '↘', D: '↓', DL: '↙', L: '←', UL: '↖',
};

/** The stick direction that gives chord type `type` on a pad whose triad is `quality` (centre for a plain triad). */
export function stickFor(type: ChordType, quality: TriadQuality): StickDir | null {
    if (type === 'triad') return 'C';
    return STICK_DIRS.find(d => d !== 'C' && stickChordType(d, quality) === type) ?? null;
}

// ---- progressions ------------------------------------------------------------------------------

/** One chord of a progression: a degree of its scale, a chord type, and how long, in quarter-note beats of a 4/4 bar. */
export interface ProgChord {
    degree: number;
    type: ChordType;
    beats: number;
}

export interface Progression {
    id: string;
    name: string;
    /** The scale its degrees and types are written in (its own sound: Mixolydian for ♭VII…). */
    scale: ScaleId;
    chords: ProgChord[];
    feel: string;
    where: string;
    why: string;
    /** An extra line when something about it needs saying (a borrowed chord, how to play it). */
    note?: string;
}

const c = (degree: number, type: ChordType = 'triad', beats = 4): ProgChord => ({ degree, type, beats });

export const PROGRESSIONS: Progression[] = [
    {
        id: 'pop', name: 'Pop anthem', scale: 'major',
        chords: [c(0), c(4), c(5), c(3)],
        feel: 'Big, hopeful, made for singing along.',
        where: '2000s–2010s pop and pop-rock choruses, stadium ballads.',
        why: 'IV pulls back to I at the loop, and V–vi dodges the obvious ending, so it never quite stops.',
    },
    {
        id: 'doowop', name: '50s / doo-wop', scale: 'major',
        chords: [c(0), c(5), c(3), c(4)],
        feel: 'Sweet, nostalgic, innocent.',
        where: '1950s doo-wop and early rock’n’roll ballads; retro pop.',
        why: 'vi and IV share notes with I, so it glides; V at the end pulls you back to the top.',
    },
    {
        id: 'sadpop', name: 'Sad pop', scale: 'major',
        chords: [c(5), c(3), c(0), c(4)],
        feel: 'The pop anthem’s chords started on vi: wistful, aching.',
        where: 'Emotional pop, emo and pop-punk, trailers and montages.',
        why: 'Starting on minor vi makes it feel like home, so I and V become brief moments of light.',
    },
    {
        id: 'pachelbel', name: 'Pachelbel-style', scale: 'major',
        chords: [c(0, 'triad', 2), c(4, 'triad', 2), c(5, 'triad', 2), c(2, 'triad', 2), c(3, 'triad', 2), c(0, 'triad', 2), c(3, 'triad', 2), c(4, 'triad', 2)],
        feel: 'Stately, warm, unfolding.',
        where: 'Baroque canons, wedding music, and pop that borrows its walking bass.',
        why: 'One move repeats (down a 4th, up a step), so each chord feels inevitable; IV–V hands you back to I.',
    },
    {
        id: 'iiVI', name: 'ii–V–I', scale: 'major',
        chords: [c(1, 'diatonic7'), c(4, 'dom7'), c(0, 'diatonic7', 8)],
        feel: 'Smooth, sophisticated, resolved.',
        where: 'Jazz standards, bossa nova, neo-soul, lounge.',
        why: 'Each root falls a 5th, the strongest move there is: ii sets up V, and V7’s tension resolves to I.',
    },
    {
        id: 'blues', name: '12-bar blues', scale: 'major',
        chords: [c(0, 'dom7'), c(0, 'dom7'), c(0, 'dom7'), c(0, 'dom7'), c(3, 'dom7'), c(3, 'dom7'), c(0, 'dom7'), c(0, 'dom7'), c(4, 'dom7'), c(3, 'dom7'), c(0, 'dom7'), c(4, 'dom7')],
        feel: 'Gritty, swaggering, conversational.',
        where: 'Blues, early rock’n’roll, boogie-woogie, swing.',
        why: 'Every chord is a dominant 7th, so nothing fully settles; the last bar’s V turns it around to the top.',
        note: 'All three are dom 7 (stick ↗). Played straight here; swing it with the melody.',
    },
    {
        id: 'andalusian', name: 'Andalusian cadence', scale: 'minor',
        chords: [c(0), c(6), c(5), c(4, 'flip')],
        feel: 'Dramatic, Spanish, fateful.',
        where: 'Flamenco, surf rock, 1960s rock, film scores.',
        why: 'The bass walks down four steps to V, whose major 3rd is a leading tone pulling back up to i.',
        note: 'V is major, borrowed from harmonic minor: pad 5 with the stick ↑ (flip 3rd), or ↗ dom 7 for more pull. The rest stays in natural minor.',
    },
    {
        id: 'epic', name: 'Epic minor', scale: 'minor',
        chords: [c(0), c(5), c(2), c(6)],
        feel: 'Heroic, sweeping, bittersweet.',
        where: 'Film and game trailers, power ballads, EDM, symphonic metal.',
        why: 'VI and III are major chords inside a minor key, so it’s dark and uplifting at once; VII climbs back to i.',
    },
    {
        id: 'royal', name: 'Royal road', scale: 'major',
        chords: [c(3, 'diatonic7'), c(4, 'dom7'), c(2, 'diatonic7'), c(5)],
        feel: 'Yearning, bright but tender.',
        where: 'J-pop, anime openings, city pop.',
        why: 'It starts away from home on IV and lands on vi instead of I, so it keeps longing.',
    },
    {
        id: 'mixo', name: 'Mixolydian rock', scale: 'mixolydian',
        chords: [c(0), c(6), c(3, 'triad', 8)],
        feel: 'Open, anthemic, swaggering.',
        where: 'Classic and arena rock, Britpop, Celtic folk.',
        why: '♭VII is a major chord a step below I: it steps home through IV and skips V’s pull, which sounds loose and confident.',
        note: '♭VII isn’t in a major key; it comes from Mixolydian (major with a ♭7).',
    },
    {
        id: 'dreamy', name: 'Dreamy minor', scale: 'minor',
        chords: [c(0, 'diatonic7'), c(3, 'diatonic7'), c(5, 'diatonic7'), c(4, 'diatonic7')],
        feel: 'Hazy, floating, late-night.',
        where: 'Lo-fi hip hop, neo-soul, chillwave.',
        why: 'iv–i is the soft “minor plagal” pull, and minor v has no leading tone, so the loop drifts instead of resolving.',
        note: 'All four with the stick → (7th). Try ↘ 9th on i for more haze.',
    },
    {
        id: 'calm', name: 'Calm minor loop', scale: 'minor',
        chords: [c(5), c(4), c(0), c(3, 'flip')],
        feel: 'Calm, nostalgic, a little hopeful.',
        where: 'Ambient and game soundtracks; C418’s “Living Mice” (Minecraft) can be heard with these chords.',
        why: 'VI–v–i settles gently without a strong V, and the major IV (borrowed from Dorian) lifts it before it loops.',
        note: 'IV is major: pad 4 with the stick ↑ (flip 3rd).',
    },
];

/** The pitch classes (relative to the tonic, 0–11) and root of a progression chord in its own scale. */
function shapeOf(scale: ScaleId, ch: { degree: number; type: ChordType }) {
    const midi = buildChordMidi(0, ch.degree, ch.type, 4, scale);
    return { pcs: pcSet(midi), root: midi[0] % 12, midi };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Chord symbol suffix → [lower case?, numeral suffix]. */
const NUMERAL_SUFFIX: { [s: string]: [boolean, string] } = {
    '': [false, ''], m: [true, ''], '°': [true, '°'], '+': [false, '+'], '7': [false, '7'], maj7: [false, 'maj7'], m7: [true, '7'],
    'm7♭5': [true, 'ø7'], '°7': [true, '°7'], sus4: [false, 'sus4'], sus2: [false, 'sus2'], '6': [false, '6'], maj9: [false, 'maj9'],
    m9: [true, '9'], '9': [false, '9'], 'm(maj7)': [true, '(maj7)'],
};

/**
 * The Roman numeral of a chord in a progression written in `scale`: counted against the major scale
 * when the tonic is major and against natural minor when it's minor (so minor keys read i–VI–III–VII
 * and Mixolydian reads I–♭VII–IV), upper case major, lower case minor, plus its 7th/9th/sus/° mark.
 */
export function chordNumeral(scale: ScaleId, ch: { degree: number; type: ChordType }): string {
    const ref = stepsOf(isMajorTonic(scale) ? 'major' : 'minor');
    const { root, midi } = shapeOf(scale, ch);
    let label: string;
    const i = ref.indexOf(root);
    if (i >= 0) label = ROMAN[i];
    else if (ref.includes((root + 1) % 12)) label = `♭${ROMAN[ref.indexOf((root + 1) % 12)]}`;
    else label = `♯${ROMAN[ref.indexOf((root + 11) % 12)]}`;
    const symbol = nameChord(midi, root, NOTE_NAMES).symbol.slice(NOTE_NAMES[root].length);
    const [lower, suffix] = NUMERAL_SUFFIX[symbol] ?? [false, symbol];
    return `${lower ? label.toLowerCase() : label}${suffix}`;
}

/** Runs of the same item squeezed into one with a count: I7 I7 I7 I7 → I7 ×4. */
export function squeeze<T>(items: T[], same: (a: T, b: T) => boolean = (a, b) => a === b): { item: T; count: number; index: number }[] {
    const out: { item: T; count: number; index: number }[] = [];
    items.forEach((item, index) => {
        const last = out[out.length - 1];
        if (last && same(last.item, item)) last.count++;
        else out.push({ item, count: 1, index });
    });
    return out;
}

/** "I–V–vi–IV", with repeats squeezed ("I7 ×4–IV7 ×2–…"). */
export const progressionNumerals = (p: Progression) =>
    squeeze(p.chords.map(ch => chordNumeral(p.scale, ch))).map(x => (x.count > 1 ? `${x.item} ×${x.count}` : x.item)).join('–');

/** A progression chord as the song's pads play it: a degree and chord type of the song's scale. */
export interface FitChord {
    degree: number;
    type: ChordType;
    beats: number;
}

/** A chord the closest in-scale version had to change, for the note under the card. */
export interface FitChange {
    wanted: string;
    got: string;
}

/**
 * How a progression goes into the song.
 * - `fits`: the song's scale plays it exactly on the song's tonic.
 * - `relative`: it plays exactly on the relative major or minor (a minor progression in a major song
 *   starts on vi: Am F C G in C major).
 * - `needs`: it needs another scale on the song's tonic (`needs`); `closest` is the nearest in-scale
 *   version, with what changed.
 */
export type Fit =
    | { kind: 'fits' | 'relative'; tonic: number; chords: FitChord[] }
    | { kind: 'needs'; needs: ScaleId; chords: FitChord[]; closest: FitChord[]; changes: FitChange[] };

/** Chord types tried when fitting, simplest first after the progression's own type. */
const FIT_TYPES: ChordType[] = ['triad', 'diatonic7', 'dom7', 'flip', 'diatonic9', 'six', 'sus4', 'sus2', 'minor', 'dim', 'aug'];

/** A (degree, type) of `scale` on `keyPc` that plays exactly these pitch classes with this root, if there is one. */
function exactChord(keyPc: number, scale: ScaleId, pcs: number[], root: number, prefer: ChordType): { degree: number; type: ChordType } | null {
    const types = [prefer, ...FIT_TYPES.filter(t => t !== prefer)];
    for (const type of types) {
        for (let degree = 0; degree < 7; degree++) {
            const midi = buildChordMidi(keyPc, degree, type, 4, scale);
            if (midi[0] % 12 === root && sameSet(pcSet(midi), pcs)) return { degree, type };
        }
    }
    return null;
}

/**
 * The chord of `scale` on `keyPc` that sounds most like `pcs`: shared notes count, the root most; extra
 * and missing notes cost. Only the scale's own chords stand in (its triads, and its 7ths for a 7th; no
 * flipped 3rds or dom 7s, which bring in notes from outside), never a dim or aug unless that's what
 * was asked for.
 */
function nearestChord(keyPc: number, scale: ScaleId, pcs: number[], root: number, wanted: ChordType): { degree: number; type: ChordType } {
    const types: ChordType[] = pcs.length > 3 ? ['diatonic7', 'triad'] : ['triad'];
    if (wanted === 'dim' || wanted === 'aug') types.push(wanted);
    let best = { score: -Infinity, degree: 0, type: 'triad' as ChordType };
    for (let degree = 0; degree < 7; degree++) {
        for (const type of types) {
            const midi = buildChordMidi(keyPc, degree, type, 4, scale);
            const got = pcSet(midi);
            // a chord that comes out dim or aug (vii°, III+) only stands in for one
            const q = triadQuality(degree, scale);
            if (type !== 'dim' && type !== 'aug' && (q === 'dim' || q === 'aug') && wanted !== 'dim' && wanted !== 'aug') continue;
            const shared = got.filter(x => pcs.includes(x));
            let score = shared.length * 2 - (got.length - shared.length) - (pcs.length - shared.length);
            if (got.includes(root)) score += 1;
            if (midi[0] % 12 === root) score += 3;
            if (score > best.score) best = { score, degree, type };
        }
    }
    return best;
}

/** How `p` goes into a song in `key` and `scale` (see `Fit`). */
export function fitProgression(p: Progression, key: MusicalKey, scale: ScaleId): Fit {
    const k = keyPitchClass(key);
    const shapes = p.chords.map(ch => shapeOf(p.scale, ch));
    const tonics = [0];
    // a major progression in a minor song can sit on the relative major (and the other way round)
    if (isMajorTonic(p.scale) !== isMajorTonic(scale)) tonics.push(isMajorTonic(scale) ? 9 : 3);
    for (const t of tonics) {
        const chords: FitChord[] = [];
        for (let i = 0; i < shapes.length; i++) {
            const s = shapes[i];
            const hit = exactChord(k, scale, s.pcs.map(x => (x + k + t) % 12).sort((a, b) => a - b), (s.root + k + t) % 12, p.chords[i].type);
            if (!hit) break;
            chords.push({ ...hit, beats: p.chords[i].beats });
        }
        if (chords.length === shapes.length) return { kind: t === 0 ? 'fits' : 'relative', tonic: (k + t) % 12, chords };
    }
    // in its own scale on the song's tonic, and the nearest the song's scale has
    const chords = p.chords.map(ch => ({ ...ch }));
    const changes: FitChange[] = [];
    const closest = shapes.map((s, i) => {
        const pcs = s.pcs.map(x => (x + k) % 12).sort((a, b) => a - b);
        const exact = exactChord(k, scale, pcs, (s.root + k) % 12, p.chords[i].type);
        const got = exact ?? nearestChord(k, scale, pcs, (s.root + k) % 12, p.chords[i].type);
        if (!exact) {
            const wanted = resolveChord(key, { ...p.chords[i], inversion: 0, octave: 4, scale: p.scale }).name.symbol;
            const gotName = `${resolveChord(key, { ...got, inversion: 0, octave: 4, scale }).name.symbol} (${chordNumeral(scale, got)})`;
            if (!changes.some(x => x.wanted === wanted)) changes.push({ wanted, got: gotName });
        }
        return { ...got, beats: p.chords[i].beats };
    });
    return { kind: 'needs', needs: p.scale, chords, closest, changes };
}

/** Chord names of fitted chords in `key` and `scale` (flats in flat keys). */
export const chordNames = (key: MusicalKey, scale: ScaleId, chords: { degree: number; type: ChordType }[]) =>
    chords.map(ch => resolveChord(key, { ...ch, inversion: 0, octave: 4, scale }).name.symbol);

/** "C Mixolydian", "A minor". */
export function keyLabel(pc: number, key: MusicalKey, scale: ScaleId): string {
    const label = scaleLabel(scale);
    const modal = !['major', 'minor', 'harmonicMinor', 'melodicMinor'].includes(scale);
    return `${noteNames(key, scale)[((pc % 12) + 12) % 12]} ${modal ? label : label.toLowerCase()}`;
}

/** A chord clip of a progression in song ticks (start relative to where it goes in). */
export interface LearnClip {
    start: number;
    len: number;
    chord: { degree: number; type: ChordType; inversion: number; octave: number };
}

/**
 * The chords as clips: lengths written in 4/4 beats are scaled so a 4-beat chord fills one bar of
 * the song's time signature, snapped to its steps (cumulatively, so a bar of two chords in 3/4 is
 * 2 + 1 beats and the total stays right). With `lead`, each chord takes the inversion and octave
 * that move least from the one before (`voiceLead`), the voicing the pads would play.
 */
export function progressionClips(chords: FitChord[], key: MusicalKey, scale: ScaleId, ts: TimeSignature, octave: number, lead = true): LearnClip[] {
    const T = ticksPerStep(ts);
    const per = ticksPerBar(ts) / (4 * PPQ);
    const out: LearnClip[] = [];
    let beats = 0;
    let prev: number[] | null = null;
    const k = keyPitchClass(key);
    for (const ch of chords) {
        const from = Math.round((beats * PPQ * per) / T) * T;
        beats += ch.beats;
        const to = Math.max(from + T, Math.round((beats * PPQ * per) / T) * T);
        let inversion = 0;
        let oct = octave;
        if (lead) {
            const v = voiceLead(buildChordMidi(k, ch.degree, ch.type, octave, scale), prev);
            inversion = v.inversion;
            oct = octave + v.octaveShift;
            prev = v.midi;
        }
        out.push({ start: from, len: to - from, chord: { degree: ch.degree, type: ch.type, inversion, octave: oct } });
    }
    return out;
}

/** The longest a section's chord row may grow to by inserting (as the Hooktheory paste). */
const MAX_STEPS = 512;

/**
 * Write `clips` into the section's chord row from tick `at` (a whole step): they replace whatever sits
 * in the stretch they cover, the rest of the row stays, and the section grows by whole rows if they run
 * past its end (up to 512 steps; anything beyond is left out). Pure; key and scale are untouched.
 */
export function insertProgression(song: Song, clips: LearnClip[], at: number): { song: Song; replaced: number; cut: number } {
    const ts = song.timeSignature;
    const T = ticksPerStep(ts);
    const row = stepsPerRow(ts);
    const maxTick = Math.max(song.steps, Math.floor(MAX_STEPS / row) * row) * T;
    const from = Math.max(0, Math.round(at / T) * T);
    let cut = 0;
    const placed: Clip[] = [];
    for (const cl of clips) {
        const start = from + cl.start;
        if (start >= maxTick) {
            cut++;
            continue;
        }
        placed.push({ start, len: Math.min(cl.len, maxTick - start), chord: cl.chord });
    }
    if (!placed.length) return { song, replaced: 0, cut };
    const to = Math.max(...placed.map(x => x.start + x.len));
    const replaced = song.chords.filter(x => x.start < to && x.start + x.len > from).length;
    const marker: Clip = { start: from, len: to - from, rest: true };
    let chords = place(song.chords, marker).filter(x => x !== marker);
    for (const x of placed) chords = place(chords, x);
    const steps = Math.max(song.steps, Math.ceil(to / T / row) * row);
    return { song: { ...song, chords, steps }, replaced, cut };
}

// ---- chords: what each sounds like ---------------------------------------------------------------

export interface StickSound {
    dir: StickDir;
    label: string;
    /** A few words, for the card's headline and the optional mood in Play mode. */
    mood: string;
    text: string;
    /** On a minor pad, when it sounds different there. */
    minorMood?: string;
    /** Which kind of pad shows it off: a major one, a minor one, or both. */
    on: ('major' | 'minor' | 'dominant')[];
}

export const STICK_SOUNDS: StickSound[] = [
    { dir: 'C', label: 'Triad', mood: 'major: bright, stable', minorMood: 'minor: sad, reflective', text: 'The plain chord of the pad. Major pads sound settled and open; minor pads sound inward.', on: ['major', 'minor'] },
    { dir: 'U', label: 'Flip 3rd', mood: 'surprise, borrowed colour', text: 'Major turns minor and minor turns major. A minor IV in a major key sounds wistful; a major V in a minor key pulls hard to i.', on: ['major', 'minor'] },
    { dir: 'R', label: '7th', mood: 'major 7: dreamy, lush', minorMood: 'minor 7: mellow, soulful', text: 'Adds the scale’s 7th. Softens everything; the default colour of jazz, soul and lo-fi.', on: ['major', 'minor'] },
    { dir: 'UR', label: 'Dom 7', mood: 'tension, wants to resolve', text: 'A major chord with a flat 7th. On V it leans hard towards I; on other pads it points to the chord a 5th below.', on: ['dominant', 'major'] },
    { dir: 'DR', label: '9th', mood: 'airy, sophisticated', minorMood: 'minor 9: bittersweet', text: 'A 7th plus the 9th on top. Wide and modern; on a minor pad, tender and a little sad.', on: ['major', 'minor'] },
    { dir: 'DL', label: '6 / sus2', mood: '6: sweet, retro', minorMood: 'sus2: open, floating', text: 'On a major pad, the 6th: a warm, old-fashioned sweetness. On a minor pad, sus2: no 3rd at all, so neither happy nor sad.', on: ['major', 'minor'] },
    { dir: 'D', label: 'Sus4', mood: 'anticipation', text: 'The 3rd is lifted to the 4th, so the chord hangs and wants to drop back to the plain triad. Try sus4 → triad on V.', on: ['dominant', 'major'] },
    { dir: 'L', label: 'Dim', mood: 'restless, unstable', text: 'Two minor 3rds stacked. Tense and dark, best as a quick passing chord between two others.', on: ['major'] },
    { dir: 'UL', label: 'Aug', mood: 'mysterious, unsettled', text: 'Two major 3rds stacked: dreamlike, unresolved. Nice as a step between I and IV or vi.', on: ['major'] },
];

/** A one- or two-word mood for a chord type on a pad of `quality`: what Play mode can show next to the chord. */
export function chordMood(type: ChordType, quality: TriadQuality): string {
    const minor = quality === 'minor';
    switch (type) {
        case 'triad': return quality === 'dim' ? 'restless' : quality === 'aug' ? 'unsettled' : minor ? 'reflective' : 'bright';
        case 'flip': return quality === 'major' ? 'wistful' : quality === 'minor' ? 'borrowed lift' : 'restless';
        case 'diatonic7': return quality === 'dim' ? 'uneasy' : minor ? 'mellow' : quality === 'major' ? 'dreamy' : 'tense';
        case 'dom7': return 'tension';
        case 'diatonic9': return minor ? 'bittersweet' : quality === 'major' ? 'airy' : 'uneasy';
        case 'six': return 'sweet';
        case 'sus2': return 'floating';
        case 'sus4': return 'anticipation';
        case 'dim': return 'restless';
        case 'minor': return 'reflective';
        case 'aug': return 'mysterious';
        default: return '';
    }
}

/** What each pad does in a key: its function and feel. Index = degree. */
export const PAD_ROLES: { major: string[]; minor: string[] } = {
    major: [
        'Home. Rest, resolution, the end of a phrase.',
        'Preparation. Leads naturally to V.',
        'Ambiguous, wistful. Shares notes with I and V, so it blurs.',
        'Lift, departure. Moving away from home, hopeful.',
        'Tension pulling home. The strongest way back to I.',
        'The “sad home”. Minor, but close to I: a soft landing.',
        'Restless leading tone. A short step before I.',
    ],
    minor: [
        'Home, but darker. Rest with a shadow.',
        'Diminished and tense. Leads to V; brief.',
        'The relative major: a burst of light.',
        'Deep, melancholy. iv → i is the soft minor ending.',
        'Minor v drifts; flip it to major V (↑) for a real pull home.',
        'Warm, wide, cinematic. The big major chord of minor keys.',
        'Climbs back to i, or to III. Epic, rock.',
    ],
};

/** A worked example: a pad plus a stick direction, and what that adds up to. */
export interface Combo {
    /** Which pad: the key's first minor pad (vi in major), the tonic, or the dominant (V). */
    pad: 'minor' | 'tonic' | 'dominant';
    dir: StickDir;
    sum: string;
    result: string;
    /** Play it and then the chord it leads to (on the same pad, or on another one). */
    then?: { pad: 'minor' | 'tonic' | 'dominant'; dir: StickDir };
}

export const COMBOS: Combo[] = [
    { pad: 'minor', dir: 'DR', sum: 'a minor chord (sad, reflective) + a 9th (air, softness)', result: 'bittersweet, gentle, jazzy' },
    { pad: 'tonic', dir: 'R', sum: 'home (rest) + a major 7th (dream, lush)', result: 'settled but floating: a warm ending that isn’t final' },
    { pad: 'dominant', dir: 'UR', sum: 'V (tension) + a dominant 7th (wants to resolve)', result: 'the strongest pull home there is', then: { pad: 'tonic', dir: 'C' } },
    { pad: 'dominant', dir: 'D', sum: 'V + sus4 (anticipation)', result: 'a held breath; let it fall to the plain V', then: { pad: 'dominant', dir: 'C' } },
];

/** The degree a combo means in `scale`: the first minor pad (vi in major, i in minor), the tonic, V. */
export function comboDegree(pad: Combo['pad'], scale: ScaleId): number {
    if (pad === 'tonic') return 0;
    if (pad === 'dominant') return 4;
    return [5, 0, 1, 2, 3, 4, 6].find(d => triadQuality(d, scale) === 'minor') ?? 5;
}

/** The pad that shows off a stick direction best: `major` → I (or the first major pad), `minor` → vi (or the first minor pad), `dominant` → V. */
export function showcaseDegree(on: 'major' | 'minor' | 'dominant', scale: ScaleId): number | null {
    if (on === 'dominant') return 4;
    const order = on === 'major' ? [0, 3, 4, 2, 5, 6, 1] : [5, 0, 1, 2, 3, 4, 6];
    return order.find(d => triadQuality(d, scale) === on) ?? null;
}

// ---- melody guidelines ---------------------------------------------------------------------------

/** A tiny invented example: notes in the app's melody format, over a few chords. */
export interface MelodyExample {
    /** Bars of 4/4 it covers. */
    bars: number;
    notes: Note[];
    /** The chords under it (degree, type, beats), played quietly below. */
    chords: ProgChord[];
}

export interface MelodyRule {
    id: string;
    title: string;
    text: string;
    example: MelodyExample;
    tryThis: string;
}

/** A note from 1/16 positions: start, length, scale step (0 = the key's root), optional ♭ / ♯. */
const n = (start16: number, len16: number, step: number, acc?: -1 | 1): Note => ({
    start: start16 * TICKS_PER_SIXTEENTH, len: len16 * TICKS_PER_SIXTEENTH, step, ...(acc ? { acc } : {}),
});

export const MELODY_RULES: MelodyRule[] = [
    {
        id: 'chord-tones', title: 'Chord tones on strong beats',
        text: 'On beats 1 and 3, land on a note of the chord underneath. In between, anything in the scale can pass through.',
        example: {
            bars: 2,
            notes: [n(0, 2, 2), n(2, 2, 3), n(4, 4, 4), n(8, 2, 2), n(10, 2, 1), n(12, 4, 0), n(16, 4, 4), n(20, 2, 3), n(22, 2, 2), n(24, 8, 1)],
            chords: [c(0), c(4)],
        },
        tryThis: 'Write only the beat-1 and beat-3 notes first (chord tones), then fill the gaps.',
    },
    {
        id: 'steps', title: 'Mostly steps; after a leap, step back',
        text: 'Moving to the next scale note sounds singable. A jump is exciting, so follow it with a step the other way to balance it.',
        example: {
            bars: 2,
            notes: [n(0, 2, 0), n(2, 2, 1), n(4, 2, 2), n(6, 2, 1), n(8, 4, 5), n(12, 2, 4), n(14, 2, 3), n(16, 4, 2), n(20, 2, 3), n(22, 2, 2), n(24, 8, 0)],
            chords: [c(0), c(3, 'triad', 2), c(0, 'triad', 2)],
        },
        tryThis: 'Allow yourself one leap per bar, then go back by step.',
    },
    {
        id: 'motif', title: 'Build from a short motif',
        text: 'Two to four notes with a clear rhythm is enough. Say it, say it again, then change one thing: the pitch, the rhythm or the ending.',
        example: {
            bars: 2,
            notes: [n(0, 2, 4), n(2, 2, 4), n(4, 4, 2), n(8, 2, 4), n(10, 2, 4), n(12, 4, 2), n(16, 2, 5), n(18, 2, 5), n(20, 4, 3), n(24, 2, 5), n(26, 2, 4), n(28, 4, 3)],
            chords: [c(0), c(3)],
        },
        tryThis: 'Repeat your motif, then move it one step up over the next chord.',
    },
    {
        id: 'qa', title: 'Question and answer',
        text: 'A phrase that ends up in the air (on V, or not on the root) asks; a similar phrase that comes home answers. Longer songs do it in 2 + 2 bars.',
        example: {
            bars: 2,
            notes: [n(0, 2, 0), n(2, 2, 2), n(4, 4, 4), n(8, 2, 4), n(10, 2, 3), n(12, 4, 1), n(16, 2, 1), n(18, 2, 2), n(20, 4, 1), n(24, 8, 0)],
            chords: [c(0, 'triad', 2), c(4, 'triad', 2), c(4, 'triad', 2), c(0, 'triad', 2)],
        },
        tryThis: 'Copy your first phrase and change only its last two notes so it lands on the root.',
    },
    {
        id: 'rhythm', title: 'Rhythm first, then pitch',
        text: 'A good rhythm on one note already sounds like a tune. Clap or tap it first, then give it pitches.',
        example: {
            bars: 2,
            notes: [n(0, 4, 0), n(4, 2, 0), n(6, 2, 0), n(8, 6, 0), n(14, 2, 0), n(16, 4, 4), n(20, 2, 5), n(22, 2, 4), n(24, 6, 2), n(30, 2, 1)],
            chords: [c(0), c(0)],
        },
        tryThis: 'Record a rhythm on pad 1 only, then move some notes to other rows.',
    },
    {
        id: 'endings', title: 'End on a chord tone; end the song on the root',
        text: 'Phrases feel finished when the last long note belongs to the chord. The very end of the song wants the root over I.',
        example: {
            bars: 2,
            notes: [n(0, 4, 5), n(4, 2, 4), n(6, 2, 3), n(8, 4, 4), n(12, 2, 3), n(14, 2, 1), n(16, 16, 0)],
            chords: [c(3, 'triad', 2), c(4, 'triad', 2), c(0)],
        },
        tryThis: 'Hold the last note of each phrase and check it’s shaded in the grid (a chord tone).',
    },
    {
        id: 'peak', title: 'One high point per phrase',
        text: 'Let the line climb to a single peak and come down. Hitting the top note once makes it count.',
        example: {
            bars: 2,
            notes: [n(0, 2, 0), n(2, 2, 1), n(4, 2, 2), n(6, 2, 4), n(8, 2, 5), n(10, 6, 7), n(16, 2, 5), n(18, 2, 4), n(20, 4, 3), n(24, 4, 2), n(28, 4, 0)],
            chords: [c(0), c(3, 'triad', 2), c(0, 'triad', 2)],
        },
        tryThis: 'Find the highest note in your verse; if it appears twice, lower one of them.',
    },
    {
        id: 'space', title: 'Leave space',
        text: 'Rests are part of the melody: they let the chords speak and give the listener (and a singer) a breath.',
        example: {
            bars: 2,
            notes: [n(0, 2, 4), n(2, 2, 2), n(4, 4, 0), n(16, 2, 6), n(18, 2, 5), n(20, 4, 4)],
            chords: [c(0), c(4)],
        },
        tryThis: 'Delete every note in beats 3–4 of each bar and listen.',
    },
];

/** Using ♭ / ♯ (the selected note's ♭ ♮ ♯, or the stick ← / → in Notes mode): two small examples. */
export const ACCIDENTAL_TIPS: MelodyRule[] = [
    {
        id: 'borrowed', title: 'Borrowed colour: ♭6 over a minor iv',
        text: 'In a major key, flatten the 6th (A♭ in C) while the IV chord turns minor (pad 4, stick ↑). A classic bittersweet moment.',
        example: {
            bars: 2,
            notes: [n(0, 4, 5), n(4, 4, 3), n(8, 4, 5, -1), n(12, 4, 3), n(16, 8, 4), n(24, 8, 2)],
            chords: [c(3, 'triad', 2), c(3, 'flip', 2), c(0)],
        },
        tryThis: 'Use it once, near the end of a section.',
    },
    {
        id: 'leading', title: 'Leading tone: a ♯ that pulls up',
        text: 'A note a semitone below a chord tone leans into it (F♯ → G in C). In minor keys, ♯7 pulls up to the root.',
        example: {
            bars: 2,
            notes: [n(0, 4, 2), n(4, 2, 3), n(6, 2, 3, 1), n(8, 8, 4), n(16, 4, 4), n(20, 2, 2), n(22, 2, 1), n(24, 8, 0)],
            chords: [c(0, 'triad', 2), c(4, 'triad', 2), c(4, 'triad', 2), c(0, 'triad', 2)],
        },
        tryThis: 'Put the altered note on a weak beat, then step to the chord tone.',
    },
];

/** Melody example notes and backing chords as clips, for the mini grid and ▶ (4/4 ticks). */
export function exampleChordClips(ex: MelodyExample): { start: number; len: number; degree: number; type: ChordType }[] {
    let at = 0;
    return ex.chords.map(ch => {
        const out = { start: at, len: ch.beats * PPQ, degree: ch.degree, type: ch.type };
        at += ch.beats * PPQ;
        return out;
    });
}
