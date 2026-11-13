import * as Tone from 'tone';
import { ArpPattern, arpOrder } from '../theory';
import { Instrument, InstrumentId, createInstrument } from './instruments';
import { DrumKit } from './drumkit';
import type { DrumVoice } from '../drums';
import { PartFx, PartTone, VoiceSettings, Vowel, glideSeconds, glides, neutralTone, noFx, shapePan } from '../parts';
import { PartShape, ShapeOverrides, driveCurve, driveMakeupDb, effectiveShape, filterEnvelope, lfoRange, resonanceQ } from '../sound';
import type { Space } from '../song';
import { SyncOut, defaultSync, pulseTime } from '../sync';

export type ArpRate = '4n' | '8n' | '8t' | '16n' | '16t' | '32n';

export interface ArpOptions {
    pattern: ArpPattern;
    rate: ArpRate;
    /** Gate length of each arp note, in seconds. */
    noteLength: number;
}

const velocityFor = (voices: number) => 1 / Math.sqrt(Math.max(1, voices));

/**
 * A part's channel: instrument -> filter -> drive -> makeup -> chorus -> tremolo -> stereo -> pan -> level -> master,
 * with the level also feeding two sends into the shared reverb and delay. Drum parts skip everything
 * between the input and the pan. Chorus and tremolo exist only while the part uses them (`useInsert`);
 * `stereo` makes the signal two channels either way (as they do), so the pan law doesn't change with them.
 */
interface Channel {
    input: Tone.Gain;
    /** The part's filter (sound.ts): its frequency follows the LFO, its detune the filter envelope. */
    filter?: Tone.Filter;
    lfo?: Tone.LFO;
    pan: Tone.Panner;
    /** In the chain only while the drive is above 0 (`wireInserts`). */
    drive?: Tone.WaveShaper;
    makeup?: Tone.Gain;
    /** Whether the drive is in the chain. */
    driving?: boolean;
    /**
     * Mono up to two channels, the way the stereo effects' own inputs do it, at `REST_GAIN`: the level
     * every part was matched at, with Tone's Tremolo always in the chain passing half (see `useInsert`).
     */
    stereo?: Tone.Gain;
    /** After the tremolo: ×2, so the tremolo plus the rest gain passes what it did before. */
    tremoloBoost?: Tone.Gain;
    /** A waveform tap after the level, made when the Parts scope first asks (`analyser`). */
    scope?: Tone.Analyser;
    chorus?: Tone.Chorus;
    tremolo?: Tone.Tremolo;
    /** An unused chorus or tremolo waiting to be taken out (`useInsert`). */
    idle?: { chorus?: ReturnType<typeof setTimeout>; tremolo?: ReturnType<typeof setTimeout> };
    level: Tone.Volume;
    sendReverb: Tone.Gain;
    sendDelay: Tone.Gain;
    nodes: Tone.ToneAudioNode[];
}

interface Strip extends Channel {
    instrument: InstrumentId;
    voice: Instrument;
    shaped: PartTone;
    /** The part's shape as last applied (its instrument's, with the part's changes on top). */
    shape: PartShape;
    over: ShapeOverrides;
    fx: PartFx;
    /** The last note this part was told to play, for glide: what it was and when it started. */
    last?: { midi: number; time: number };
}

/** A note glides from the previous one only if that one started this recently (a line, not a new phrase). */
const GLIDE_WINDOW = 2;
/** Tremolo speed: 1/8 notes of the tempo. */
const TREMOLO_RATE = '8n';
/**
 * A channel's gain where the tremolo goes. Tone's Tremolo maps its LFO to [1, 0] scaled by the depth,
 * so at depth 0 it passes a constant 0.5, and at depth d it swings 0.5 ± 0.5·d. Every part was
 * level-matched with one always in the chain, so a channel without it keeps that 0.5, and one with it
 * has ×2 after it.
 */
const REST_GAIN = 0.5;
/** How long a chorus or tremolo turned back to 0 stays in the channel before it's taken out (ms). */
const INSERT_IDLE_MS = 2000;



/** How long the reverb size must stay put before its impulse response is rendered again (ms). */
const REVERB_SETTLE_MS = 150;

