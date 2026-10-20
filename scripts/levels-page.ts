// Runs in the browser: renders each instrument offline and reports peak / RMS.
import * as Tone from 'tone';
import { INSTRUMENTS, createInstrument } from '../src/audio/instruments';
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

async function dry(id: string, midi: number[]) {
    const buffer = await Tone.Offline(() => {
        const inst = createInstrument(id as any);
        const master = new Tone.Gain(MASTER_GAIN).toDestination();
        inst.output.connect(master);
        inst.synth.triggerAttackRelease(
            midi.map(m => Tone.Frequency(m, 'midi').toFrequency()), 1.2, 0, 1 / Math.sqrt(midi.length));
    }, 1.5);
    return measure(buffer);
}

/** The full engine (limiter included) with every effect at max, chords retriggered every half second. */
async function withFx(id: string) {
    const buffer = await Tone.Offline(async () => {
        const engine = new Engine();
        engine.setInstrument(id as any);
        engine.fx.set('reverb', { enabled: true, wet: 1, decay: 3 });
        engine.fx.set('delay', { enabled: true, wet: 1, feedback: 0.9 });
        engine.fx.set('chorus', { enabled: true, wet: 1 });
        engine.fx.set('distortion', { enabled: true, amount: 1 });
        await engine.ready();
        FX_CHORDS.forEach((chord, i) => engine.playChord(chord, { duration: 0.6, time: i * 0.5 }));
    }, 4);
    return measure(buffer);
}

(window as any).runLevels = async () => {
    const rows: any[] = [];
    for (const { id } of INSTRUMENTS) {
        rows.push({ id, triad: await dry(id, TRIAD), ninth: await dry(id, NINTH), fx: await withFx(id) });
    }
    return rows;
};
