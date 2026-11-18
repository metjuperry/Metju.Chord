import type { VoiceRange, Vowel } from '../parts';

import MEASURED from './vocalset.json';

/**
 * What the singers are made of (audio/voice.ts): each singer's voice colour (the strengths of its
 * harmonics, as a wave) and, per range, where each vowel's resonances (formants) sit.
 *
 * The colours are measured from real singers: VocalSet (Wilkins, Seetharaman, Wahl, Pardo,
 * Northwestern University, 2018, https://doi.org/10.5281/zenodo.1442513, CC BY 4.0), by
 * scripts/voices/vocalset.py into vocalset.json. The vowels are not: real singers' resonances are
 * wide, and through the voice's band they sounded like a synth. These are narrow ones, A fitted to a
 * pop "voice" line (Bandle's), the others at textbook places for adult speakers (Hillenbrand et al.,
 * JASA 97, 1995: men for low, women for high) with the same narrow widths.
 */

/** A resonance: its centre (Hz), bandwidth (Hz) and level (dB, 0 = loudest). */
export type Formant = [freq: number, bandwidth: number, gainDb: number];

/** Narrow F1 and F2 widths (Hz), per range: the ringing, clearly-a-vowel sound. */
const NARROW: { [r in VoiceRange]: [number, number] } = { low: [45, 60], high: [50, 65] };

const PLACES_HZ: { [r in VoiceRange]: { [v in Vowel]: [number, number, number, number] } } = {
    low: { a: [500, 990, 2522, 3100], e: [580, 1799, 2605, 3100], i: [342, 2322, 3000, 3500], o: [497, 910, 2459, 3100], u: [378, 997, 2343, 3100] },
    high: { a: [580, 1250, 2900, 3600], e: [731, 2058, 2979, 3800], i: [437, 2761, 3372, 4000], o: [555, 1035, 2828, 3700], u: [459, 1105, 2735, 3700] },
};

const shape = (r: VoiceRange, [f1, f2, f3, f4]: number[]): Formant[] => [[f1, NARROW[r][0], 0], [f2, NARROW[r][1], -3], [f3, 200, -16], [f4, 240, -22]];

/** Where each vowel's resonances sit, per range. */
export const FORMANTS: { [r in VoiceRange]: { [v in Vowel]: Formant[] } } = {
    low: { a: shape('low', PLACES_HZ.low.a), e: shape('low', PLACES_HZ.low.e), i: shape('low', PLACES_HZ.low.i), o: shape('low', PLACES_HZ.low.o), u: shape('low', PLACES_HZ.low.u) },
    high: { a: shape('high', PLACES_HZ.high.a), e: shape('high', PLACES_HZ.high.e), i: shape('high', PLACES_HZ.high.i), o: shape('high', PLACES_HZ.high.o), u: shape('high', PLACES_HZ.high.u) },
};

/**
 * Each vowel made as loud as the others to the ear (dB), so changing vowel doesn't jump in level:
 * a choir holding each vowel on three chords across its range, A-weighted (the ear hears an "ee",
 * whose energy sits low, as quieter than plain RMS says), made equal and centred on 0 dB; VOICE_VOLUME
 * sets the overall level. Refit whenever the formants, the singers or the mouth change.
 */
export const VOWEL_TRIM: { [r in VoiceRange]: { [v in Vowel]: number } } = {
    low: { a: -3.7, e: -6.7, i: 6.4, o: -3.8, u: 7.8 },
    high: { a: -2.7, e: -6.9, i: 6.4, o: -1.9, u: 5.1 },
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

type Measured = { [r in VoiceRange]?: { singers: number[][] } };
const measured = MEASURED as unknown as Measured;

/** Each range's singers (the first is the solo voice, the choir uses all five): measured, or the stand-ins. */
export const SINGERS: { [r in VoiceRange]: number[][] } = {
    low: measured.low?.singers.length ? measured.low.singers : STAND_INS.low,
    high: measured.high?.singers.length ? measured.high.singers : STAND_INS.high,
};
