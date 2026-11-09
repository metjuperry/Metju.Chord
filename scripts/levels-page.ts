// Runs in the browser: renders each instrument offline and reports peak / RMS.
import * as Tone from 'tone';
import { INSTRUMENTS, InstrumentId, createInstrument, createSynth, isSampled, loadBank, setSampleBase } from '../src/audio/instruments';
import { Engine } from '../src/audio/engine';
import { fromKnob } from '../src/sound';
import type { DriveType } from '../src/sound';

const MASTER_GAIN = 0.8;
const TRIAD = [60, 64, 67];
const NINTH = [60, 64, 67, 71, 74];
const FX_CHORDS = [[60, 64, 67, 71, 74], [57, 60, 64, 67, 71], [62, 65, 69, 72, 76], [67, 71, 74, 77, 81]];

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

/** Peak over all channels, and RMS (0.1–1.0 s) of the louder channel. */
function measure(buffer: Tone.ToneAudioBuffer) {
    const rate = buffer.sampleRate;
    let peak = 0, rms = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        const from = Math.floor(0.1 * rate), to = Math.min(data.length, Math.floor(1.0 * rate));
        let sum = 0;
        for (let i = from; i < to; i++) sum += data[i] * data[i];
        rms = Math.max(rms, Math.sqrt(sum / (to - from)));
    }
    return { peak: db(peak), rms: db(rms) };
}

async function dry(id: InstrumentId, midi: number[], synth: boolean) {
    const buffer = await Tone.Offline(() => {
        const inst = synth ? createSynth(id) : createInstrument(id);
        const master = new Tone.Gain(MASTER_GAIN).toDestination();
        inst.output.connect(master);
        inst.attack(midi, 0, 1 / Math.sqrt(midi.length));
        inst.release(midi, 1.2);
    }, 1.5);
    return measure(buffer);
}

/** The full engine (limiter included) with every effect and send at max, chords retriggered every half second. */
async function withFx(id: InstrumentId) {
    const buffer = await Tone.Offline(async () => {
        const engine = new Engine();
        // every effect at its maximum: chorus, full sends into a long reverb and a high-feedback delay, hard-panned,
        // ...and the shape at its loudest: full crunch, a screaming resonant filter swept by the envelope and LFO, the longest release
        engine.setTrack('t', {
            instrument: id, volume: 0, fx: { chorus: 1, tremolo: 1, glide: 1, reverb: 1, delay: 1 }, tone: { pan: 1 },
            shape: { attack: 0.001, release: 8, cutoff: 1500, resonance: 1, envAmount: 1, lfoDepth: 1, lfoRate: '8n', driveType: 'crunch', drive: 1 },
        });
        engine.selectTrack('t');
        engine.setSpace({ reverb: { size: 3, ret: 1 }, delay: { time: '8n', feedback: 0.9, ret: 1 }, out: { level: 1 } });
        await engine.ready();
        FX_CHORDS.forEach((chord, i) => engine.playChord(chord, { duration: 0.6, time: i * 0.5, track: 't' }));
    }, 4);
    return measure(buffer);
}

/** Loudness (RMS) of a part through the engine with only its drive on: for fitting each drive type's makeup gain. */
async function driven(id: InstrumentId, driveType: DriveType, drive: number) {
    const buffer = await Tone.Offline(async () => {
        const engine = new Engine();
        engine.setTrack('t', { instrument: id, volume: 0, shape: { driveType, drive } });
        engine.setSpace({ reverb: { size: 1, ret: 0 }, delay: { time: '8n', feedback: 0, ret: 0 }, out: { level: 1 } });
        await engine.ready();
        engine.playChord(TRIAD, { duration: 1.2, time: 0, track: 't' });
    }, 1.5);
    return measure(buffer).rms;
}

