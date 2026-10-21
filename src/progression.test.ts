import { describe, it, expect } from 'vitest';
import { Clip, place, setLength, split, fitTo, loopEnd, clipAt, TICKS_PER_STEP as S } from './progression';

// Positions below are written in steps and stored in ticks
const chord = (start: number, len: number, degree = 0): Clip => ({
    start: start * S, len: len * S, chord: { degree, type: 'triad', inversion: 0, octave: 4 },
});
const span = (clips: Clip[]) => clips.map(c => [c.start / S, c.len / S]);

describe('progression lane', () => {
    it('places a clip into empty space', () => {
        expect(span(place([chord(0, 1)], chord(2, 2)))).toEqual([[0, 1], [2, 2]]);
    });

    it('trims the clip it lands in the middle of, keeping head and tail', () => {
        expect(span(place([chord(0, 4)], chord(1, 2)))).toEqual([[0, 1], [1, 2], [3, 1]]);
    });

    it('removes clips it fully covers', () => {
        expect(span(place([chord(1, 1), chord(2, 1)], chord(0, 4)))).toEqual([[0, 4]]);
    });

    it('lengthening pushes into the next clip and shortens it', () => {
        const a = chord(0, 2);
        const b = chord(2, 2, 3);
        expect(span(setLength([a, b], a, 3 * S, 8 * S))).toEqual([[0, 3], [3, 1]]);
    });

    it('never lengthens past the end or below one beat', () => {
        const a = chord(6, 2);
        expect(span(setLength([a], a, 5 * S, 8 * S))).toEqual([[6, 2]]);
        expect(span(setLength([a], a, 0, 8 * S))).toEqual([[6, 1]]);
    });

    it('splits a held chord at the cursor, or after its first beat', () => {
        const a = chord(0, 4);
        expect(span(split([a], a, 2 * S))).toEqual([[0, 2], [2, 2]]);
        expect(span(split([a], a, 0))).toEqual([[0, 1], [1, 3]]);
        const one = chord(0, 1);
        expect(span(split([one], one, 0))).toEqual([[0, 1]]);
    });

    it('fits clips to a shorter lane', () => {
        expect(span(fitTo([chord(0, 2), chord(3, 3), chord(8, 1)], 4 * S))).toEqual([[0, 2], [3, 1]]);
    });

    it('loops at the end of the last clip, rounded up to a bar', () => {
        expect(loopEnd([]) / S).toBe(4);
        expect(loopEnd([chord(0, 1)]) / S).toBe(4);
        expect(loopEnd([chord(4, 3)]) / S).toBe(8);
    });

    it('keeps off-grid positions that the grid cannot show yet', () => {
        const a = chord(0, 2);
        const nudged: Clip = { ...chord(0, 1), start: S + S / 4, len: S / 2 };
        expect(place([a], nudged).map(c => [c.start, c.len])).toEqual([[0, S + S / 4], [S + S / 4, S / 2], [S + 3 * S / 4, S / 4]]);
    });

    it('finds the clip covering a tick', () => {
        const clips = [chord(0, 1), chord(1, 3)];
        expect(clipAt(clips, 2 * S)).toBe(clips[1]);
        expect(clipAt(clips, 5 * S)).toBeUndefined();
    });
});
