import { DrumVoice, TICKS_PER_SIXTEENTH, expandPattern } from './drums';
import { Harmony, Part, PartKind, audibleParts, musicEnd, musicLoopEnd, outsideRests, partNotes, restSpans } from './parts';
import { ChainSlot, chainLayout, chainTicks, sectionView } from './sections';
import { FullSong, Section, Song, TimeSignature, ticksPerBar, ticksPerStep } from './song';

/** What the sequencer schedules: some notes or a drum hit, and the part that plays them. */
export type Scheduled =
    | { midi: number[]; gate?: number; strum?: number[]; legato: number; part: string; drum?: undefined }
    | { drum: DrumVoice; part: string };

/** An event at `tick` lasting `duration` ticks (the shape `SequencerPlayer` takes). */
export interface TimedEvent {
    tick: number;
    duration: number;
    data: Scheduled;
}

/** How much of each note's length it actually sounds, so repeated notes are struck rather than smeared. */
export const LEGATO: { [k in Exclude<PartKind, 'drums'>]: number } = { chords: 0.98, bass: 0.85, melody: 0.95 };

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
 * and held chords are cut at `length` (in a chain the next section takes over there).
 */
export function sectionEvents(view: Song, mutes: Section['mutes'], length: number, offset = 0, cut = true): TimedEvent[] {
    const h: Harmony = { chords: view.chords, key: view.key, scale: view.scale };
    const beatTicks = ticksPerStep(view.timeSignature);
    const total = view.steps * beatTicks;
    const kicks = kickTicks(view.parts, view.timeSignature, total);
    // Mute and solo only affect playback, so a muted part can still be played live from the pads
    return audibleParts(view.parts).filter(p => !mutes[p.id]).flatMap((p): TimedEvent[] => (p.kind === 'drums'
        // a drum pattern repeats from the top of the section until it ends
        ? expandPattern(p.drums, view.timeSignature, length)
            .filter(hit => outsideRests(restSpans(view.chords, p), hit.tick))
            .map(hit => ({ tick: hit.tick + offset, duration: TICKS_PER_SIXTEENTH, data: { drum: hit.voice, part: p.id } }))
        : partNotes(p, h, { beatTicks, kicks })
            .filter(n => n.start < length)
            .map(n => ({
                tick: n.start + offset,
                duration: cut ? Math.min(n.len, length - n.start) : n.len,
                data: { midi: n.midi, gate: n.gate, strum: n.strum, legato: LEGATO[p.kind], part: p.id },
            }))));
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
        return sectionEvents(view, slot.section.mutes, slot.len, slot.start);
    });
    return { events, length: chainTicks(layout) };
}
