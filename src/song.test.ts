import { describe, it, expect } from 'vitest';
import { newSong, defaultSettings, readSaved, readSong, readSettings, encodeShare, decodeShare, SAVE_VERSION, SavedState, ticksPerStep } from './song';
import { TICKS_PER_STEP as S } from './progression';

const sample = (): SavedState => {
    const song = newSong();
    song.tracks[0].clips = [
        { start: 0, len: S, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4, key: 'C', playMode: 'Chord', arpPattern: 'up', arpRate: '8n', noteLength: 0.3 } },
        { start: S, len: 2 * S, chord: { degree: 5, type: 'diatonic7', inversion: 1, octave: 4, key: 'D', playMode: 'Arp', arpPattern: 'down', arpRate: '16n', noteLength: 0.2 } },
        { start: 3 * S, len: S, rest: true },
    ];
    song.tracks[1].mute = true;
    return { version: SAVE_VERSION, song, settings: { ...defaultSettings(), key: 'F#', theme: 'light' } };
};

describe('saving songs', () => {
    it('round-trips through JSON unchanged', () => {
        const state = sample();
        expect(readSaved(JSON.parse(JSON.stringify(state)))).toEqual(state);
    });

    it('rejects things that are not a saved song', () => {
        expect(readSaved(null)).toBeNull();
        expect(readSaved({ version: 99, song: newSong() })).toBeNull();
        expect(readSaved({ version: SAVE_VERSION, song: { tracks: [] } })).toBeNull();
        expect(readSong('hello')).toBeNull();
    });

    it('repairs bad values instead of trusting them', () => {
        const song = readSong({
            steps: 8, bpm: 9999, timeSignature: { beats: 99, unit: 3 },
            tracks: [
                { id: 'a', name: '', instrument: 'kazoo', volume: 50, color: 'pink', clips: [
                    { start: 0, len: S, chord: { degree: 12, type: 'triad', key: 'H', octave: 0 } },
                    { start: S / 2, len: S, chord: { degree: 1, type: 'triad' } },   // overlaps the first: dropped
                    { start: 7 * S, len: 5 * S, rest: true },                           // runs past the end: dropped
                    { start: 2 * S, len: S, chord: { type: 'nonsense' } },             // unknown chord type: dropped
                ] },
                { id: 'a', name: 'Dup' },
            ],
        })!;
        expect(song.bpm).toBe(240);
        expect(song.timeSignature).toEqual({ beats: 7, unit: 4 });
        const [t, dup] = song.tracks;
        expect([t.name, t.instrument, t.volume]).toEqual(['Track 1', 'epiano', 6]);
        expect(t.clips).toHaveLength(1);
        expect(t.clips[0]).toMatchObject({ chord: { degree: 6, key: 'C', octave: 1 } });
        expect(dup.id).not.toBe(t.id);
    });

    it('fills in missing settings', () => {
        expect(readSettings({ key: 'A', octave: 'x' })).toEqual({ ...defaultSettings(), key: 'A' });
    });

    it('sizes steps from the time signature', () => {
        expect(ticksPerStep({ beats: 4, unit: 4 })).toBe(S);
        expect(ticksPerStep({ beats: 6, unit: 8 })).toBe(S / 2);
    });

    it('encodes a share link and reads it back', async () => {
        const state = sample();
        const data = await encodeShare(state);
        expect(data).toMatch(/^[zp][A-Za-z0-9_-]+$/);
        expect(readSaved(await decodeShare(data))).toEqual(state);
    });
});
