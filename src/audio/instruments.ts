import * as Tone from 'tone';
import SAMPLES from './samples.json';
import { Adsr, InstrumentId, SAMPLE_ENVELOPES, SYNTH_ENVELOPES } from '../sound';
import type { VoiceSettings, Vowel } from '../parts';
import { VoiceInstrument } from './voice';

export type { InstrumentId } from '../sound';

/**
 * `sustains`: the note holds while the key is down (used for level matching; plucked/struck sounds decay).
 * `sampled`: played from recorded samples (bundled in `samples/`), with the synth as a stand-in until they load.
 */
export const INSTRUMENTS: { id: InstrumentId; label: string; sustains: boolean; sampled: boolean }[] = [
    { id: 'piano', label: 'Piano', sustains: false, sampled: true },
    { id: 'epiano', label: 'E-Piano', sustains: false, sampled: true },
    { id: 'pad', label: 'Pad', sustains: true, sampled: false },
    { id: 'warmpad', label: 'Warm Pad', sustains: true, sampled: false },
    { id: 'strings', label: 'Strings', sustains: true, sampled: true },
    { id: 'organ', label: 'Organ', sustains: true, sampled: true },
    { id: 'drawbar', label: 'Drawbar', sustains: true, sampled: false },
    { id: 'brass', label: 'Brass', sustains: true, sampled: true },
    { id: 'lead', label: 'Lead', sustains: true, sampled: false },
    { id: 'bass', label: 'Bass', sustains: true, sampled: false },
    { id: 'chip', label: 'Chiptune', sustains: true, sampled: false },
    { id: 'pluck', label: 'Pluck', sustains: false, sampled: false },
    { id: 'mallets', label: 'Marimba', sustains: false, sampled: true },
    { id: 'bells', label: 'Celesta', sustains: false, sampled: true },
];

export type SampledId = keyof typeof SAMPLES;
export const isSampled = (id: InstrumentId): id is SampledId & InstrumentId => id in SAMPLES;

/** Output level per synth preset in dB, matched with `npm run levels`. */
const VOLUMES: { [id in InstrumentId]: number } = {
    piano: 3.5, pad: -6, epiano: 3.5, organ: 3.5, pluck: -7, lead: -14,
    strings: -8, warmpad: 11, brass: -10, drawbar: -6, bells: 0, mallets: 0, chip: -12, bass: -4,
    // the singers have their own level (voice.ts VOICE_VOLUME)
    voice: 0,
};

/** Output level per sample set in dB, matched with `npm run levels`. */
const SAMPLE_VOLUMES: { [id in SampledId]: number } = {
    piano: -4, epiano: -5.5, strings: 8.5, organ: -4.5, brass: -1.5, mallets: -4.5, bells: -6,
};

/** The synth that stands in for a sampled instrument until its samples are decoded (or if they fail to load). */
const STAND_IN: { [id in SampledId]: InstrumentId } = {
    piano: 'epiano', epiano: 'epiano', strings: 'strings', organ: 'organ', brass: 'brass', mallets: 'mallets', bells: 'bells',
};


/** Slide a single note in from another pitch. */
export interface Glide {
    from: number;
    /** Seconds. */
    time: number;
}

/** Something that plays MIDI notes at audio-clock times. Synths and samplers both implement it. */
export interface Voice {
    attack(midi: number[], time: number, velocity: number, glide?: Glide): void;
    release(midi: number[], time: number): void;
    releaseAll(time: number): void;
    /** The part's envelope changes: any of attack, decay, sustain, release; the rest stays the instrument's own. */
    shape(over: Partial<Adsr>): void;
    /** Singers only (voice.ts): how they sing. */
    sing?(settings: VoiceSettings): void;
    /** Singers only: move to `vowel`, arriving `glide` seconds after `time`. */
    vowel?(vowel: Vowel, time: number, glide?: number): void;
}

