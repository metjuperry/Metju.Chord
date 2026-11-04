import { describe, it, expect } from 'vitest';
import { ChordPart, newPart } from './parts';
import { previewSound } from './preview';

const parts = () => {
    const ps = [newPart('chords', [])];
    ps.push(newPart('bass', ps), newPart('melody', ps), newPart('drums', ps));
    return ps;
};

describe('sound preview', () => {
    it("plays the key's root: a note for bass and melody, the tonic chord for chords", () => {
        const [chords, bass, melody] = parts();
        expect(previewSound(bass, 'A', 'minor', 4, 0)).toEqual({ kind: 'notes', midi: [12 * 3 + 9] }); // A2
        expect(previewSound(melody, 'A', 'minor', 4, 0)).toEqual({ kind: 'notes', midi: [12 * 5 + 9] }); // A4
        expect(previewSound(chords, 'A', 'minor', 4, 0)).toEqual({ kind: 'notes', midi: [69, 72, 76] }); // Am
    });

    it('plays a chord part its way: strummed, or arpeggiated', () => {
        const chords = parts()[0] as ChordPart;
        const strum = previewSound({ ...chords, playMode: 'Strum', strumSpread: 0.05 }, 'C', 'major', 4, 0);
        expect(strum.kind === 'notes' && strum.strum).toEqual([0, 0.025, 0.05]);
        const arp = previewSound({ ...chords, playMode: 'Arp' }, 'C', 'major', 4, 0);
        expect(arp.kind === 'notes' && arp.arp).toBe(true);
    });

    it('plays drums as kick and snare on alternate beats, with a hat', () => {
        const drums = parts()[3];
        expect([0, 1].map(b => previewSound(drums, 'C', 'major', 4, b))).toEqual([
            { kind: 'drums', voices: ['kick', 'hat'] },
            { kind: 'drums', voices: ['snare', 'hat'] },
        ]);
    });
});
