import * as Tone from 'tone';
import type { DrumVoice } from '../drums';

/**
 * A synthesised 808/909-style kit: no samples to load. Every voice is a small Tone.js synth into
 * the kit's own output, so a drum track has one volume like any other track.
 */
export class DrumKit {
    /** A little under unity so a kick, snare and hat landing together stay clear of the limiter. */
    readonly output = new Tone.Gain(0.8);
    private nodes: Tone.ToneAudioNode[] = [];

    private kick = this.add(new Tone.MembraneSynth({
        pitchDecay: 0.045,
        octaves: 5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 },
        volume: -4,
    }));

    // snare: a pitched body plus a burst of noise
    private snareBody = this.add(new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
        volume: -10.5,
    }));
    private snareNoise = this.add(new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.17, sustain: 0, release: 0.03 },
        volume: -11.5,
    }), new Tone.Filter(1400, 'highpass'));

    private clap = this.add(new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.05 },
        volume: 3,
    }), new Tone.Filter({ frequency: 1300, type: 'bandpass', Q: 1.2 }));

    private hat = this.add(new Tone.MetalSynth({
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 5200,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.045, release: 0.02 },
        volume: -22,
    }), new Tone.Filter(7000, 'highpass'));

    private openhat = this.add(new Tone.MetalSynth({
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 5200,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.32, release: 0.12 },
        volume: -23,
    }), new Tone.Filter(6500, 'highpass'));

    private tom = this.add(new Tone.MembraneSynth({
        pitchDecay: 0.035,
        octaves: 2.5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.08 },
        volume: -7,
    }));
    private tomHigh = this.add(new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 2.5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.08 },
        volume: -7,
    }));

    private rim = this.add(new Tone.MembraneSynth({
        pitchDecay: 0.006,
        octaves: 1.5,
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.045, sustain: 0, release: 0.02 },
        volume: -15,
    }), new Tone.Filter(900, 'highpass'));

    /** Wire a voice (through an optional filter) into the output and keep it for disposal. */
    private add<T extends Tone.ToneAudioNode>(voice: T, filter?: Tone.Filter): T {
        if (filter) {
            voice.connect(filter);
            filter.connect(this.output);
            this.nodes.push(voice, filter);
        } else {
            voice.connect(this.output);
            this.nodes.push(voice);
        }
        return voice;
    }

    /** Play `voice` at audio time `time`. */
    trigger(voice: DrumVoice, time: number, velocity = 1) {
        switch (voice) {
            case 'kick':
                this.kick.triggerAttackRelease('C1', 0.3, time, velocity);
                break;
            case 'snare':
                this.snareBody.triggerAttackRelease('G2', 0.1, time, velocity);
                this.snareNoise.triggerAttackRelease(0.15, time, velocity);
                break;
            case 'clap':
                // a clap is a few hands slightly apart: three short bursts, then the tail
                for (const [dt, v] of [[0, 0.7], [0.011, 0.7], [0.022, 1]] as const) {
                    this.clap.triggerAttackRelease(0.12, time + dt, velocity * v);
                }
                break;
            case 'hat':
                // a closed hat chokes the open one, as on a real hi-hat
                this.openhat.triggerRelease(time);
                this.hat.triggerAttackRelease(300, 0.04, time, velocity);
                break;
            case 'openhat':
                this.openhat.triggerAttackRelease(300, 0.3, time, velocity);
                break;
            case 'tomlo':
                this.tom.triggerAttackRelease('G1', 0.25, time, velocity);
                break;
            case 'tomhi':
                this.tomHigh.triggerAttackRelease('D2', 0.2, time, velocity);
                break;
            case 'rim':
                this.rim.triggerAttackRelease('A4', 0.04, time, velocity);
                break;
        }
    }

    dispose() {
        this.nodes.forEach(n => n.dispose());
        this.output.dispose();
    }
}
