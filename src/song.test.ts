import { describe, it, expect } from 'vitest';
import { newSong, defaultSettings, readSaved, readSong, readSettings, encodeShare, decodeShare, SAVE_VERSION, SavedState, ticksPerStep,
    changeTimeSignature, stepsPerRow, transportBpm, isCompound, ticksPerBar } from './song';
import { TICKS_PER_STEP as S } from './progression';
import { newPart } from './parts';

const sample = (): SavedState => {
    const song = { ...newSong(), key: 'F#' as const, scale: 'dorian' as const };
    song.chords = [
        { start: 0, len: S, chord: { degree: 0, type: 'triad', inversion: 0, octave: 4 } },
        { start: S, len: 2 * S, chord: { degree: 5, type: 'diatonic7', inversion: 1, octave: 4 } },
        { start: 3 * S, len: S, rest: true, plays: { p1: true, p2: false } },
    ];
    song.parts = song.parts.map(p => (p.kind === 'bass' ? { ...p, mute: true, style: 'walk' }
        : p.kind === 'melody' ? { ...p, notes: [{ start: 0, len: 48, step: 4 }, { start: 48, len: 24, step: 7 }] } : p));
    song.parts.push(newPart('drums', song.parts, { bars: 2, hits: { kick: [0, 16], hat: [2, 6] } }));
    return { version: SAVE_VERSION, song, settings: { ...defaultSettings(), octave: 3, theme: 'light' } };
};

