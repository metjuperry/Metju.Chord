import type { DrumVoice } from './drums';
import { InstrumentPart, Part, melodyMidi } from './parts';
import { MusicalKey, ScaleId, keyPitchClass, resolveChord, strumOffsets } from './theory';

/**
 * Sound preview: while the song is stopped, changing a part's sound in Parts plays something short on
 * that part on every beat, so the change is heard at once. It's the key's root: the root note for bass
 * and melody, the tonic chord for a chord part (played its way: block, strummed, or arpeggiated),
 * and a kick / hat / snare / hat beat for drums.
 */
export type PreviewSound =
    | { kind: 'notes'; midi: number[]; strum?: number[]; arp?: boolean }
    | { kind: 'drums'; voices: DrumVoice[] };

/** How long the preview keeps going after the last change, in beats (so release and reverb are heard). */
export const PREVIEW_TAIL_BEATS = 2;

export function previewSound(part: Part, key: MusicalKey, scale: ScaleId, chordOctave: number, beat: number): PreviewSound {
    if (part.kind === 'drums') {
        const voices: DrumVoice[] = beat % 2 === 0 ? ['kick', 'hat'] : ['snare', 'hat'];
        return { kind: 'drums', voices };
    }
    const p = part as InstrumentPart;
    if (p.kind === 'bass') return { kind: 'notes', midi: [12 * (p.octave + 1) + keyPitchClass(key)] };
    if (p.kind === 'melody') return { kind: 'notes', midi: [melodyMidi(p, { key, scale }, 0)] };
    const midi = resolveChord(key, { degree: 0, type: 'triad', inversion: 0, octave: chordOctave, scale }).midi;
    if (p.playMode === 'Strum') return { kind: 'notes', midi, strum: strumOffsets(midi, p.strumSpread, 'down') };
    if (p.playMode === 'Arp') return { kind: 'notes', midi, arp: true };
    return { kind: 'notes', midi };
}