export interface Instrument extends Voice {
    /** Last node of the instrument's own signal path; connect this to the effects bus. */
    output: Tone.ToneAudioNode;
    /** Resolves once the instrument plays its real sound: at once for synths, when the samples are decoded for samplers. */
    ready: Promise<void>;
    dispose(): void;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---- synths: a pool of monophonic voices ----------------------------------------------------

/** What the pool needs from a monophonic Tone synth (Synth, FMSynth, AMSynth, MonoSynth). */
interface Mono {
    frequency: Tone.Signal<'frequency'>;
    envelope: { attack: Tone.Unit.Time; decay: Tone.Unit.Time; sustain: number; release: Tone.Unit.Time };
    triggerAttack(note: number, time: number, velocity: number): unknown;
    triggerRelease(time: number): unknown;
    connect(node: Tone.InputNode): unknown;
    dispose(): unknown;
}
type MonoCtor = new (options?: object) => Mono;

interface Slot {
    synth: Mono;
    midi: number;
    start: number;
    released: boolean;
    /** Audio time from which the voice is silent and free again. */
    freeAt: number;
}

/**
 * Like Tone.PolySynth, but voices are handed out by audio time (so notes scheduled ahead never
 * take a voice that is still sounding then), and a note can glide in from another pitch.
 */
export class SynthPool implements Voice {
    readonly output: Tone.Volume;
    private slots: Slot[] = [];
    /** The envelope as currently shaped (starts as the preset's). */
    private env: Adsr;
    private readonly preset: Adsr;

    constructor(private readonly ctor: MonoCtor, private readonly options: { envelope: Adsr } & object, volume: number, private readonly max = 24) {
        this.output = new Tone.Volume(volume);
        this.preset = { ...options.envelope };
        this.env = { ...this.preset };
    }

    shape(over: Partial<Adsr>) {
        this.env = { ...this.preset, ...over };
        this.slots.forEach(s => this.applyEnv(s.synth));
    }

    private applyEnv(synth: Mono) {
        synth.envelope.attack = this.env.attack;
        synth.envelope.decay = Math.max(0.001, this.env.decay);
        synth.envelope.sustain = this.env.sustain;
        synth.envelope.release = this.env.release;
    }

    private grab(time: number): Slot {
        const free = this.slots.find(s => s.freeAt <= time);
        if (free) return free;
        if (this.slots.length < this.max) {
            const synth = new this.ctor(this.options);
            this.applyEnv(synth);
            synth.connect(this.output);
            const slot: Slot = { synth, midi: -1, start: 0, released: true, freeAt: 0 };
            this.slots.push(slot);
            return slot;
        }
        // all busy: steal the one that frees up first (a released note if there is one), else the oldest
        return [...this.slots].sort((a, b) => (a.released === b.released ? a.freeAt - b.freeAt || a.start - b.start : a.released ? -1 : 1))[0];
    }

    attack(midi: number[], time: number, velocity: number, glide?: Glide) {
        for (const m of midi) {
            const slot = this.grab(time);
            const to = mtof(m);
            slot.synth.triggerAttack(glide ? mtof(glide.from) : to, time, velocity);
            if (glide && glide.time > 0) slot.synth.frequency.exponentialRampToValueAtTime(to, time + glide.time);
            Object.assign(slot, { midi: m, start: time, released: false, freeAt: Infinity });
        }
    }

    release(midi: number[], time: number) {
        for (const m of midi) {
            const slot = this.slots.filter(s => s.midi === m && !s.released).sort((a, b) => a.start - b.start)[0];
            if (!slot) continue;
            slot.synth.triggerRelease(Math.max(time, slot.start));
            slot.released = true;
            slot.freeAt = Math.max(time, slot.start) + this.env.release * 1.2 + 0.05;
        }
    }

    releaseAll(time: number) {
        this.release(this.slots.filter(s => !s.released).map(s => s.midi), time);
    }