(window as any).runDrive = async (base: string) => {
    setSampleBase(base);
    const out: { id: string; type: DriveType; a: number; rise: number }[] = [];
    for (const id of ['epiano', 'bass', 'lead', 'strings'] as InstrumentId[]) {
        if (isSampled(id)) await loadBank(id as any);
        const clean = await driven(id, 'warm', 0);
        for (const type of ['warm', 'crunch', 'bitcrush'] as DriveType[]) {
            for (const a of [0.25, 0.5, 1]) out.push({ id, type, a, rise: (await driven(id, type, a)) - clean });
        }
    }
    return out;
};

/** How a knob changes the sound at five positions: brightness (zero crossings per second), loudness and time to half level. */
(window as any).runAudible = async (base: string, inst: InstrumentId) => {
    setSampleBase(base);
    if (isSampled(inst)) await loadBank(inst as any);
    const knobs: [string, (p: number) => object][] = [
        ['attack', p => ({ attack: fromKnob('attack', p) })],
        ['release', p => ({ release: fromKnob('release', p) })],
        ['cutoff', p => ({ cutoff: fromKnob('cutoff', p) })],
        ['resonance', p => ({ cutoff: 800, resonance: p })],
        ['envAmount', p => ({ cutoff: 300, envAmount: p * 2 - 1 })],
        ['drive', p => ({ driveType: 'warm', drive: p })],
    ];
    const out: any[] = [];
    for (const [k, make] of knobs) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
            const buffer = await Tone.Offline(async () => {
                const engine = new Engine();
                engine.setTrack('t', { instrument: inst, volume: 0, shape: make(p) as any });
                engine.setSpace({ reverb: { size: 1, ret: 0 }, delay: { time: '8n', feedback: 0, ret: 0 }, out: { level: 1 } });
                await engine.ready();
                engine.playChord(TRIAD, { duration: 0.6, time: 0.05, track: 't' });
            }, 2);
            const d = buffer.getChannelData(0), rate = buffer.sampleRate;
            let zc = 0, peak = 0, half = -1, tail = 0, e = 0, de = 0;
            for (let i = 1; i < d.length; i++) {
                if ((d[i - 1] < 0) !== (d[i] < 0)) zc++;
                peak = Math.max(peak, Math.abs(d[i]));
                if (i < 0.65 * rate) { e += d[i] * d[i]; de += (d[i] - d[i - 1]) * (d[i] - d[i - 1]); }
            }
            // brightness: energy of the sample-to-sample difference vs the signal (rises ~6 dB per octave of content)
            zc = Math.round(10 * Math.log10(de / (e + 1e-12) + 1e-12));
            // crest factor: peak over RMS while playing (squashed by drive)
            const crest = (20 * Math.log10(peak / Math.sqrt(e / (0.65 * rate) + 1e-12))).toFixed(1);
            for (let i = 0; i < d.length; i++) if (half < 0 && Math.abs(d[i]) > peak / 2) half = i / rate;
            for (let i = Math.floor(0.7 * rate); i < d.length; i++) tail += d[i] * d[i];
            out.push({ k, p, crest, zcr: zc, rms: measure(buffer).rms.toFixed(1), half: (half * 1000).toFixed(0), tail: (10 * Math.log10(tail + 1e-12)).toFixed(0) });
        }
    }
    return out;
};

(window as any).runLevels = async (base: string) => {
    setSampleBase(base);
    const rows: any[] = [];
    // the Voice part's singers aren't in the instrument list, but are matched like the rest
    for (const { id, sampled } of [...INSTRUMENTS, { id: 'voice' as InstrumentId, sampled: false }]) {
        if (sampled) await loadBank(id as any);
        rows.push({ id, triad: await dry(id, TRIAD, false), ninth: await dry(id, NINTH, false), fx: await withFx(id) });
        // a sampled instrument's stand-in synth plays until its samples load, so it is matched too
        if (isSampled(id)) rows.push({ id: `${id}~synth`, standIn: true, triad: await dry(id, TRIAD, true), ninth: await dry(id, NINTH, true), fx: { peak: -99, rms: -99 } });
    }
    return rows;
};
