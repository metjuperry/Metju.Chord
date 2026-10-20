export type MusicalKey = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export const KEYS: MusicalKey[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export type ChordType =
    | 'root' | 'triad' | 'flip' | 'minor' | 'dim' | 'aug' | 'six'
    | 'dom7' | 'diatonic7' | 'diatonic9' | 'sus2' | 'sus4';

export type ArpPattern = 'up' | 'down' | 'upDown' | 'random';

export function keyPitchClass(key: MusicalKey): number {
    return NOTE_NAMES.indexOf(key);
}

export function getNoteInKey(key: MusicalKey, degree: number): string {
    return NOTE_NAMES[(keyPitchClass(key) + MAJOR[degree]) % 12];
}

/**
 * Semitones above C of the scale tone `step` thirds above `degree` in the major
 * scale of `keyPc`. Rises monotonically with `step`: every scale-index wrap adds an octave.
 */
export function scaleDegreeSemis(keyPc: number, degree: number, step: number): number {
    const index = degree + 2 * step;
    return keyPc + MAJOR[index % 7] + 12 * Math.floor(index / 7);
}

/** MIDI note numbers of a root-position chord, strictly ascending from the root. */
export function buildChordMidi(keyPc: number, degree: number, type: ChordType, octave: number): number[] {
    const rootSemis = scaleDegreeSemis(keyPc, degree, 0);
    const rootPc = rootSemis % 12;
    const root = 12 * (octave + 1) + rootPc;
    const diatonic = (step: number) => root + scaleDegreeSemis(keyPc, degree, step) - rootSemis;

    switch (type) {
        case 'triad':
            return [root, diatonic(1), diatonic(2)];
        case 'flip': {
            // Diatonic triad with its 3rd flipped (major <-> minor); dim/aug triads are left alone
            const [, third, fifth] = [root, diatonic(1), diatonic(2)];
            return fifth - root === 7 ? [root, root + (third - root === 4 ? 3 : 4), fifth] : [root, third, fifth];
        }
        case 'minor':
            return [root, root + 3, root + 7];
        case 'six':
            return [root, root + 4, root + 7, root + 9];
        case 'dim':
            return [root, root + 3, root + 6];
        case 'aug':
            return [root, root + 4, root + 8];
        case 'dom7':
            return [root, root + 4, root + 7, root + 10]; // always a secondary dominant
        case 'diatonic7':
            return [root, diatonic(1), diatonic(2), diatonic(3)];
        case 'diatonic9':
            return [root, diatonic(1), diatonic(2), diatonic(3), root + 14];
        case 'sus2':
            return [root, root + 2, root + 7];
        case 'sus4':
            return [root, root + 5, root + 7];
        case 'root':
        default:
            return [root];
    }
}

/** Move the lowest note up an octave, `n` times. */
export function invert(midi: number[], n: number): number[] {
    const result = [...midi].sort((a, b) => a - b);
    for (let i = 0; i < n && result.length > 1; i++) {
        result.push(result.shift()! + 12);
        result.sort((a, b) => a - b);
    }
    return result;
}

export function toToneNotes(midi: number[]): string[] {
    return midi.map(m => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`);
}

/** One cycle of arpeggio notes, ordered by pitch. */
export function arpOrder(midi: number[], pattern: ArpPattern): number[] {
    const up = [...midi].sort((a, b) => a - b);
    switch (pattern) {
        case 'down':
            return up.reverse();
        case 'upDown':
            return [...up, ...up.slice(1, -1).reverse()];
        case 'random': {
            const shuffled = [...up];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }
        case 'up':
        default:
            return up;
    }
}

export interface ChordParams {
    degree: number;
    type: ChordType;
    inversion: number;
    octave: number;
}

export interface ResolvedChord {
    midi: number[];
    rootPc: number;
    notes: string[];
    name: { symbol: string; long: string };
}

export const maxInversion = (type: ChordType): number =>
    buildChordMidi(0, 0, type, 4).length - 1;

/** The single path from chord parameters to notes and name, shared by pads, keyboard and sequencer. */
export function resolveChord(key: MusicalKey, params: ChordParams): ResolvedChord {
    const keyPc = keyPitchClass(key);
    const base = buildChordMidi(keyPc, params.degree, params.type, params.octave);
    const midi = invert(base, Math.min(params.inversion, base.length - 1));
    const rootPc = base[0] % 12;
    return { midi, rootPc, notes: toToneNotes(midi), name: nameChord(midi, rootPc) };
}

const CHORD_NAMES: { [pcs: string]: [string, string] } = {
    '0,4,7': ['', 'Major'],
    '0,3,7': ['m', 'Minor'],
    '0,3,6': ['°', 'Diminished'],
    '0,4,8': ['+', 'Augmented'],
    '0,5,7': ['sus4', 'Sus4'],
    '0,2,7': ['sus2', 'Sus2'],
    '0,4,7,10': ['7', 'Dominant 7th'],
    '0,4,7,11': ['maj7', 'Major 7th'],
    '0,3,7,10': ['m7', 'Minor 7th'],
    '0,3,6,10': ['m7♭5', 'Minor 7♭5'],
    '0,3,6,9': ['°7', 'Diminished 7th'],
    '0,2,3,6,10': ['m9♭5', 'Minor 9♭5'],
    '0,2,4,7,11': ['maj9', 'Major 9th'],
    '0,2,3,7,10': ['m9', 'Minor 9th'],
    '0,2,4,7,10': ['9', 'Dominant 9th'],
    '0,4,7,9': ['6', 'Major 6th'],
};

/** Name a chord from its sounding notes; `rootPc` is the un-inverted root. */
export function nameChord(midi: number[], rootPc: number): { symbol: string; long: string } {
    const root = NOTE_NAMES[rootPc];
    const pcs = Array.from(new Set(midi.map(m => (((m - rootPc) % 12) + 12) % 12))).sort((a, b) => a - b);

    if (pcs.length === 1) {
        return { symbol: root, long: root };
    }
    const entry = CHORD_NAMES[pcs.join(',')];
    if (!entry) {
        return { symbol: `${root}?`, long: `${root}?` };
    }
    return { symbol: `${root}${entry[0]}`, long: `${root} ${entry[1]}` };
}

// ---- 8-way stick (HiChord-style default mapping) ------------------------------

export type StickDir = 'C' | 'U' | 'UR' | 'R' | 'DR' | 'D' | 'DL' | 'L' | 'UL';

export const STICK_DIRS: StickDir[] = ['UL', 'U', 'UR', 'L', 'C', 'R', 'DL', 'D', 'DR'];

export type TriadQuality = 'major' | 'minor' | 'dim' | 'aug';

/** Quality of the plain diatonic triad on a degree (the same for every key). */
export function triadQuality(degree: number): TriadQuality {
    const [root, third, fifth] = buildChordMidi(0, degree, 'triad', 4);
    if (fifth - root === 6) return 'dim';
    if (fifth - root === 8) return 'aug';
    return third - root === 4 ? 'major' : 'minor';
}

/**
 * What the stick does to the chord on a degree. Centre is the plain triad; diminished
 * chords ignore the directions that would not make sense for them (as on the HiChord).
 */
export function stickChordType(dir: StickDir, quality: TriadQuality): ChordType {
    const dim = quality === 'dim';
    switch (dir) {
        case 'U': return 'flip';
        case 'UR': return 'dom7';
        case 'R': return 'diatonic7';
        case 'DR': return dim ? 'diatonic7' : 'diatonic9';
        case 'D': return dim ? 'triad' : 'sus4';
        case 'DL': return quality === 'major' ? 'six' : quality === 'minor' ? 'sus2' : 'triad';
        case 'L': return dim ? 'minor' : 'dim';
        case 'UL': return 'aug';
        case 'C':
        default: return 'triad';
    }
}

/** Short label for what a stick direction does, for the stick itself and help. */
export const STICK_LABELS: { [dir in StickDir]: string } = {
    C: 'Triad', U: 'Flip 3rd', UR: 'Dom 7', R: '7th', DR: '9th',
    D: 'Sus4', DL: '6 / sus2', L: 'Dim', UL: 'Aug',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Roman numeral of a degree's diatonic triad: upper case major, lower case minor, ° diminished. */
export function romanNumeral(degree: number): string {
    const q = triadQuality(degree);
    const r = ROMAN[degree];
    if (q === 'minor') return r.toLowerCase();
    if (q === 'dim') return `${r.toLowerCase()}°`;
    if (q === 'aug') return `${r}+`;
    return r;
}

/** Pitch classes of the major scale on `key`. */
export function scalePitchClasses(key: MusicalKey): number[] {
    const k = keyPitchClass(key);
    return MAJOR.map(m => (k + m) % 12);
}