/** Master gain at full output level. */
const MASTER_GAIN = 0.8;

const NO_FX: PartFx = noFx();

/**
 * How far past the audio clock live playing (pads, keys, auditions) is scheduled. Sequenced playback
 * uses Tone's times, which run `lookAhead` (0.1 s) ahead so the scheduler has slack; a pad played by
 * hand can't wait that long. A few ms keep an envelope that starts "now" from starting already late
 * (and clicking) when the audio thread renders the next block before the call reaches it.
 */
export const LIVE_LEAD = 0.005;
/** The audio time to play something live at: the audio clock plus `LIVE_LEAD`, not `Tone.now()`. */
export const liveTime = () => Tone.immediate() + LIVE_LEAD;

/**
 * Owns every audio node. Each part has its own channel (see Channel); the parts share one reverb
 * and one delay, which they send into, and everything ends in master -> limiter -> destination.
 */
export class Engine {
    readonly master = new Tone.Gain(MASTER_GAIN);
    readonly limiter = new Tone.Limiter(-1);
    readonly meter = new Tone.Meter();

    private reverbBus = new Tone.Gain(1);
    private reverb = new Tone.Reverb({ decay: 2.5, wet: 1 });
    private reverbReturn = new Tone.Gain(0.8);
    private delayBus = new Tone.Gain(1);
    private delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.35, wet: 1 });
    private delayReturn = new Tone.Gain(0.7);
    /** A reverb size waiting for a drag to settle (`settleReverb`), and when the size last changed (ms). */
    private reverbTimer: ReturnType<typeof setTimeout> | null = null;
    private reverbChanged = -Infinity;
    private space: Space = {
        reverb: { size: 2.5, ret: 0.8 },
        delay: { time: '8n', feedback: 0.35, ret: 0.7 },
        out: { level: 1 },
    };

    /** One strip per instrument part. */
    private strips = new Map<string, Strip>();
    /** One kit per drum part. */
    private kits = new Map<string, Channel & { kit: DrumKit }>();
    /** The part the pads and keyboard play through. */
    private current = 'main';
    private transportUsers = new Set<string>();

    /** Sync out (see sync.ts): when on, master -> mono sum -> right channel, pulses -> left channel. */
    private sync: SyncOut = defaultSync();
    private syncNodes: { sum: Tone.Gain; pulses: Tone.Gain; merge: Tone.Merge; buffer: AudioBuffer } | null = null;

    constructor() {
        this.master.chain(this.limiter, Tone.getDestination());
        this.limiter.connect(this.meter);
        this.reverbBus.chain(this.reverb, this.reverbReturn, this.master);
        this.delayBus.chain(this.delay, this.delayReturn, this.master);
    }

    // ---- sync out -----------------------------------------------------------

    /**
     * Turn sync out on or off, or change its offset and polarity. On: the whole mix, summed to
     * mono, goes out on the right channel only, and the left channel carries `syncPulse`s.
     */
    setSync(next: SyncOut) {
        const was = this.sync.on;
        if (this.syncNodes && next.length !== this.sync.length) this.syncNodes.buffer = this.pulseBuffer(next.length);
        this.sync = next;
        if (next.on === was) {
            this.syncNodes?.pulses.gain.setValueAtTime(next.invert ? -1 : 1, Tone.now());
            return;
        }
        const out = Tone.getDestination();
        if (next.on) {
            const nodes = this.syncNodes ?? this.buildSync();
            nodes.pulses.gain.setValueAtTime(next.invert ? -1 : 1, Tone.now());
            this.limiter.disconnect(out);
            this.limiter.connect(nodes.sum);
        } else if (this.syncNodes) {
            this.limiter.disconnect(this.syncNodes.sum);
            this.limiter.connect(out);
        }
    }

    get syncOn() {
        return this.sync.on;
    }

    private buildSync() {
        const ctx = Tone.getContext();
        // a mono sum: one channel, stereo input mixed down ((L + R) / 2)
        const sum = new Tone.Gain(1);
        const raw = sum.input as GainNode;
        raw.channelCount = 1;
        raw.channelCountMode = 'explicit';
        raw.channelInterpretation = 'speakers';
        const pulses = new Tone.Gain(1);
        const merge = new Tone.Merge();
        pulses.connect(merge, 0, 0);
        sum.connect(merge, 0, 1);
        merge.connect(Tone.getDestination());
        this.syncNodes = { sum, pulses, merge, buffer: this.pulseBuffer(this.sync.length) };
        return this.syncNodes;
    }

    /** One pulse: full scale for `ms` milliseconds. */
    private pulseBuffer(ms: number) {
        const ctx = Tone.getContext();
        const length = Math.max(1, Math.round((ms / 1000) * ctx.sampleRate));
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        buffer.getChannelData(0).fill(1);
        return buffer;
    }

    /** One sync pulse on the left channel at audio time `time` (shifted by the offset). Does nothing while sync is off. */
    syncPulse(time: number) {
        const nodes = this.syncNodes;
        if (!this.sync.on || !nodes) return;
        const ctx = Tone.getContext();
        const src = ctx.createBufferSource();
        src.buffer = nodes.buffer;
        src.connect(nodes.pulses.input as GainNode);
        src.onended = () => src.disconnect();
        src.start(pulseTime(time, this.sync.offset, ctx.currentTime));
    }

    /** Resolves once the reverb impulse response is rendered (at the size last asked for, even mid-drag). */
    ready(): Promise<void> {
        this.settleReverb(true);
        return this.reverb.ready;
    }

    /**
     * Apply the reverb size last asked for. Setting `Reverb.decay` renders a new impulse response
     * offline, too much to do on every pointer move of a drag, so a change right after another waits
     * until the size has stayed put for `REVERB_SETTLE_MS` (or `now`); a lone change applies at once.
     */
    private settleReverb(now = false) {
        if (this.reverbTimer !== null) {
            clearTimeout(this.reverbTimer);
            this.reverbTimer = null;
        }
        const size = this.space.reverb.size;
        const apply = () => {
            if (this.reverb.decay !== size) this.reverb.decay = size;
        };
        const recent = performance.now() - this.reverbChanged < REVERB_SETTLE_MS;
        if (now || !recent) apply();
        else this.reverbTimer = setTimeout(() => {
            this.reverbTimer = null;
            apply();
        }, REVERB_SETTLE_MS);
    }

    // ---- channels ------------------------------------------------------------

    /**
     * A channel's nodes, wired up: input -> [filter -> makeup -> stereo] -> pan -> level.
     * `inserts` adds the bracketed part (not for drums); the drive, chorus and tremolo go in when used.
     */
    private makeChannel(volume: number, inserts: boolean): Channel {
        const input = new Tone.Gain(1);
        const pan = new Tone.Panner(0);
        const level = new Tone.Volume(volume).connect(this.master);
        const sendReverb = new Tone.Gain(0).connect(this.reverbBus);
        const sendDelay = new Tone.Gain(0).connect(this.delayBus);
        pan.connect(level);
        level.connect(sendReverb);
        level.connect(sendDelay);
        if (!inserts) {
            input.connect(pan);
            return { input, pan, level, sendReverb, sendDelay, nodes: [input, pan, level, sendReverb, sendDelay] };
        }
        const filter = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -24, Q: 0.5 });
        // the LFO drives the cutoff; at depth 0 its range is just the cutoff
        const lfo = new Tone.LFO({ frequency: 2, min: 20000, max: 20000 }).start();
        lfo.connect(filter.frequency);
        const drive = new Tone.WaveShaper(x => x, 4096);
        const makeup = new Tone.Gain(1);
        const stereo = new Tone.Gain(REST_GAIN);
        stereo.channelCount = 2;
        stereo.channelCountMode = 'explicit';
        // the drive goes in once it's turned up (wireInserts); at 0 it would only copy the sound
        input.chain(filter, makeup, stereo, pan);
        return {
            input, filter, lfo, drive, makeup, stereo, pan, level, sendReverb, sendDelay, idle: {}, driving: false,
            nodes: [input, filter, lfo, drive, makeup, stereo, pan, level, sendReverb, sendDelay],
        };
    }

    /**
     * Put a channel's chorus or tremolo in when its amount first leaves 0 (it starts at 0, which passes
     * the sound through unchanged, and `applyFx` ramps it up), and take it out once it has been back at 0
     * for `INSERT_IDLE_MS`: an unused one would keep its LFOs and delay lines running for nothing.
     */
    private useInsert(ch: Channel, kind: 'chorus' | 'tremolo', amount: number) {
        if (!ch.makeup || !ch.idle) return;
        const waiting = ch.idle[kind];
        if (amount > 0) {
            if (waiting !== undefined) clearTimeout(waiting);
            ch.idle[kind] = undefined;
            if (ch[kind]) return;
            const node = kind === 'chorus'
                ? new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0 }).start()
                // a mono wobble (no stereo spread) that does nothing at depth 0
                : new Tone.Tremolo({ frequency: Tone.Time(TREMOLO_RATE).toFrequency(), depth: 0, spread: 0 }).start();
            if (kind === 'chorus') ch.chorus = node as Tone.Chorus;
            else {
                ch.tremolo = node as Tone.Tremolo;
                ch.tremoloBoost = new Tone.Gain(1 / REST_GAIN);
                ch.nodes.push(ch.tremoloBoost);
            }
            ch.nodes.push(node);
            this.wireInserts(ch);
        } else if (ch[kind] && waiting === undefined) {
            ch.idle[kind] = setTimeout(() => {
                const node = ch[kind];
                ch.idle![kind] = undefined;
                if (!node) return;
                const boost = kind === 'tremolo' ? ch.tremoloBoost : undefined;
                ch[kind] = undefined;
                if (boost) ch.tremoloBoost = undefined;
                ch.nodes = ch.nodes.filter(n => n !== node && n !== boost);
                this.wireInserts(ch);
                node.dispose();
                boost?.dispose();
            }, INSERT_IDLE_MS);
        }
    }

    /** filter -> drive -> makeup -> chorus -> tremolo (×2) -> stereo, with the drive only while it's on and whichever effects the channel has. */
    private wireInserts(ch: Channel, driving = ch.driving) {
        if (!ch.filter || !ch.drive || !ch.makeup || !ch.stereo) return;
        if (driving !== ch.driving) {
            ch.filter.disconnect();
            ch.drive.disconnect();
            if (driving) ch.filter.chain(ch.drive, ch.makeup);
            else ch.filter.connect(ch.makeup);
            ch.driving = driving;
        }
        const fx = [ch.chorus, ch.tremolo, ch.tremoloBoost].filter((n): n is Tone.Chorus | Tone.Tremolo | Tone.Gain => !!n);
        ch.makeup.disconnect();
        fx.forEach(n => n.disconnect());
        ch.makeup.chain(...fx, ch.stereo);
    }

    /** Set a strip's pan. */
    private applyTone(strip: Strip, t: PartTone) {
        strip.pan.pan.rampTo(shapePan(t.pan), 0.05);
        strip.shaped = { ...t };
    }

    /** Set a strip's shape (sound.ts): the voice's envelope, the filter and its LFO, and the drive. */
    private applyShape(strip: Strip, over: ShapeOverrides) {
        const prev = strip.shape;
        const s = effectiveShape(strip.instrument, over);
        // envelope: only what the part changes; the voice keeps its own preset for the rest
        const { attack, decay, sustain, release } = over;
        strip.voice.shape(Object.fromEntries(Object.entries({ attack, decay, sustain, release }).filter(([, v]) => v !== undefined)));
        if (strip.filter && strip.lfo) {
            strip.filter.type = s.filterType;
            strip.filter.Q.rampTo(resonanceQ(s.filterType, s.resonance), 0.03);
            const { min, max } = lfoRange(s);
            strip.lfo.min = min;
            strip.lfo.max = max;
            strip.lfo.frequency.rampTo(Tone.Time(s.lfoRate).toFrequency(), 0.03);
            if (s.envAmount === 0) strip.filter.detune.rampTo(0, 0.03);
        }
        if (strip.drive && strip.makeup && (!prev || prev.drive !== s.drive || prev.driveType !== s.driveType)) {
            strip.drive.curve = driveCurve(s.driveType, s.drive);
            this.wireInserts(strip, s.drive > 0);
            strip.drive.oversample = s.drive > 0 && s.driveType !== 'bitcrush' ? '4x' : 'none';
            strip.makeup.gain.rampTo(Tone.dbToGain(driveMakeupDb(s.driveType, s.drive)), 0.03);
        }
        strip.shape = s;
        strip.over = { ...over };
    }

    /**
     * Each note (or strum stroke) opens or closes the filter by the part's Env Amount: up to the full
     * amount over the attack, then down to amount × sustain over the decay (sound.ts filterEnvelope).
     */
    private filterEnv(strip: Strip, time: number) {
        const s = strip.shape;
        if (!strip.filter || s.envAmount === 0) return;
        const { peakCents, sustainCents } = filterEnvelope(s);
        const d = strip.filter.detune;
        const peakAt = time + Math.max(0.003, s.attack);
        d.cancelScheduledValues(time);
        d.setValueAtTime(0, time);
        d.linearRampToValueAtTime(peakCents, peakAt);
        d.setTargetAtTime(sustainCents, peakAt, Math.max(0.005, s.decay) / 3);
    }

    /** Set a channel's effects, smoothly. */
    private applyFx(ch: Channel, fx: PartFx) {
        this.useInsert(ch, 'chorus', fx.chorus);
        this.useInsert(ch, 'tremolo', fx.tremolo);
        ch.chorus?.wet.rampTo(fx.chorus, 0.05);
        ch.tremolo?.depth.rampTo(fx.tremolo, 0.05);
        ch.sendReverb.gain.rampTo(fx.reverb, 0.05);
        ch.sendDelay.gain.rampTo(fx.delay, 0.05);
    }

    private disposeChannel(ch: Channel, after = 600) {
        Object.values(ch.idle ?? {}).forEach(t => t !== undefined && clearTimeout(t));
        ch.idle = undefined;
        ch.level.volume.rampTo(-80, 0.05);
        setTimeout(() => ch.nodes.forEach(n => n.dispose()), after);
    }

    /** The shared reverb, delay and output level. */
    setSpace(space: Space) {
        const resize = space.reverb.size !== this.space.reverb.size;
        this.reverbReturn.gain.rampTo(space.reverb.ret, 0.05);
        this.delay.delayTime.rampTo(Tone.Time(space.delay.time).toSeconds(), 0.05);
        this.delay.feedback.rampTo(space.delay.feedback, 0.05);
        this.delayReturn.gain.rampTo(space.delay.ret, 0.05);
        // full level is the master gain the instruments were matched at, leaving headroom for the sends
        this.master.gain.rampTo(MASTER_GAIN * space.out.level, 0.05);
        this.space = JSON.parse(JSON.stringify(space));
        if (resize) {
            this.settleReverb();
            this.reverbChanged = performance.now();
        }
    }

    // ---- instruments -------------------------------------------------------

    /** Create or update a part's strip. Changing its instrument swaps the synth with a short fade. */
    setTrack(id: string, opts: { instrument: InstrumentId; volume: number; fx?: PartFx; tone?: PartTone; shape?: ShapeOverrides; voice?: VoiceSettings }) {
        let strip = this.strips.get(id);
        if (!strip) {
            const voice = createInstrument(opts.instrument);
            strip = {
                ...this.makeChannel(opts.volume, true), instrument: opts.instrument, voice,
                shaped: neutralTone(), shape: undefined as unknown as PartShape, over: {}, fx: NO_FX,
            };
            voice.output.connect(strip.input);
            this.strips.set(id, strip);
        } else {
            strip.level.volume.rampTo(opts.volume, 0.05);
            if (strip.instrument !== opts.instrument) {
                const previous = strip.voice;
                strip.voice = createInstrument(opts.instrument);
                strip.voice.output.connect(strip.input);
                strip.instrument = opts.instrument;
                this.fadeOut(previous, strip.input);
            }
        }
        strip.fx = { ...(opts.fx ?? NO_FX) };
        this.applyFx(strip, strip.fx);
        this.applyTone(strip, opts.tone ?? strip.shaped);
        // a new voice starts with its own envelope, so the part's changes always go on again
        this.applyShape(strip, opts.shape ?? strip.over);
        if (opts.voice) strip.voice.sing?.(opts.voice);
    }

    /** Fade a voice out over 50 ms (still through its channel) and dispose it, so swapping instruments mid-note doesn't click. */
    private fadeOut(voice: Instrument, into: Tone.ToneAudioNode, then?: () => void) {
        const fade = new Tone.Gain(1).connect(into);
        voice.output.disconnect();
        voice.output.connect(fade);
        voice.releaseAll(Tone.now());
        fade.gain.rampTo(0, 0.05);
        setTimeout(() => {
            voice.dispose();
            fade.dispose();
            then?.();
        }, 150);
    }

    /** Create or update a drum part's kit, level and sends. */
    setDrumTrack(id: string, opts: { volume: number; fx?: PartFx }) {
        let ch = this.kits.get(id);
        if (!ch) {
            const kit = new DrumKit();
            ch = { ...this.makeChannel(opts.volume, false), kit };
            kit.output.connect(ch.input);
            this.kits.set(id, ch);
        } else {
            ch.level.volume.rampTo(opts.volume, 0.05);
        }
        this.applyFx(ch, { ...(opts.fx ?? NO_FX), chorus: 0, tremolo: 0, glide: 0 });
    }

    /** A Voice part's singers move to `vowel` at `time`, taking `glide` seconds (the vowel lane). */
    setVowel(track: string, vowel: Vowel, time?: number, glide?: number) {
        this.strips.get(track)?.voice.vowel?.(vowel, time ?? Tone.now(), glide);
    }

    /** Every Voice part's singers back to their own vowel. */
    resetVowels() {
        this.strips.forEach(s => s.voice.restVowel?.());
    }

    /** Play one drum hit on a drum part at an audio-clock `time` (default: live, `liveTime`). */
    playDrum(track: string, voice: DrumVoice, time?: number, velocity = 1) {
        const ch = this.kits.get(track);
        if (!ch) return;
        try {
            ch.kit.trigger(voice, time ?? liveTime(), velocity);
        } catch {
            // two hits on one monophonic voice at the same instant: the second is dropped
        }
    }

    /** The waveform of a part's output (after its level), for the Parts scope; tapped on first ask, null for an unknown part. */
    analyser(id: string): Tone.Analyser | null {
        const ch = this.strips.get(id) ?? this.kits.get(id);
        if (!ch) return null;
        if (!ch.scope) {
            ch.scope = new Tone.Analyser('waveform', 1024);
            ch.level.connect(ch.scope);
            ch.nodes.push(ch.scope);
        }
        return ch.scope;
    }

    removeTrack(id: string) {
        const kit = this.kits.get(id);
        if (kit) {
            this.kits.delete(id);
            this.disposeChannel(kit);
            setTimeout(() => kit.kit.dispose(), 600);
        }
        const strip = this.strips.get(id);
        if (!strip) return;
        this.strips.delete(id);
        this.fadeOut(strip.voice, strip.input, () => this.disposeChannel(strip, 300));
    }

    /** The track the pads and keyboard play through. */
    selectTrack(id: string) {
        this.current = id;
    }

    /** Pads and keyboard play this instrument (on the selected track). Used by the level check too. */
    setInstrument(id: InstrumentId) {
        const strip = this.strips.get(this.current);
        this.setTrack(this.current, { instrument: id, volume: strip ? strip.level.volume.value : 0 });
    }

    private strip(track: string = this.current): Strip {
        if (!this.strips.has(track)) this.setTrack(track, { instrument: 'epiano', volume: 0 });
        return this.strips.get(track)!;
    }

    private voice(track: string = this.current): Instrument {
        return this.strip(track).voice;
    }

    /**
     * Start notes on a strip, gliding a single note in from the part's previous note when the part
     * has glide (never longer than `maxGlide`, so a short note still arrives).
     */
    private start(strip: Strip, midi: number[], time: number, velocity: number, maxGlide = Infinity) {
        const last = strip.last;
        const glide = glides(strip.fx, midi.length) && last && last.midi !== midi[0] && time - last.time < GLIDE_WINDOW && time >= last.time
            ? { from: last.midi, time: Math.min(glideSeconds(strip.fx.glide), maxGlide) }
            : undefined;
        this.filterEnv(strip, time);
        strip.voice.attack(midi, time, velocity, glide);
        if (midi.length === 1) strip.last = { midi: midi[0], time };
    }

    // ---- playing -----------------------------------------------------------

    /**
     * Play a chord for `duration` (seconds or Tone time) at an audio-clock `time` (default: live,
     * `liveTime`), on `track` (default: the selected one).
     */
    playChord(midi: number[], opts: { duration: Tone.Unit.Time; time?: number; track?: string; strum?: number[]; velocity?: number }) {
        const strip = this.strip(opts.track);
        const time = opts.time ?? liveTime();
        const seconds = Tone.Time(opts.duration).toSeconds();
        if (opts.strum) {
            // each note starts a little later; all of them stop together (the next stroke damps them)
            const velocity = velocityFor(midi.length) * (opts.velocity ?? 1);
            this.filterEnv(strip, time);
            midi.forEach((m, i) => strip.voice.attack([m], time + Math.min(opts.strum![i] ?? 0, 0.8 * seconds), velocity));
        } else {
            this.start(strip, midi, time, velocityFor(midi.length), 0.8 * seconds);
        }
        strip.voice.release(midi, time + seconds);
    }

    /**
     * Start a chord at `time` (default: live, `liveTime`) on `track` (default: the selected one); returns
     * how to release it (live too), on that same synth even if the selection changes.
     */
    attack(midi: number[], time?: number, track?: string, strum?: number[], strength = 1): () => void {
        const strip = this.strip(track);
        const voice = strip.voice;
        const at = time ?? liveTime();
        if (strum) {
            const velocity = velocityFor(midi.length) * strength;
            this.filterEnv(strip, at);
            midi.forEach((m, i) => voice.attack([m], at + (strum[i] ?? 0), velocity));
        } else {
            this.start(strip, midi, at, velocityFor(midi.length));
        }
        // a quick tap still lets the whole strum sound before it lets go
        const last = strum ? Math.max(0, ...strum) : 0;
        return () => voice.release(midi, Math.max(liveTime(), at + last + 0.01));
    }

    /**
     * The intro's "bwooong": the notes rolled upwards a few ms apart on a bell-ish FM voice, while a
     * low-pass opens wide and settles back, through its own long reverb. Everything is thrown away
     * once it has rung out.
     */
    playIntro(midi: number[]) {
        const reverb = new Tone.Reverb({ decay: 4.5, wet: 0.4 }).connect(this.master);
        const filter = new Tone.Filter({ type: 'lowpass', frequency: 500, Q: 2 }).connect(reverb);
        const synth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 2,
            modulationIndex: 5,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.006, decay: 2.8, sustain: 0.12, release: 2.4 },
            modulation: { type: 'triangle' },
            modulationEnvelope: { attack: 0.01, decay: 1.4, sustain: 0.1, release: 1.5 },
        } as Partial<Tone.FMSynthOptions>).connect(filter);
        synth.volume.value = 0;
        const at = Tone.now() + 0.05;
        filter.frequency.setValueAtTime(500, at);
        filter.frequency.exponentialRampToValueAtTime(6000, at + 0.4);
        filter.frequency.exponentialRampToValueAtTime(1400, at + 3);
        midi.forEach((m, i) =>
            synth.triggerAttackRelease(Tone.Frequency(m, 'midi').toFrequency(), 1.8, at + i * 0.045, i === 0 ? 0.9 : 0.6));
        setTimeout(() => {
            synth.dispose();
            filter.dispose();
            reverb.dispose();
        }, 8000);
    }

    releaseAll() {
        this.strips.forEach(s => s.voice.releaseAll(Tone.now()));
    }

    /** Resolves when every part's instrument plays its real sound (sampled ones have loaded). */
    instrumentsReady(): Promise<void> {
        return Promise.all([...this.strips.values()].map(s => s.voice.ready)).then(() => undefined);
    }

    // ---- transport ---------------------------------------------------------

    /** One shared bpm for the metronome, arpeggiator, sequencer and tempo-synced delay. */
    setBpm(bpm: number) {
        Tone.getTransport().bpm.value = bpm;
        // tremolo wobbles in 1/8 notes of the tempo
        const rate = Tone.Time(TREMOLO_RATE).toFrequency();
        this.strips.forEach(s => s.tremolo?.frequency.rampTo(rate, 0.05));
        // so is each part's filter LFO
        this.strips.forEach(s => s.lfo?.frequency.rampTo(Tone.Time(s.shape.lfoRate).toFrequency(), 0.05));
        // the delay is tempo-synced: re-read its note value at the new tempo
        this.delay.delayTime.rampTo(Tone.Time(this.space.delay.time).toSeconds(), 0.05);
    }

    /** The Transport runs while anyone holds it; the last one to let go stops it. */
    acquireTransport(owner: string) {
        this.transportUsers.add(owner);
        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
    }

    releaseTransport(owner: string) {
        this.transportUsers.delete(owner);
        if (this.transportUsers.size === 0) {
            Tone.getTransport().stop();
        }
    }

    /**
     * Where a new Loop/Sequence should start so it lands on the shared grid: 0 when the
     * Transport is idle, otherwise the next `subdivision` boundary past the scheduler's lookahead.
     * Call before acquireTransport.
     */
    quantizedStart(subdivision: Tone.Unit.Time): Tone.Unit.Time {
        const transport = Tone.getTransport();
        if (transport.state !== 'started') return 0;
        const grid = Tone.Time(subdivision).toTicks();
        const margin = Tone.Time(Tone.getContext().lookAhead + 0.02).toTicks();
        return `${Math.ceil((transport.ticks + margin) / grid) * grid}i`;
    }

    /** Arpeggiate while held. Returns the function that stops it. */
    startArp(midi: number[], opts: ArpOptions): () => void {
        const strip = this.strip();
        const voice = strip.voice;
        const owner = `arp:${Math.random().toString(36).slice(2)}`;
        let cycle = arpOrder(midi, opts.pattern);
        let step = 0;
        const velocity = velocityFor(1);

        const loop = new Tone.Loop(time => {
            if (step >= cycle.length) {
                cycle = arpOrder(midi, opts.pattern); // reshuffles for 'random'
                step = 0;
            }
            const note = [cycle[step++]];
            this.start(strip, note, time, velocity, 0.8 * opts.noteLength);
            voice.release(note, time + opts.noteLength);
        }, opts.rate);

        const startAt = this.quantizedStart(opts.rate);
        this.acquireTransport(owner);
        loop.start(startAt);

        return () => {
            loop.stop();
            loop.dispose();
            this.releaseTransport(owner);
        };
    }

    /** Schedule an arpeggio at an exact audio time, filling `seconds` (used by sequencer steps). */
    scheduleArp(midi: number[], opts: ArpOptions, time: number, seconds: number, track?: string) {
        const strip = this.strip(track);
        const voice = strip.voice;
        const stepSeconds = Tone.Time(opts.rate).toSeconds();
        const steps = Math.max(1, Math.floor((seconds + 1e-6) / stepSeconds));
        let cycle = arpOrder(midi, opts.pattern);
        for (let i = 0, k = 0; i < steps; i++, k++) {
            if (k >= cycle.length) {
                cycle = arpOrder(midi, opts.pattern);
                k = 0;
            }
            const at = time + i * stepSeconds;
            const gate = Math.min(opts.noteLength, stepSeconds);
            this.start(strip, [cycle[k]], at, velocityFor(1), 0.8 * gate);
            voice.release([cycle[k]], at + gate);
        }
    }
}

let instance: Engine | null = null;

/** The shared engine, built on first use so importing this module creates no audio nodes. */
export function getEngine(): Engine {
    return instance ?? (instance = new Engine());
}
