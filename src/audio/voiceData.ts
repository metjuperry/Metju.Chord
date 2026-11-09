import type { VoiceRange, Vowel } from '../parts';

/**
 * What the singers are made of (audio/voice.ts): each singer's voice colour (the strengths of its
 * harmonics, as a wave) and, per range, where each vowel's resonances (formants) sit.
 *
 * These are stand-ins until the VocalSet measurements land (scripts/voices, PR "Voice data"):
 * the formants are textbook averages of adult speakers (Hillenbrand et al., JASA 97, 1995: men for
 * low, women for high; the 4th is the singer's "ring" around 3 kHz), and the colours a glottal-like
 * slope with a little difference per singer. The tables keep their shape when the real data arrives.
 */

/** A resonance: its centre (Hz), bandwidth (Hz) and level (dB, 0 = loudest). */
export type Formant = [freq: number, bandwidth: number, gainDb: number];

export const FORMANTS: { [r in VoiceRange]: { [v in Vowel]: Formant[] } } = {
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
 * RMS on each vowel, at three pitches across the range, measured against -38 dB. (A high I or U puts
 * its first resonance right on the sung notes, which rings much louder.)
 */
export const VOWEL_TRIM: { [r in VoiceRange]: { [v in Vowel]: number } } = {
    low: { a: 4.9, e: 2.5, i: 0.7, o: 1.1, u: 0.8 },
    high: { a: 0, e: 2.3, i: -11.2, o: -3.5, u: -9.8 },
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
export const SINGERS: { [r in VoiceRange]: number[][] } = {
    low: [standIn(3, 1.55), standIn(7, 1.7), standIn(11, 1.45), standIn(19, 1.65), standIn(23, 1.6)],
    high: [standIn(5, 1.75), standIn(13, 1.9), standIn(17, 1.65), standIn(29, 1.85), standIn(31, 1.8)],
};