    dispose() {
        this.slots.forEach(s => s.synth.dispose());
        this.output.dispose();
    }
}

/** A synth preset: its voice pool and whatever filters or effects it runs through. */
interface Built {
    pool: SynthPool;
    output: Tone.ToneAudioNode;
    nodes: Tone.ToneAudioNode[];
}

const pool = (ctor: unknown, options: object, id: InstrumentId) =>
    new SynthPool(ctor as MonoCtor, options as { envelope: Adsr }, VOLUMES[id]);

/** The synth presets. `volume` leaves headroom for chords: velocity is additionally scaled by 1/sqrt(voices) at trigger time. */
function buildSynth(id: InstrumentId): Built {
    const only = (p: SynthPool): Built => ({ pool: p, output: p.output, nodes: [] });
    const through = (p: SynthPool, ...chain: Tone.ToneAudioNode[]): Built => {
        p.output.chain(...chain);
        return { pool: p, output: chain[chain.length - 1], nodes: chain };
    };
    switch (id) {
        case 'pad':
            return through(pool(Tone.Synth, {
                oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
                envelope: SYNTH_ENVELOPES.pad,
            }, id), new Tone.Filter(2200, 'lowpass'));
        case 'piano':
        case 'epiano':
            return only(pool(Tone.FMSynth, {
                harmonicity: 3,
                modulationIndex: 10,
                oscillator: { type: 'sine' },
                envelope: SYNTH_ENVELOPES.piano,
                modulation: { type: 'sine' },
                modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.5 },
            }, id));
        case 'organ': {
            const chorus = new Tone.Chorus(4, 2.5, 0.3).start();
            chorus.wet.value = 0.35;
            return through(pool(Tone.AMSynth, {
                harmonicity: 2,
                oscillator: { type: 'sine' },
                modulation: { type: 'square' },
                envelope: SYNTH_ENVELOPES.organ,
            }, id), chorus);
        }
        case 'pluck':
            return through(pool(Tone.Synth, {
                oscillator: { type: 'triangle' },
                envelope: SYNTH_ENVELOPES.pluck,
            }, id), new Tone.Filter(3500, 'lowpass'));
        case 'strings':
            // Detuned saws with a slow bow-like attack, darkened and given a gentle vibrato
            return through(pool(Tone.Synth, {
                oscillator: { type: 'fatsawtooth', count: 5, spread: 30 },
                envelope: SYNTH_ENVELOPES.strings,
            }, id), new Tone.Filter(1800, 'lowpass'), new Tone.Vibrato(5, 0.06));
        case 'warmpad':
            return through(pool(Tone.AMSynth, {
                harmonicity: 1.5,
                oscillator: { type: 'fattriangle', count: 3, spread: 15 },
                modulation: { type: 'sine' },
                envelope: SYNTH_ENVELOPES.warmpad,
                modulationEnvelope: { attack: 0.8, decay: 0.2, sustain: 1, release: 2 },
            }, id), new Tone.Filter(1400, 'lowpass'));
        case 'brass':
            // The filter opens on the attack and settles back, like a brass swell
            return only(pool(Tone.MonoSynth, {
                oscillator: { type: 'sawtooth' },
                filter: { Q: 1, type: 'lowpass', rolloff: -24 },
                envelope: SYNTH_ENVELOPES.brass,
                filterEnvelope: { attack: 0.08, decay: 0.4, sustain: 0.55, release: 0.3, baseFrequency: 300, octaves: 2.6 },
            }, id));
        case 'drawbar': {
            // Additive "drawbar" mix of harmonics with a rotary-speaker style wobble
            const chorus = new Tone.Chorus(6.5, 1.5, 0.25).start();
            chorus.wet.value = 0.4;
            return through(pool(Tone.Synth, {
                oscillator: { type: 'custom', partials: [1, 0.85, 0.6, 0, 0.45, 0, 0.3, 0.25] },
                envelope: SYNTH_ENVELOPES.drawbar,
            }, id), new Tone.Tremolo(6.5, 0.25).start(), chorus);
        }
        case 'bells':
            // Inharmonic FM ratio gives a bell/glockenspiel ring
            return only(pool(Tone.FMSynth, {
                harmonicity: 3.01,
                modulationIndex: 14,
                oscillator: { type: 'sine' },
                envelope: SYNTH_ENVELOPES.bells,
                modulation: { type: 'sine' },
                modulationEnvelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1 },
            }, id));
        case 'mallets':
            // Short woody strike: the modulation dies fast, leaving a soft sine
            return through(pool(Tone.FMSynth, {
                harmonicity: 4,
                modulationIndex: 3,
                oscillator: { type: 'sine' },
                envelope: SYNTH_ENVELOPES.mallets,
                modulation: { type: 'sine' },
                modulationEnvelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
            }, id), new Tone.Filter(4000, 'lowpass'));
        case 'chip':
            // 25% pulse wave, like an 8-bit console. A 25% pulse carries a DC offset; the high-pass removes it so it can't stack up in the effects
            return through(pool(Tone.Synth, {
                oscillator: { type: 'pulse', width: 0.25 },
                envelope: SYNTH_ENVELOPES.chip,
            }, id), new Tone.Filter(40, 'highpass'), new Tone.Filter(6000, 'lowpass'));
        case 'bass':
            // a round saw bass: the filter opens on each note and settles low, so lines stay punchy but warm
            return through(pool(Tone.MonoSynth, {
                oscillator: { type: 'fatsawtooth', count: 2, spread: 12 },
                envelope: SYNTH_ENVELOPES.bass,
                filter: { Q: 1, rolloff: -24 },
                filterEnvelope: { attack: 0.004, decay: 0.2, sustain: 0.35, release: 0.2, baseFrequency: 260, octaves: 2.6 },
            }, id), new Tone.Filter(30, 'highpass'));
        case 'lead':
        default:
            return only(pool(Tone.MonoSynth, {
                oscillator: { type: 'square' },
                filter: { Q: 2 },
                envelope: SYNTH_ENVELOPES.lead,
                filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, baseFrequency: 200, octaves: 3 },
            }, 'lead'));
    }
}

