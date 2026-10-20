import { describe, it, expect } from 'vitest';
import { buildChordMidi, invert, nameChord, resolveChord, toToneNotes, arpOrder, ChordType, maxInversion } from './theory';

const TYPES: ChordType[] = ['root', 'triad', 'flip', 'dim', 'aug', 'dom7', 'diatonic7', 'diatonic9', 'sus2', 'sus4'];
const intervals = (m: number[]) => m.map(n => n - m[0]);

describe('buildChordMidi', () => {
    it('voices Am7 in C major as A C E G ascending', () => {
        const notes = buildChordMidi(0, 5, 'diatonic7', 4);
        expect(intervals(notes)).toEqual([0, 3, 7, 10]);
        expect(notes[0] % 12).toBe(9);
        expect(notes[0]).toBe(69);
    });

    it('never produces a chord whose bass is not the root, or that descends', () => {
        for (let key = 0; key < 12; key++) {
            for (let degree = 0; degree < 7; degree++) {
                for (const type of TYPES) {
                    const notes = buildChordMidi(key, degree, type, 4);
                    const rootPc = (key + [0, 2, 4, 5, 7, 9, 11][degree]) % 12;
                    expect(notes[0] % 12).toBe(rootPc);
                    for (let i = 1; i < notes.length; i++) {
                        expect(notes[i]).toBeGreaterThan(notes[i - 1]);
                    }
                }
            }
        }
    });

    it('stacks the diatonic 9th above the 7th without wrapping', () => {
        const g9 = buildChordMidi(0, 4, 'diatonic9', 4); // G B D F A
        expect(intervals(g9)).toEqual([0, 4, 7, 10, 14]);
    });
});

describe('invert', () => {
    it('first inversion of Am7 has C in the bass and stays within two octaves', () => {
        const am7 = buildChordMidi(0, 5, 'diatonic7', 4);
        const inv = invert(am7, 1);
        expect(inv[0] % 12).toBe(0);
        expect(Math.max(...inv) - Math.min(...inv)).toBeLessThan(24);
        expect(invert(am7, 0)).toEqual(am7);
    });

    it('supports every inversion up to length - 1', () => {
        for (const type of TYPES) {
            const notes = buildChordMidi(0, 0, type, 4);
            for (let n = 0; n <= maxInversion(type); n++) {
                const inv = invert(notes, n);
                expect(inv).toHaveLength(notes.length);
                expect(inv).toEqual([...inv].sort((a, b) => a - b));
            }
        }
    });
});

describe('toToneNotes', () => {
    it('names MIDI notes', () => {
        expect(toToneNotes([60, 61, 69, 71])).toEqual(['C4', 'C#4', 'A4', 'B4']);
    });
});

describe('nameChord', () => {
    const name = (key: number, degree: number, type: ChordType, inversion = 0) => {
        const { rootPc, midi } = resolveChord(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][key] as any, { degree, type, inversion, octave: 4 });
        return nameChord(midi, rootPc).symbol;
    };

    it('names chords from their notes', () => {
        expect(nameChord([55, 59, 62, 65], 7).symbol).toBe('G7');
        expect(nameChord([59, 62, 65, 69], 11).symbol).toBe('Bm7♭5');
        expect(nameChord([57, 60, 64, 67], 9).symbol).toBe('Am7');
    });

    it('names the chords the pads actually play in C major', () => {
        expect(name(0, 4, 'diatonic7')).toBe('G7');
        expect(name(0, 6, 'diatonic7')).toBe('Bm7♭5');
        expect(name(0, 6, 'triad')).toBe('B°');
        expect(name(0, 0, 'diatonic7')).toBe('Cmaj7');
        expect(name(0, 4, 'diatonic9')).toBe('G9');
        expect(name(0, 2, 'diatonic9')).toBe('Em9');
        expect(name(0, 1, 'sus4')).toBe('Dsus4');
        expect(name(9, 0, 'aug')).toBe('A+');
    });

    it('dom7 is always a secondary dominant', () => {
        expect(name(0, 1, 'dom7')).toBe('D7');
        expect(name(0, 5, 'dom7')).toBe('A7');
        expect(name(0, 4, 'dom7')).toBe('G7');
        for (let degree = 0; degree < 7; degree++) {
            expect(intervals(buildChordMidi(0, degree, 'dom7', 4))).toEqual([0, 4, 7, 10]);
        }
    });

    it('diatonic9 always stacks a major 9th', () => {
        expect(name(0, 2, 'diatonic9')).toBe('Em9');
        expect(name(0, 6, 'diatonic9')).toBe('Bm9♭5');
        for (let degree = 0; degree < 7; degree++) {
            const notes = buildChordMidi(0, degree, 'diatonic9', 4);
            expect(notes[4] - notes[0]).toBe(14);
        }
    });

    it('flip swaps the 3rd of the diatonic triad, leaving dim triads alone', () => {
        expect(name(0, 0, 'flip')).toBe('Cm');
        expect(name(0, 1, 'flip')).toBe('D');
        expect(name(0, 6, 'flip')).toBe('B°');
        expect(name(0, 3, 'flip')).toBe('Fm');
        expect(name(0, 5, 'flip')).toBe('A');
        for (let degree = 0; degree < 7; degree++) {
            expect(buildChordMidi(0, degree, 'flip', 4)[2] - buildChordMidi(0, degree, 'flip', 4)[0]).toBe(degree === 6 ? 6 : 7);
        }
    });

    it('is independent of inversion', () => {
        expect(name(0, 5, 'diatonic7', 2)).toBe('Am7');
    });

    it('never falls back to "?" for any pad combination', () => {
        for (let key = 0; key < 12; key++)
            for (let degree = 0; degree < 7; degree++)
                for (const type of TYPES) expect(name(key, degree, type)).not.toContain('?');
    });

    it('names a single note by its root', () => {
        expect(nameChord([60], 0).symbol).toBe('C');
    });
});

describe('arpOrder', () => {
    it('sorts numerically, not lexically', () => {
        expect(arpOrder([76, 59, 69, 61], 'up')).toEqual([59, 61, 69, 76]);
        expect(arpOrder([76, 59, 69, 61], 'down')).toEqual([76, 69, 61, 59]);
    });

    it('upDown does not repeat the top or bottom note', () => {
        expect(arpOrder([60, 64, 67], 'upDown')).toEqual([60, 64, 67, 64]);
        expect(arpOrder([60], 'upDown')).toEqual([60]);
        expect(arpOrder([60, 64], 'upDown')).toEqual([60, 64]);
    });

    it('random is a permutation', () => {
        expect([...arpOrder([60, 64, 67, 71], 'random')].sort()).toEqual([60, 64, 67, 71]);
    });
});
