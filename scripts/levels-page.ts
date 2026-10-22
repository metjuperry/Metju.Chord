// Runs in the browser: renders each instrument offline and reports peak / RMS.
import * as Tone from 'tone';
import { INSTRUMENTS, InstrumentId, createInstrument, createSynth, isSampled, loadBank, setSampleBase } from '../src/audio/instruments';
import { Engine } from '../src/audio/engine';

const MASTER_GAIN = 0.8;
const TRIAD = [60, 64, 67];
const NINTH = [60, 64, 67, 71, 74];
const FX_CHORDS = [[60, 64, 67, 71, 74], [57, 60, 64, 67, 71], [62, 65, 69, 72, 76], [67, 71, 74, 77, 81]];

const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

function measure(buffer: Tone.ToneAudioBuffer) {
    const data = buffer.getChannelData(0);
    const rate = buffer.sampleRate;
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    const from = Math.floor(0.1 * rate), to = Math.min(data.length, Math.floor(1.0 * rate));
    let sum = 0;
    for (let i = from; i < to; i++) sum += data[i] * data[i];
    return { peak: db(peak), rms: db(Math.sqrt(sum / (to - from))) };
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
        // every effect at its maximum: drive, chorus, full sends into a long reverb and a high-feedback delay
        engine.setTrack('t', { instrument: id, volume: 0, fx: { drive: 1, chorus: 1, reverb: 1, delay: 1 } });
        engine.selectTrack('t');
        engine.setSpace({ reverb: { size: 3, ret: 1 }, delay: { time: '8n', feedback: 0.9, ret: 1 }, out: { level: 1 } });
        await engine.ready();
        FX_CHORDS.forEach((chord, i) => engine.playChord(chord, { duration: 0.6, time: i * 0.5, track: 't' }));
    }, 4);
    return measure(buffer);
}

(window as any).runLevels = async (base: string) => {
    setSampleBase(base);
    const rows: any[] = [];
    for (const { id, sampled } of INSTRUMENTS) {
        if (sampled) await loadBank(id as any);
        rows.push({ id, triad: await dry(id, TRIAD, false), ninth: await dry(id, NINTH, false), fx: await withFx(id) });
        // a sampled instrument's stand-in synth plays until its samples load, so it is matched too
        if (isSampled(id)) rows.push({ id: `${id}~synth`, standIn: true, triad: await dry(id, TRIAD, true), ninth: await dry(id, NINTH, true), fx: { peak: -99, rms: -99 } });
    }
    return rows;
};