class SynthInstrument implements Instrument {
    readonly ready = Promise.resolve();
    private built: Built;
    constructor(id: InstrumentId) {
        this.built = buildSynth(id);
    }
    get output() { return this.built.output; }
    attack(midi: number[], time: number, velocity: number, glide?: Glide) { this.built.pool.attack(midi, time, velocity, glide); }
    release(midi: number[], time: number) { this.built.pool.release(midi, time); }
    releaseAll(time: number) { this.built.pool.releaseAll(time); }
    shape(over: Partial<Adsr>) { this.built.pool.shape(over); }
    dispose() {
        this.built.pool.dispose();
        this.built.nodes.forEach(n => n.dispose());
    }
}

// ---- samples ----------------------------------------------------------------------------

/** A decoded sample set: one recording every few semitones, each played back faster or slower for the notes between. */
export interface Bank {
    /** MIDI notes that have a recording. */
    notes: number[];
    buffers: Map<number, Tone.ToneAudioBuffer>;
    /** Loop points in seconds, for sustained instruments (baked crossfade loops). */
    loop: [number, number] | null;
}

let sampleBase = 'samples/';
/** Where the sample folders live (relative to the page by default, so it works under any subpath). */
export const setSampleBase = (url: string) => {
    sampleBase = url;
};

const banks = new Map<SampledId, Promise<Bank>>();
/** Banks already decoded, so an instrument created after loading plays samples from its very first note. */
const decoded = new Map<SampledId, Bank>();

/** Load (once) and decode an instrument's samples. */
export function loadBank(id: SampledId): Promise<Bank> {
    let bank = banks.get(id);
    if (!bank) {
        const set = SAMPLES[id];
        bank = Promise.all(set.notes.map(n => Tone.ToneAudioBuffer.fromUrl(`${sampleBase}${id}/${n}.mp3`)))
            .then(buffers => ({
                notes: set.notes,
                buffers: new Map(set.notes.map((n, i) => [n, buffers[i]])),
                loop: set.loop as [number, number] | null,
            }))
            .then(b => {
                decoded.set(id, b);
                return b;
            });
        // a failed load (offline before the first visit, say) can be retried next time
        bank.catch(() => banks.delete(id));
        banks.set(id, bank);
    }
    return bank;
}

/** The recording to play a note from: the nearest one, preferring the one below on a tie (it sounds less chipmunky sped up a little). */
export function nearestSample(notes: number[], midi: number): number {
    let best = notes[0];
    for (const n of notes) if (Math.abs(n - midi) < Math.abs(best - midi) || (Math.abs(n - midi) === Math.abs(best - midi) && n < best)) best = n;
    return best;
}

interface Playing {
    midi: number;
    start: number;
    source: Tone.ToneBufferSource;
    env: Tone.Gain;
    released: boolean;
}

/** Plays notes from a Bank: each note is a buffer source through its own gain envelope. */
export class SamplePlayer implements Voice {
    readonly output: Tone.Volume;
    private playing: Playing[] = [];
    private env: Adsr;

    constructor(private readonly bank: Bank, volume: number, private readonly preset: Adsr) {
        this.output = new Tone.Volume(volume);
        this.env = { ...preset };
    }

    shape(over: Partial<Adsr>) {
        this.env = { ...this.preset, ...over };
    }

