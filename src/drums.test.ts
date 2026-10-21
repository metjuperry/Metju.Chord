import { describe, expect, it } from 'vitest';
import {
    DRUM_VOICES, TICKS_PER_SIXTEENTH as S16, basicPattern, emptyPattern, expandPattern, fitPattern, hasHit,
    patternLength, presetsFor, setBars, sixteenthsPerBar, toggleHit,
} from './drums';
import { TIME_SIGNATURES, TimeSignature, changeTimeSignature, newSong, readSong, ticksPerBar } from './song';
import { musicEnd, musicLoopEnd, newPart } from './parts';

const FOUR: TimeSignature = { beats: 4, unit: 4 };

describe('drum patterns', () => {
    it('counts 1/16 steps per bar for each meter', () => {
        expect(sixteenthsPerBar(FOUR)).toBe(16);
        expect(sixteenthsPerBar({ beats: 3, unit: 4 })).toBe(12);
        expect(sixteenthsPerBar({ beats: 6, unit: 8 })).toBe(12);
        expect(sixteenthsPerBar({ beats: 7, unit: 8 })).toBe(14);
    });

    it('a pattern of N bars lasts N bars of song time', () => {
        for (const ts of TIME_SIGNATURES) {
            const p = { ...emptyPattern(2) };
            expect(patternLength(p, ts) * S16).toBe(2 * ticksPerBar(ts));
        }
    });

    it('toggles hits on and off', () => {
        let p = toggleHit(emptyPattern(), 'kick', 4);
        p = toggleHit(p, 'kick', 0);
        expect(p.hits.kick).toEqual([0, 4]);
        p = toggleHit(p, 'kick', 4);
        expect(hasHit(p, 'kick', 4)).toBe(false);
        expect(hasHit(p, 'kick', 0)).toBe(true);
    });

    it('growing the loop repeats it, shrinking cuts the end', () => {
        const one = { bars: 1 as const, hits: { kick: [0, 8], snare: [4, 12] } };
        const two = setBars(one, 2, FOUR);
        expect(two.hits.kick).toEqual([0, 8, 16, 24]);
        const back = setBars({ ...two, hits: { ...two.hits, kick: [0, 8, 16, 30] } }, 1, FOUR);
        expect(back.hits.kick).toEqual([0, 8]);
    });

    it('repeats the pattern across the song', () => {
        const p = { bars: 1 as const, hits: { kick: [0], snare: [4] } };
        const hits = expandPattern(p, FOUR, 2 * ticksPerBar(FOUR));
        expect(hits.map(h => `${h.voice}@${h.tick / S16}`)).toEqual(['kick@0', 'snare@4', 'kick@16', 'snare@20']);
    });

    it('stops repeating at the end, even part-way through a pattern', () => {
        const p = { bars: 1 as const, hits: { hat: [0, 2, 4, 6, 8, 10, 12, 14] } };
        expect(expandPattern(p, FOUR, 8 * S16)).toHaveLength(4);
    });

    it('drops hits that no longer fit after a time-signature change', () => {
        const p = { bars: 1 as const, hits: { hat: [0, 4, 8, 12, 14] } };
        expect(fitPattern(p, { beats: 3, unit: 4 }).hits.hat).toEqual([0, 4, 8]);
    });

    it('every starter beat fits its meter exactly', () => {
        for (const ts of TIME_SIGNATURES) {
            const presets = presetsFor(ts);
            expect(presets.length).toBeGreaterThan(0);
            for (const preset of presets) {
                const p = preset.make(ts);
                const len = patternLength(p, ts);
                for (const v of DRUM_VOICES) for (const i of p.hits[v] ?? []) expect(i).toBeLessThan(len);
                expect(p.hits.kick?.length).toBeGreaterThan(0);
            }
        }
    });

    it('the 4/4 starter beats were written one character per 1/16', () => {
        // a typo in a pattern string would push hits past the bar; check the rock beat by hand
        const rock = presetsFor(FOUR)[0].make(FOUR);
        expect(rock.hits.kick).toEqual([0, 8, 10]);
        expect(rock.hits.snare).toEqual([4, 12]);
        expect(rock.hits.hat).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    });

    it('the basic beat puts the snare in the middle of the bar', () => {
        expect(basicPattern({ beats: 3, unit: 4 }).hits.snare).toEqual([8]);
        expect(basicPattern({ beats: 6, unit: 8 }).hits.snare).toEqual([6]);
    });
});

describe('drum parts in the song', () => {
    const drumPart = (bars: 1 | 2 | 4) => newPart('drums', [], { bars, hits: { kick: [0] } });

    it('a drum part sets the loop when it is longer than the chords', () => {
        expect(musicLoopEnd([], [drumPart(2)], ticksPerBar(FOUR))).toBe(2 * ticksPerBar(FOUR));
        expect(musicEnd([], [drumPart(4)], ticksPerBar(FOUR))).toBe(4 * ticksPerBar(FOUR));
    });

    it('saves and reads back, dropping bad hits', () => {
        const song = newSong();
        song.parts.push(newPart('drums', song.parts, { bars: 1, hits: { kick: [0, 4, 4, 99, -1, 1.5], cowbell: [1] } as never }));
        const read = readSong(JSON.parse(JSON.stringify(song)))!;
        const drums = read.parts.find(p => p.kind === 'drums');
        expect(drums?.kind === 'drums' && drums.drums.hits).toEqual({ kick: [0, 4] });
    });

    it('changing the time signature keeps the pattern where it fits', () => {
        const song = newSong();
        song.parts.push(newPart('drums', song.parts, { bars: 1, hits: { hat: [0, 4, 8, 12] } }));
        const changed = changeTimeSignature(song, { beats: 3, unit: 4 });
        const drums = changed.parts.find(p => p.kind === 'drums');
        expect(drums?.kind === 'drums' && drums.drums.hits.hat).toEqual([0, 4, 8]);
    });
});
