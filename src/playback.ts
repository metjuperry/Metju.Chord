import { DrumVoice, TICKS_PER_SIXTEENTH, expandPattern } from './drums';
import { Harmony, Part, PartKind, Vowel, audibleParts, musicEnd, musicLoopEnd, outsideRests, partNotes, restSpans, vowelAt, vowelGlideSeconds } from './parts';
import { ChainSlot, chainLayout, chainTicks, sectionView, stripId } from './sections';
import { FullSong, Section, Song, TimeSignature, ticksPerBar, ticksPerStep } from './song';

/** What the sequencer schedules: some notes or a drum hit, and the engine strip that plays them (`stripId`). */
export type Scheduled =
    | { midi: number[]; gate?: number; strum?: number[]; velocity?: number; legato: number; part: string; drum?: undefined; vowel?: Vowel; glide?: number }
    | { drum: DrumVoice; part: string; midi?: undefined }
    /** A Voice part's singers move to another vowel, taking `glide` seconds. */
    | { vowel: Vowel; glide: number; part: string; midi?: undefined; drum?: undefined };

/** An event at `tick` lasting `duration` ticks (the shape `SequencerPlayer` takes). */
export interface TimedEvent {
    tick: number;
    duration: number;
    data: Scheduled;
}

/** How much of each note's length it actually sounds, so repeated notes are struck rather than smeared. */
export const LEGATO: { [k in Exclude<PartKind, 'drums'>]: number } = { chords: 0.98, bass: 0.85, melody: 0.95, voice: 0.97 };

/**
 * Every kick hit of the song's drum parts, in song ticks up to `end`, for a bass that follows the
 * kick. Muted drums still count: muting the drums shouldn't rewrite the bass line.
 */
export function kickTicks(parts: Part[], ts: TimeSignature, end: number): number[] {
    return parts.flatMap(p => (p.kind === 'drums' ? expandPattern(p.drums, ts, end).filter(h => h.voice === 'kick').map(h => h.tick) : []));
}

/**
 * What one section view plays from tick 0 to `length`, shifted by `offset`: every audible part not muted
 * in the section, each its own way. Drum patterns start from the top of the section; with `cut`, notes
 * and held chords are cut at `length` (in a chain the next section takes over there). Each part plays
 * through its engine strip in section `sec` (its own when the section changes how the part sounds).
 */
export function sectionEvents(view: Song, sec: Section, length: number, offset = 0, cut = true): TimedEvent[] {
    const mutes = sec.mutes;
    const h: Harmony = { chords: view.chords, key: view.key, scale: view.scale };
    const beatTicks = ticksPerStep(view.timeSignature);
    const total = view.steps * beatTicks;
    const kicks = kickTicks(view.parts, view.timeSignature, total);
    // Mute and solo only affect playback, so a muted part can still be played live from the pads
    return audibleParts(view.parts).filter(p => !mutes[p.id]).flatMap((p): TimedEvent[] => (p.kind === 'drums'
        // a drum pattern repeats from the top of the section until it ends
        ? expandPattern(p.drums, view.timeSignature, length)
            .filter(hit => outsideRests(restSpans(view.chords, p), hit.tick))
            .map(hit => ({ tick: hit.tick + offset, duration: TICKS_PER_SIXTEENTH, data: { drum: hit.voice, part: stripId(sec, p.id) } }))
        : [
            ...partNotes(p, h, { beatTicks, barTicks: ticksPerBar(view.timeSignature), kicks })
                .filter(n => n.start < length)
                .map((n): TimedEvent => ({
                    tick: n.start + offset,
                    duration: cut ? Math.min(n.len, length - n.start) : n.len,
                    data: {
                        midi: n.midi, gate: n.gate, strum: n.strum, velocity: n.velocity, legato: LEGATO[p.kind], part: stripId(sec, p.id),
                        // a voice's note starts on the vowel sung there (so playback started midway is right at once)
                        ...(p.kind === 'voice' ? { vowel: vowelAt(p, n.start), glide: 0.02 } : {}),
                    },
                })),
            ...(p.kind === 'voice' ? vowelEvents(p, length, offset, stripId(sec, p.id)) : []),
        ]));
}

/** A Voice part's vowel changes inside the section: where each stretch of the lane starts, and where it ends back on the part's own vowel. */
function vowelEvents(p: Extract<Part, { kind: 'voice' }>, length: number, offset: number, part: string): TimedEvent[] {
    const glide = vowelGlideSeconds(p.vowelGlide);
    const changes = new Map<number, Vowel>();
    for (const c of p.vowels) {
        if (c.start >= length) continue;
        changes.set(c.start, c.vowel);
        const end = c.start + c.len;
        if (end < length && !p.vowels.some(o => o.start === end)) changes.set(end, p.vowel);
    }
    return [...changes].sort((a, b) => a[0] - b[0]).map(([tick, vowel]) => ({ tick: tick + offset, duration: 1, data: { vowel, glide, part } }));
}

/** Where a section loops on its own (Loop mode): the end of its music rounded up to a bar, within its length. */
export const sectionLoopLength = (view: Song) =>
    Math.min(musicLoopEnd(view.chords, view.parts, ticksPerBar(view.timeSignature)), view.steps * ticksPerStep(view.timeSignature));

/** Where a section's music ends, for playing it once. */
export const sectionMusicEnd = (view: Song) => musicEnd(view.chords, view.parts, ticksPerBar(view.timeSignature));

/** The whole chain as one timeline: each slot's section from its start, for its full length. */
export function chainEvents(song: FullSong, layout: ChainSlot[] = chainLayout(song)): { events: TimedEvent[]; length: number } {
    const views = new Map<string, Song>();
    const events = layout.flatMap(slot => {
        let view = views.get(slot.section.id);
        if (!view) {
            view = sectionView(song, slot.section.id);
            views.set(slot.section.id, view);
        }
        return sectionEvents(view, slot.section, slot.len, slot.start);
    });
    return { events, length: chainTicks(layout) };
}
