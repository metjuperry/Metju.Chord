import { MusicalKey } from './ScalePicker';

// Map of all notes in chromatic order
const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Major scale intervals (in semitones from root)
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Get the note at a specific position in a key's major scale
 */
export function getNoteInKey(key: MusicalKey, scalePosition: number): string {
    const rootIndex = CHROMATIC_SCALE.indexOf(key);
    const interval = MAJOR_SCALE_INTERVALS[scalePosition];
    const noteIndex = (rootIndex + interval) % 12;
    return CHROMATIC_SCALE[noteIndex];
}

/**
 * Build a chord based on the root note, chord type, and key
 * Uses diatonic scale degrees for building chords within the key
 */
export function buildChord(
    key: MusicalKey,
    scalePosition: number,
    chordType: string,
    octave: number = 4,
    inversion: number = 0
): string[] {
    const rootNote = getNoteInKey(key, scalePosition);

    // Helper to get a note at a scale degree above the root
    // For chromatic alterations (dim, aug, etc.), we use semitone offsets
    const rootIndex = CHROMATIC_SCALE.indexOf(rootNote);
    const getNoteByOffset = (offset: number): string => {
        const index = (rootIndex + offset) % 12;
        return CHROMATIC_SCALE[index];
    };

    switch (chordType) {
        case 'maj/min':
            // Diatonic triad: root (1st), 3rd, 5th scale degrees
            const third = getNoteInKey(key, (scalePosition + 2) % 7);
            const fifth = getNoteInKey(key, (scalePosition + 4) % 7);
            return [
                `${rootNote}${octave}`,
                `${third}${octave}`,
                `${fifth}${octave}`
            ];

        case 'dim':
            // Diminished: root, minor 3rd, diminished 5th (chromatic)
            return [
                `${rootNote}${octave}`,
                `${getNoteByOffset(3)}${octave}`,
                `${getNoteByOffset(6)}${octave}`
            ];

        case 'aug':
            // Augmented: root, major 3rd, augmented 5th (chromatic)
            return [
                `${rootNote}${octave}`,
                `${getNoteByOffset(4)}${octave}`,
                `${getNoteByOffset(8)}${octave}`
            ];

        case '7':
            // Dominant 7th: root, 3rd, 5th, flat 7th
            const third7 = getNoteInKey(key, (scalePosition + 2) % 7);
            const fifth7 = getNoteInKey(key, (scalePosition + 4) % 7);
            const seventh7 = getNoteByOffset(10); // Minor 7th (chromatic)
            return [
                `${rootNote}${octave}`,
                `${third7}${octave}`,
                `${fifth7}${octave}`,
                `${seventh7}${octave}`
            ];

        case 'maj/min7':
            // Diatonic 7th: root, 3rd, 5th, 7th scale degrees
            const third7maj = getNoteInKey(key, (scalePosition + 2) % 7);
            const fifth7maj = getNoteInKey(key, (scalePosition + 4) % 7);
            const seventh7maj = getNoteInKey(key, (scalePosition + 6) % 7);
            return [
                `${rootNote}${octave}`,
                `${third7maj}${octave}`,
                `${fifth7maj}${octave}`,
                `${seventh7maj}${octave}`
            ];

        case 'maj/min9':
            // Diatonic 9th: root, 3rd, 5th, 7th, 9th scale degrees
            const third9 = getNoteInKey(key, (scalePosition + 2) % 7);
            const fifth9 = getNoteInKey(key, (scalePosition + 4) % 7);
            const seventh9 = getNoteInKey(key, (scalePosition + 6) % 7);
            const ninth = getNoteInKey(key, (scalePosition + 1) % 7);
            return [
                `${rootNote}${octave}`,
                `${third9}${octave}`,
                `${fifth9}${octave}`,
                `${seventh9}${octave}`,
                `${ninth}${octave + 1}`
            ];

        case 'sus2/maj6':
            // Sus2: root, 2nd (instead of 3rd), 5th scale degrees
            const second = getNoteInKey(key, (scalePosition + 1) % 7);
            const fifth_sus2 = getNoteInKey(key, (scalePosition + 4) % 7);
            return [
                `${rootNote}${octave}`,
                `${second}${octave}`,
                `${fifth_sus2}${octave}`
            ];

        case 'sus4':
            // Sus4: root, 4th (instead of 3rd), 5th scale degrees
            const fourth = getNoteInKey(key, (scalePosition + 3) % 7);
            const fifth_sus4 = getNoteInKey(key, (scalePosition + 4) % 7);
            return [
                `${rootNote}${octave}`,
                `${fourth}${octave}`,
                `${fifth_sus4}${octave}`
            ];

        default:
            // Just return the root note
            return [`${rootNote}${octave}`];
    }
}

/**
 * Apply inversion to a chord
 * 0 = root position, 1 = first inversion, 2 = second inversion, etc.
 */
export function applyInversion(notes: string[], inversion: number): string[] {
    if (inversion === 0 || notes.length === 0) {
        return notes;
    }

    const result = [...notes];
    const inversions = inversion % notes.length;

    for (let i = 0; i < inversions; i++) {
        // Move the lowest note up an octave
        const bottomNote = result.shift()!;
        const noteName = bottomNote.replace(/\d+$/, '');
        const noteOctave = parseInt(bottomNote.match(/\d+$/)?.[0] || '4');
        result.push(`${noteName}${noteOctave + 1}`);
    }

    return result;
}
