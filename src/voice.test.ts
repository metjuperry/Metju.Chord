import { describe, expect, it } from 'vitest';
import { Harmony, Part, VoicePart, hasNotes, newPart, noteWriter, partNotes, restSpans, writesNotes } from './parts';
import { Clip, TICKS_PER_STEP as S } from './progression';
import { fromSingleSection, readFullSong, readSong } from './song';
import { applySectionEdit, sectionView } from './sections';
import SAMPLES from './audio/samples.json';
import { isSampledId } from './sound';

const chord = (start: number, len: number, degree: number): Clip => ({
    start: start * S, len: len * S, chord: { degree, type: 'triad', inversion: 0, octave: 4 },
});
const song: Harmony = { key: 'C', scale: 'major', chords: [chord(0, 4, 0), chord(4, 4, 5)] };
const named = (m: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12] + (Math.floor(m / 12) - 1);
const groove = { beatTicks: S };

const voice = (patch: Partial<VoicePart> = {}, others: Part[] = []): VoicePart => ({ ...(newPart('voice', others) as VoicePart), ...patch });

describe('a Voice part', () => {
    it('starts singing the chords on "ooh" from C4, with some reverb', () => {
        expect(voice()).toMatchObject({ kind: 'voice', name: 'Voice', instrument: 'voice', sings: 'chords', octave: 4, notes: [] });
        expect(voice().fx.reverb).toBeGreaterThan(0);
    });

    it('is played from the Voice Oohs samples, across the octaves it can sing in', () => {
        expect(isSampledId('voice')).toBe(true);
        const notes = SAMPLES.voice.notes;
        expect(notes[0]).toBeLessThanOrEqual(36);
        expect(notes[notes.length - 1]).toBeGreaterThanOrEqual(84);
        expect(SAMPLES.voice.loop).not.toBeNull();
    });

    it('sings the chord row moved into its octave', () => {
        const notes = partNotes(voice({ octave: 3 }), song, groove);
        expect(notes.map(n => [n.start / S, n.len / S])).toEqual([[0, 4], [4, 4]]);
        expect(notes[0].midi.map(named)).toEqual(['C3', 'E3', 'G3']);
        expect(partNotes(voice({ octave: 4 }), song, groove)[1].midi.map(named)).toEqual(['A4', 'C5', 'E5']);
    });

    it('sings its own notes when set to, from its octave', () => {
        const v = voice({ sings: 'notes', octave: 4, notes: [{ start: 0, len: S, step: 0 }, { start: S, len: S, step: 2, acc: 1 }] });
        expect(partNotes(v, song, groove).map(n => named(n.midi[0]))).toEqual(['C4', 'F4']);
        // its notes are kept while it sings the chords, ready for when it goes back
        expect(partNotes({ ...v, sings: 'chords' }, song, groove)).toHaveLength(2);
    });

    it('stops at rests singing the chords, and sings on through them singing notes', () => {
        const h: Harmony = { ...song, chords: [chord(0, 4, 0), { start: 4 * S, len: 4 * S, rest: true }] };
        expect(restSpans(h.chords, voice())).toEqual([[4 * S, 8 * S]]);
        expect(restSpans(h.chords, voice({ sings: 'notes' }))).toEqual([]);
    });

    it('is written and played from the keys like a melody only while it sings notes', () => {
        expect(hasNotes(voice())).toBe(true);
        expect(writesNotes(voice())).toBe(false);
        expect(noteWriter(voice())).toBeNull();
        expect(noteWriter(voice({ sings: 'notes' }))?.kind).toBe('voice');
    });
});

describe('a Voice part in a song', () => {
    const withVoice = () => {
        const one = fromSingleSection(readSong({ chords: [], parts: [{ kind: 'chords' }] })!);
        return { ...one, parts: [...one.parts, voice({ sings: 'notes' }, one.parts)] };
    };

    it('keeps its notes per section, like a melody', () => {
        const full = withVoice();
        const view = sectionView(full, 's1');
        const id = view.parts[1].id;
        const next = applySectionEdit(full, 's1', { ...view, parts: view.parts.map(p => (p.id === id ? { ...p, notes: [{ start: 0, len: S, step: 3 }] } as Part : p)) });
        expect(next.sections[0].content[id]).toEqual({ notes: [{ start: 0, len: S, step: 3 }] });
        expect((next.parts[1] as VoicePart).notes).toEqual([]);
        expect((sectionView(next, 's1').parts[1] as VoicePart).notes).toHaveLength(1);
    });

    it('survives a save and repairs junk', () => {
        const full = withVoice();
        const raw = JSON.parse(JSON.stringify({ ...full, parts: full.parts.map(p => (p.kind === 'voice' ? { ...p, sings: 'lyrics', octave: 9, instrument: 'piano' } : p)) }));
        const back = readFullSong(raw)!;
        expect(back.parts[1]).toMatchObject({ kind: 'voice', instrument: 'voice', sings: 'chords', octave: 5 });
        expect(readFullSong(JSON.parse(JSON.stringify(full)))!.parts[1]).toEqual(full.parts[1]);
    });

    it('opens songs saved with the old singers: their vowels, vowel lane and singer settings are dropped, the notes kept', () => {
        const full = withVoice();
        const id = full.parts[1].id;
        const raw = JSON.parse(JSON.stringify(full));
        Object.assign(raw.parts[1], { singers: 'choir', range: 'low', vowel: 'e', vibrato: 0.4, breath: 0.2, vowelGlide: 0.3, vowels: [] });
        raw.sections[0].content[id] = { notes: [{ start: 0, len: S, step: 1 }], vowels: [{ start: 0, len: S, vowel: 'a' }] };
        raw.sections[0].sound = { [id]: { vowel: 'o', singers: 'solo' } };
        const back = readFullSong(raw)!;
        const part = back.parts[1] as unknown as Record<string, unknown>;
        for (const k of ['singers', 'range', 'vowel', 'vibrato', 'breath', 'vowelGlide', 'vowels']) expect(part[k]).toBeUndefined();
        expect(back.sections[0].content[id]).toEqual({ notes: [{ start: 0, len: S, step: 1 }] });
        expect(back.sections[0].sound?.[id] ?? {}).toEqual({});
    });
});
