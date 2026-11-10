import type { VoiceRange, Vowel } from '../parts';

import MEASURED from './vocalset.json';

/**
 * What the singers are made of (audio/voice.ts): each singer's voice colour (the strengths of its
 * harmonics, as a wave) and, per range, where each vowel's resonances (formants) sit.
 *
 * Measured from real singers: VocalSet (Wilkins, Seetharaman, Wahl, Pardo, Northwestern University,
 * 2018, https://doi.org/10.5281/zenodo.1442513, CC BY 4.0), by scripts/voices/vocalset.py into
 * vocalset.json (see its "from" and "counted" for who and how many). Where the measurement has
 * nothing (a range or vowel), the stand-ins below fill in: textbook formants of adult speakers
 * (Hillenbrand et al., JASA 97, 1995: men for low, women for high) and a glottal-like slope.
 */

/** A resonance: its centre (Hz), bandwidth (Hz) and level (dB, 0 = loudest). */
export type Formant = [freq: number, bandwidth: number, gainDb: number];

const TEXTBOOK: { [r in VoiceRange]: { [v in Vowel]: Formant[] } } = {
    low: {
        a: [[768, 90, 0], [1333, 100, -6], [2522, 160, -16], [3100, 200, -20]],
        e: [[580, 70, 0], [1799, 100, -3], [2605, 170, -10], [3100, 200, -18]],
        i: [[342, 50, 0], [2322, 120, -3], [3000, 200, -8], [3500, 220, -16]],
        o: [[497, 70, 0], [910, 80, -6], [2459, 150, -22], [3100, 200, -26]],
        u: [[378, 60, 0], [997, 80, -10], [2343, 150, -26], [3100, 200, -30]],
    },
    high: {
        a: [[936, 100, 0], [1551, 110, -6], [2815, 170, -16], [3700, 220, -22]],
        e: [[731, 80, 0], [2058, 110, -3], [2979, 180, -10], [3800, 220, -20]],
        i: [[437, 60, 0], [2761, 130, -3], [3372, 210, -8], [4000, 240, -18]],
        o: [[555, 80, 0], [1035, 90, -6], [2828, 160, -22], [3700, 220, -26]],
        u: [[459, 70, 0], [1105, 90, -10], [2735, 160, -26], [3700, 220, -30]],
    },
};

/**
 * Each vowel made as loud as the others to the ear (dB), so changing vowel doesn't jump in level:
 * a choir holding each vowel on three chords across its range, A-weighted (the ear hears an "ee",
 * whose energy sits low, as quieter than plain RMS says), made equal and centred on 0 dB; VOICE_VOLUME
 * sets the overall level. Refit whenever the formants, the singers or the mouth change.
 */
export const VOWEL_TRIM: { [r in VoiceRange]: { [v in Vowel]: number } } = {
    low: { a: 1.4, e: 1.4, i: 5.4, o: 5.6, u: 11.4 },
    high: { a: -11.7, e: -8.0, i: 0.5, o: -6.2, u: 0.3 },
};

/** Harmonics in a singer's wave. */
export const HARMONICS = 48;

/** A stand-in singer: harmonics falling ~10 dB an octave, each singer a little brighter or darker and with its own wrinkles. */
function standIn(seed: number, tilt: number): number[] {
    let a = seed;
    const rand = () => {
        a = (a * 1103515245 + 12345) & 0x7fffffff;
        return a / 0x7fffffff;
    };
    return Array.from({ length: HARMONICS }, (_, i) => {
        const n = i + 1;
        return Math.pow(n, -tilt) * (0.8 + 0.4 * rand());
    });
}

/** Each range's singers: the first is the solo voice, the choir uses them all. */
const STAND_INS: { [r in VoiceRange]: number[][] } = {
    low: [standIn(3, 1.55), standIn(7, 1.7), standIn(11, 1.45), standIn(19, 1.65), standIn(23, 1.6)],
    high: [standIn(5, 1.75), standIn(13, 1.9), standIn(17, 1.65), standIn(29, 1.85), standIn(31, 1.8)],
};

type Measured = { [r in VoiceRange]?: { singers: number[][]; formants: { [v in Vowel]?: Formant[] } } };
const measured = MEASURED as unknown as Measured;

const VOWEL_IDS: Vowel[] = ['a', 'e', 'i', 'o', 'u'];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const clampTo = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * One voice across the vowels. What tells vowels apart is the first two formants; the third and
 * fourth belong to the singer (their "ring") and stay put whatever they sing. So: F1 and F2 per
 * vowel, as measured, with bandwidths kept to what voices have (a bandwidth measured off a sung note
 * can come out far too wide or narrow, which changes the voice, not the vowel); F3 and F4 the same on
 * every vowel, at the median of where they were measured. Levels aren't used: in the cascade
 * (voice.ts) they follow from where the formants sit.
 */
function oneVoice(all: { [v in Vowel]: Formant[] }): { [v in Vowel]: Formant[] } {
    const f3 = median(VOWEL_IDS.map(v => all[v][2][0]));
    const f4 = Math.max(f3 + 400, median(VOWEL_IDS.map(v => all[v][3][0])));
    return Object.fromEntries(VOWEL_IDS.map(v => {
        const [[f1, b1], [f2, b2]] = all[v];
        return [v, [[f1, clampTo(b1, 60, 110), 0], [f2, clampTo(b2, 70, 130), 0], [f3, 240, 0], [f4, 300, 0]]];
    })) as { [v in Vowel]: Formant[] };
}

/** Where each vowel's resonances sit, per range: measured (or the textbook's where there's no measurement), as one voice. */
export const FORMANTS: { [r in VoiceRange]: { [v in Vowel]: Formant[] } } = {
    low: oneVoice({ ...TEXTBOOK.low, ...measured.low?.formants }),
    high: oneVoice({ ...TEXTBOOK.high, ...measured.high?.formants }),
};

/** Each range's singers (the first is the solo voice, the choir uses all five): measured, or the stand-ins. */
export const SINGERS: { [r in VoiceRange]: number[][] } = {
    low: measured.low?.singers.length ? measured.low.singers : STAND_INS.low,
    high: measured.high?.singers.length ? measured.high.singers : STAND_INS.high,
};