describe('saving songs', () => {
    it('round-trips through JSON unchanged', () => {
        const state = sample();
        expect(readSaved(JSON.parse(JSON.stringify(state)))).toEqual(state);
    });

    it('rejects things that are not a saved song', () => {
        expect(readSaved(null)).toBeNull();
        expect(readSaved({ version: 99, song: newSong() })).toBeNull();
        expect(readSaved({ version: SAVE_VERSION, song: { parts: [] } })).toBeNull();
        expect(readSaved({ version: 1, song: newSong() })).toBeNull();
        expect(readSong('hello')).toBeNull();
    });

    it('repairs bad values instead of trusting them', () => {
        const song = readSong({
            key: 'H', scale: 'blues', steps: 8, bpm: 9999, timeSignature: { beats: 99, unit: 3 },
            chords: [
                { start: 0, len: S, chord: { degree: 12, type: 'triad', octave: 0 } },
                { start: S / 2, len: S, chord: { degree: 1, type: 'triad' } },   // overlaps the first: dropped
                { start: 7 * S, len: 5 * S, rest: true },                           // runs past the end: dropped
                { start: 3 * S, len: S, rest: true, plays: { p1: 'yes', p2: false } }, // only boolean plays are kept
                { start: 2 * S, len: S, chord: { type: 'nonsense' } },             // unknown chord type: dropped
            ],
            parts: [
                { kind: 'chords', id: 'a', name: '', instrument: 'kazoo', volume: 50, color: 'pink', playMode: 'Shred' },
                { kind: 'chords', id: 'a', name: 'Dup' },
                { kind: 'bass', style: 'slap', octave: 9 },
                { kind: 'melody', notes: [{ start: 0, len: 48, step: 99 }, { start: 24, len: 24, step: 2 }, { start: 9999, len: 24, step: 1 }] },
                { kind: 'kazoo' },
            ],
        })!;
        expect([song.key, song.scale, song.bpm]).toEqual(['C', 'major', 240]);
        expect(song.timeSignature).toEqual({ beats: 12, unit: 4 });
        expect(song.chords).toHaveLength(2);
        expect(song.chords[0]).toMatchObject({ chord: { degree: 6, octave: 1 } });
        expect(song.chords[1]).toEqual({ start: 3 * S, len: S, rest: true, plays: { p2: false } });
        const [a, dup, bass, melody] = song.parts;
        expect(song.parts).toHaveLength(4);
        expect(a).toMatchObject({ kind: 'chords', name: 'Keys', instrument: 'epiano', volume: 6, playMode: 'Chord' });
        expect(dup.id).not.toBe(a.id);
        expect(bass).toMatchObject({ kind: 'bass', style: 'pulse', octave: 3 });
        expect(melody.kind === 'melody' && melody.notes).toEqual([{ start: 0, len: 48, step: 14 }]);
    });

    it('a song without a chord part gets one, so the pads have something to play', () => {
        const song = readSong({ chords: [], parts: [{ kind: 'drums', drums: { bars: 1, hits: { kick: [0] } } }] })!;
        expect(song.parts.map(p => p.kind)).toEqual(['chords', 'drums']);
    });

    it('fills in missing settings', () => {
        expect(readSettings({ octave: 'x', loop: false })).toEqual({ ...defaultSettings(), loop: false });
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

describe('time signatures', () => {
    it('sizes rows as whole bars about 8 steps wide', () => {
        expect(stepsPerRow({ beats: 4, unit: 4 })).toBe(8);
        expect(stepsPerRow({ beats: 3, unit: 4 })).toBe(9);
        expect(stepsPerRow({ beats: 6, unit: 8 })).toBe(6);
        expect(stepsPerRow({ beats: 5, unit: 4 })).toBe(10);
        expect(stepsPerRow({ beats: 12, unit: 8 })).toBe(12);
    });

    it('counts BPM in the signature\'s own beats', () => {
        expect(transportBpm(100, { beats: 4, unit: 4 })).toBe(100);
        expect(transportBpm(120, { beats: 6, unit: 8 })).toBe(60);
    });

    it('knows compound meters', () => {
        expect([{ beats: 6, unit: 8 }, { beats: 9, unit: 8 }, { beats: 7, unit: 8 }, { beats: 3, unit: 4 }].map(t => isCompound(t as any)))
            .toEqual([true, true, false, false]);
    });

    it('keeps chords on the same steps when switching signature', () => {
        const song = newSong();
        song.steps = 16;
        song.chords = [{ start: 4 * S, len: 2 * S, rest: true }];
        const six8 = changeTimeSignature(song, { beats: 6, unit: 8 });
        const step = ticksPerStep(six8.timeSignature);
        expect(six8.chords[0].start / step).toBe(4);
        expect(six8.chords[0].len / step).toBe(2);
        expect(six8.steps).toBe(18); // whole rows of 6
        expect(ticksPerBar(six8.timeSignature)).toBe(6 * step);
        const back = changeTimeSignature(six8, { beats: 4, unit: 4 });
        expect(back.chords).toEqual(song.chords);
        expect(back.steps).toBe(16);
    });

    it('doesn\'t keep growing the song when switching back and forth', () => {
        let song = newSong(); // 8 steps, empty
        for (const t of [{ beats: 6, unit: 8 }, { beats: 3, unit: 4 }, { beats: 4, unit: 4 }] as const) song = changeTimeSignature(song, t);
        expect(song.steps).toBe(8);
    });

    it('never cuts off a chord when the rows get shorter', () => {
        const song = newSong();
        song.chords = [{ start: 6 * S, len: S, rest: true }]; // ends on step 7 of 8
        const twoFour = changeTimeSignature(song, { beats: 2, unit: 4 }); // rows of 8, nearest is 8
        expect(twoFour.steps).toBe(8);
        const sixEight = changeTimeSignature(song, { beats: 6, unit: 8 }); // rows of 6: needs 12 to keep step 7
        expect(sixEight.steps).toBe(12);
    });

    it('moves melody notes with the beats and keeps them on the 1/16 grid', () => {
        const song = newSong();
        song.parts = song.parts.map(p => (p.kind === 'melody' ? { ...p, notes: [{ start: 2 * S, len: S, step: 3 }] } : p));
        const six8 = changeTimeSignature(song, { beats: 6, unit: 8 });
        const mel = six8.parts.find(p => p.kind === 'melody');
        // beat 3 is still beat 3, now an eighth long
        expect(mel?.kind === 'melody' && mel.notes).toEqual([{ start: 2 * (S / 2), len: S / 2, step: 3 }]);
    });
});

describe('effects in the song', () => {
    it('new parts start dry, with the default shared space', () => {
        const song = newSong();
        expect(song.parts.every(p => p.fx.drive === 0 && p.fx.chorus === 0 && p.fx.reverb === 0 && p.fx.delay === 0)).toBe(true);
        expect(song.space.delay.time).toBe('8n');
    });

    it('reads effects back, clamped, and keeps drums off drive and chorus', () => {
        const song = readSong({
            chords: [],
            parts: [
                { kind: 'bass', fx: { drive: 0.6, chorus: 7, reverb: -1, delay: 'x' } },
                { kind: 'drums', fx: { drive: 1, chorus: 1, tremolo: 1, glide: 1, reverb: 0.2, delay: 0.1 } },
            ],
            space: { reverb: { size: 99, ret: 0.5 }, delay: { time: '3n', feedback: 2, ret: 0.4 }, out: { level: 0.6 } },
        })!;
        const bass = song.parts.find(p => p.kind === 'bass')!;
        const drums = song.parts.find(p => p.kind === 'drums')!;
        expect(bass.fx).toEqual({ drive: 0.6, chorus: 1, tremolo: 0, glide: 0, reverb: 0, delay: 0 });
        expect(drums.fx).toEqual({ drive: 0, chorus: 0, tremolo: 0, glide: 0, reverb: 0.2, delay: 0.1 });
        expect(song.space).toEqual({ reverb: { size: 8, ret: 0.5 }, delay: { time: '8n', feedback: 0.9, ret: 0.4 }, out: { level: 0.6 } });
    });

    it('songs saved before effects load dry', () => {
        const old = JSON.parse(JSON.stringify(newSong()));
        old.parts.forEach((p: { fx?: unknown }) => delete p.fx);
        delete old.space;
        const song = readSong(old)!;
        expect(song.parts.every(p => p.fx.reverb === 0)).toBe(true);
        expect(song.space.out.level).toBe(1);
    });
});

describe('part tone (attack, release, brightness, pan)', () => {
    it('new instrument parts start as designed', () => {
        const song = newSong();
        for (const p of song.parts) if (p.kind !== 'drums') expect(p.tone).toEqual({ attack: 0.5, release: 0.5, brightness: 0.5, pan: 0.5 });
    });

    it('reads tone back clamped, and fills it in for songs saved before it existed', () => {
        const song = readSong({
            chords: [],
            parts: [
                { kind: 'chords', tone: { attack: 0.1, release: 3, brightness: 'x', pan: -2 } },
                { kind: 'bass' },
                { kind: 'drums', tone: { attack: 0 } },
            ],
        })!;
        const [keys, bass, drums] = song.parts;
        expect(keys.kind === 'chords' && keys.tone).toEqual({ attack: 0.1, release: 1, brightness: 0.5, pan: 0 });
        expect(bass.kind === 'bass' && bass.tone).toEqual({ attack: 0.5, release: 0.5, brightness: 0.5, pan: 0.5 });
        expect('tone' in drums).toBe(false);
    });
});

describe('tremolo and glide', () => {
    it('are read back clamped; older songs get them off', () => {
        const song = readSong({ chords: [], parts: [{ kind: 'melody', fx: { tremolo: 0.4, glide: 3 } }, { kind: 'bass', fx: { drive: 0.2 } }] })!;
        const of = (kind: string) => song.parts.find(p => p.kind === kind)!.fx;
        expect(of('melody')).toMatchObject({ tremolo: 0.4, glide: 1 });
        expect(of('bass')).toMatchObject({ drive: 0.2, tremolo: 0, glide: 0 });
    });
});

describe('strum settings', () => {
    it('are saved with the part, clamped, with defaults for older songs', () => {
        const song = readSong({ chords: [], parts: [
            { kind: 'chords', playMode: 'Strum', strumSpread: 5, strumDirection: 'sideways' },
            { kind: 'chords', playMode: 'Arp' },
        ] })!;
        const [a, b] = song.parts;
        expect(a.kind === 'chords' && [a.playMode, a.strumSpread, a.strumDirection]).toEqual(['Strum', 0.1, 'down']);
        expect(b.kind === 'chords' && [b.playMode, b.strumSpread, b.strumDirection]).toEqual(['Arp', 0.025, 'down']);
    });
});

describe('next-chord hint setting', () => {
    it('is on by default, and kept when saved off', () => {
        expect(defaultSettings().nextHint).toBe(true);
        expect(readSettings({}).nextHint).toBe(true);
        expect(readSettings({ nextHint: false }).nextHint).toBe(false);
        expect(readSettings({ nextHint: 'no' }).nextHint).toBe(true);
    });
});
