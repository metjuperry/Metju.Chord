import { DrumVoice, TICKS_PER_SIXTEENTH, expandPattern } from './drums';
import { Harmony, Part, PartKind, Vowel, audibleParts, musicEnd, musicLoopEnd, outsideRests, partNotes, restSpans, vowelAt, vowelGlideSeconds } from './parts';
import { ChainSlot, chainLayout, chainTicks, sectionView, stripId } from './sections';
import { FullSong, Section, Song, TimeSignature, ticksPerBar, ticksPerStep } from './song';
import type { MusicalKey, ScaleId } from './theory';

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

/** What a section's cached events were built from, besides the section itself. */
interface SectionCache {
    parts: Part[];
    key: MusicalKey;
    scale: ScaleId;
    bpm: number;
    ts: TimeSignature;
    /** Per `${length}:${cut}`. */
    events: Map<string, TimedEvent[]>;
}
const sectionCache = new WeakMap<Section, SectionCache>();
const byTick = (a: TimedEvent, b: TimedEvent) => a.tick - b.tick;

/**
 * What section `sec` of `song` plays from its start for `length` ticks (`sectionEvents`, no offset), in
 * tick order, cached on the section object: it's built again only when the section, the parts array,
 * the key, scale, tempo or time signature is another one. An edit keeps the objects it doesn't change
 * (`applySectionEdit`), so an edit in one section leaves every other section's events as they were.
 */
export function sectionEventsOf(song: FullSong, sec: Section, length: number, cut: boolean): TimedEvent[] {
    let c = sectionCache.get(sec);
    if (!c || c.parts !== song.parts || c.key !== song.key || c.scale !== song.scale || c.bpm !== song.bpm
        || c.ts.beats !== song.timeSignature.beats || c.ts.unit !== song.timeSignature.unit) {
        c = { parts: song.parts, key: song.key, scale: song.scale, bpm: song.bpm, ts: song.timeSignature, events: new Map() };
        sectionCache.set(sec, c);
    }
    const k = `${length}:${cut}`;
    let events = c.events.get(k);
    if (!events) {
        // a stable sort: events on the same tick keep the order sectionEvents gives them
        events = sectionEvents(sectionView(song, sec.id), sec, length, 0, cut).sort(byTick);
        c.events.set(k, events);
    }
    return events;
}

/** One chain slot's events for the sequencer: tick-sorted, in ticks from the slot's `start`. */
export interface TimedSlot {
    start: number;
    events: TimedEvent[];
}

/**
 * The whole chain as the sequencer plays it: one slot per chain slot, each its section's cached events
 * (`sectionEventsOf`, cut at the slot's end) from the slot's start. Nothing is copied, so building it
 * after an edit costs only the sections the edit changed.
 */
export function chainTimeline(song: FullSong, layout: ChainSlot[] = chainLayout(song)): { slots: TimedSlot[]; length: number } {
    return {
        slots: layout.map(slot => ({ start: slot.start, events: sectionEventsOf(song, slot.section, slot.len, true) })),
        length: chainTicks(layout),
    };
}

/** The whole chain as one list of events: each slot's section from its start, for its full length. */
export function chainEvents(song: FullSong, layout: ChainSlot[] = chainLayout(song)): { events: TimedEvent[]; length: number } {
    const { slots, length } = chainTimeline(song, layout);
    return { events: slots.flatMap(s => s.events.map(e => ({ ...e, tick: e.tick + s.start }))), length };
}