    attack(midi: number[], time: number, velocity: number, glide?: Glide) {
        for (const m of midi) {
            const root = nearestSample(this.bank.notes, m);
            const rate = (n: number) => Math.pow(2, (n - root) / 12);
            const env = new Tone.Gain(0).connect(this.output);
            const loop = this.bank.loop;
            const source = new Tone.ToneBufferSource({
                url: this.bank.buffers.get(root)!,
                playbackRate: rate(glide ? glide.from : m),
                loop: !!loop,
                loopStart: loop ? loop[0] : 0,
                loopEnd: loop ? loop[1] : 0,
            }).connect(env);
            if (glide && glide.time > 0) {
                source.playbackRate.setValueAtTime(rate(glide.from), time);
                source.playbackRate.exponentialRampToValueAtTime(rate(m), time + glide.time);
            }
            const peakAt = time + Math.max(0.002, this.env.attack);
            env.gain.setValueAtTime(0, time);
            env.gain.linearRampToValueAtTime(velocity, peakAt);
            // a recording fades by itself; sustain below 1 also pulls it down to that level over the decay
            if (this.env.sustain < 1) env.gain.setTargetAtTime(velocity * this.env.sustain, peakAt, Math.max(0.005, this.env.decay) / 3);
            const note: Playing = { midi: m, start: time, source, env, released: false };
            source.onended = () => {
                this.playing = this.playing.filter(p => p !== note);
                // (an offline render runs every timeout before rendering, so there nothing may be disposed early)
                if (!env.context.isOffline) env.dispose();
            };
            // a looping source would otherwise start at the loop point
            source.start(time, 0);
            this.playing.push(note);
        }
    }

    release(midi: number[], time: number) {
        for (const m of midi) {
            const note = this.playing.filter(p => p.midi === m && !p.released).sort((a, b) => a.start - b.start)[0];
            if (!note) continue;
            note.released = true;
            const at = Math.max(time, note.start + 0.002);
            const release = Math.max(0.02, this.env.release);
            // fade from wherever the envelope is (even mid-attack), then stop once it's inaudible
            note.env.gain.cancelAndHoldAtTime(at);
            note.env.gain.setTargetAtTime(0, at, release / 5);
            try {
                note.source.stop(at + release * 1.4 + 0.02);
            } catch {
                // already ended on its own
            }
        }
    }

    releaseAll(time: number) {
        this.release(this.playing.filter(p => !p.released).map(p => p.midi), time);
    }

    dispose() {
        this.playing.forEach(p => {
            p.source.dispose();
            p.env.dispose();
        });
        this.playing = [];
        this.output.dispose();
    }
}

/** A sampled instrument: plays its stand-in synth until the samples are decoded, then the samples. */
class SampledInstrument implements Instrument {
    readonly output = new Tone.Gain(1);
    readonly ready: Promise<void>;
    private standIn: SynthInstrument;
    private player: SamplePlayer | null = null;
    private disposed = false;
    private shaped: Partial<Adsr> = {};

    constructor(id: SampledId) {
        this.standIn = new SynthInstrument(STAND_IN[id]);
        this.standIn.output.connect(this.output);
        const use = (bank: Bank) => {
            if (this.disposed || this.player) return;
            this.player = new SamplePlayer(bank, SAMPLE_VOLUMES[id], SAMPLE_ENVELOPES[id]);
            this.player.shape(this.shaped);
            this.player.output.connect(this.output);
        };
        const ready = decoded.get(id);
        if (ready) use(ready);
        this.ready = loadBank(id).then(
            use,
            // no samples (offline before they were ever cached): the stand-in keeps playing
            () => undefined,
        );
    }

    get loaded() { return this.player !== null; }

    attack(midi: number[], time: number, velocity: number, glide?: Glide) {
        (this.player ?? this.standIn).attack(midi, time, velocity, glide);
    }
    release(midi: number[], time: number) {
        // a note may have started on the stand-in just before the samples arrived
        this.player?.release(midi, time);
        this.standIn.release(midi, time);
    }
    releaseAll(time: number) {
        this.player?.releaseAll(time);
        this.standIn.releaseAll(time);
    }
    shape(over: Partial<Adsr>) {
        this.shaped = { ...over };
        this.player?.shape(over);
        this.standIn.shape(over);
    }
    dispose() {
        this.disposed = true;
        this.player?.dispose();
        this.standIn.dispose();
        this.output.dispose();
    }
}

/** Builds an instrument. Sampled ones start loading their samples straight away. */
export function createInstrument(id: InstrumentId): Instrument {
    if (id === 'voice') return new VoiceInstrument();
    return isSampled(id) ? new SampledInstrument(id) : new SynthInstrument(id);
}

/** The bare synth preset of an instrument (also the stand-in of a sampled one), for the level check. */
export const createSynth = (id: InstrumentId): Instrument =>
    id === 'voice' ? new VoiceInstrument() : new SynthInstrument(isSampled(id) ? STAND_IN[id] : id);
