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
 * Each vowel made as loud as the others (dB), so changing vowel doesn't jump in level: a solo voice's
 * RMS on each vowel, at three pitches across the range, measured against -38 dB. Refit whenever the
 * formants or singers change (the closed vowels, I and U, pass the least).
 */
export const VOWEL_TRIM: { [r in VoiceRange]: { [v in Vowel]: number } } = {
    low: { a: 7.4, e: 8.0, i: 8.0, o: 7.9, u: 9.2 },
    high: { a: 7.3, e: 7.6, i: 16.4, o: 14.3, u: 15.5 },
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

/** Where each vowel's resonances sit, per range: measured, or the textbook's where there's no measurement. */
export const FORMANTS: { [r in VoiceRange]: { [v in Vowel]: Formant[] } } = {
    low: { ...TEXTBOOK.low, ...measured.low?.formants },
    high: { ...TEXTBOOK.high, ...measured.high?.formants },
};

/** Each range's singers (the first is the solo voice, the choir uses all five): measured, or the stand-ins. */
export const SINGERS: { [r in VoiceRange]: number[][] } = {
    low: measured.low?.singers.length ? measured.low.singers : STAND_INS.low,
    high: measured.high?.singers.length ? measured.high.singers : STAND_INS.high,
};
