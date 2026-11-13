import { Browser, BrowserContext, Page, expect } from '@playwright/test';

export const STORAGE_KEY = 'metju.chord.v3';

export const PHONES = [
    { name: '844×390', width: 844, height: 390 },
    { name: '667×375', width: 667, height: 375 },
    { name: '932×430', width: 932, height: 430 },
];

export interface SeedState { version: 3; song: unknown; settings?: unknown }

export interface Opts {
    width?: number;
    height?: number;
    /** touch + mobile emulation (default: true below 1000 px wide) */
    phone?: boolean;
    /** saved state written to localStorage before the app loads (once per tab, so reloads keep what the app saved) */
    seed?: SeedState;
}

/** Records the exact note frequencies the audio engine schedules (a synth's `frequency` AudioParam). */
const NOTE_RECORDER = () => {
    const w = window as unknown as { __notes: { midi: number; t: number; w: number }[] };
    w.__notes = [];
    // and the oscillator waveforms the engine sets up: each synth voice sets its type once, when its strip is built
    const types: string[] = ((w as unknown as { __types: string[] }).__types = []);
    const typeDesc = Object.getOwnPropertyDescriptor(OscillatorNode.prototype, 'type')!;
    Object.defineProperty(OscillatorNode.prototype, 'type', {
        configurable: true,
        get() { return typeDesc.get!.call(this); },
        set(v) { types.push(v); typeDesc.set!.call(this, v); },
    });
    const orig = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value: number, time: number) {
        const midi = 69 + 12 * Math.log2(value / 440);
        if (value > 20 && value < 5000 && Math.abs(midi - Math.round(midi)) < 1e-6) w.__notes.push({ midi: Math.round(midi), t: time, w: performance.now() });
        return orig.call(this, value, time);
    };
};

export async function newPage(browser: Browser, o: Opts = {}): Promise<{ page: Page; context: BrowserContext }> {
    const width = o.width ?? 844, height = o.height ?? 390;
    const phone = o.phone ?? width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
    await context.addInitScript(NOTE_RECORDER);
    if (o.seed) {
        await context.addInitScript(({ key, state }) => {
            try {
                if (sessionStorage.getItem('__seeded')) return;
                sessionStorage.setItem('__seeded', '1');
                localStorage.setItem(key, JSON.stringify(state));
            } catch { /* storage blocked */ }
        }, { key: STORAGE_KEY, state: o.seed });
    }
    return { page: await context.newPage(), context };
}

/** Dismiss the intro (it needs a tap for sound) and wait until the app is there. */
export async function start(page: Page) {
    await page.click('.intro-key');
    await page.locator('.intro').waitFor({ state: 'detached' });
    await expect(page.locator('.top-bar')).toBeVisible();
}

export async function open(browser: Browser, o: Opts = {}, url = '/') {
    const r = await newPage(browser, o);
    await r.page.goto(url);
    await start(r.page);
    return r;
}

export const tap = (page: Page, sel: string, phone = true) => (phone ? page.locator(sel).first().tap() : page.locator(sel).first().click());

/**
 * Notes the engine scheduled since the last `clearNotes`, in audio-time order. Skips t = 0 (oscillator init values).
 * "Since" is by the wall clock at scheduling time, so a note scheduled ahead by a press just before is left out.
 */
export const notes = (page: Page) => page.evaluate(() => {
    const w = window as unknown as { __notes: { midi: number; t: number; w: number }[]; __mark?: number };
    return w.__notes.filter(n => n.t > 0 && n.w >= (w.__mark ?? 0)).sort((a, b) => a.t - b.t);
});
export const oscTypes = (page: Page) => page.evaluate(() => [...(window as unknown as { __types: string[] }).__types]);
export const clearNotes = (page: Page) => page.evaluate(() => { (window as unknown as { __mark: number }).__mark = performance.now(); });

/** MIDI numbers in time order with repeats collapsed: the bass roots as a chord sequence. */
export const roots = async (page: Page) => {
    const out: number[] = [];
    for (const n of await notes(page)) if (out[out.length - 1] !== n.midi) out.push(n.midi);
    return out;
};

export const savedState = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);

// ---- seeding songs ----------------------------------------------------------------------------------------------

const fx = { chorus: 0, tremolo: 0, glide: 0, reverb: 0, delay: 0 };
export const chordPart = (extra = {}) => ({ id: 'p1', name: 'Keys', color: '#4fd1c5', volume: 0, mute: false, solo: false, fx, kind: 'chords', instrument: 'epiano', tone: { pan: 0.5 }, shape: {}, playMode: 'Chord', arpPattern: 'up', arpRate: '8n', noteLength: 0.3, strumSpread: 0.035, strumDirection: 'down', strumPattern: 'pop', ...extra });
export const bassPart = (extra = {}) => ({ id: 'p2', name: 'Bass', color: '#ff7aa8', volume: 0, mute: false, solo: false, fx, kind: 'bass', instrument: 'bass', tone: { pan: 0.5 }, shape: {}, style: 'pulse', octave: 2, ...extra });
export const melodyPart = (extra = {}) => ({ id: 'p3', name: 'Melody', color: '#7fb4ff', volume: 0, mute: false, solo: false, fx, kind: 'melody', instrument: 'lead', tone: { pan: 0.5 }, shape: {}, octave: 4, notes: [], ...extra });
export const clip = (degree: number, start: number, len: number) => ({ start, len, chord: { degree, type: 'triad', inversion: 0, octave: 4 } });
export const section = (id: string, letter: string, steps: number, chords: unknown[], extra = {}) => ({ id, name: letter, letter, steps, chords, content: {}, mutes: {}, ...extra });

export function seed(o: { bpm?: number; sections: unknown[]; chain?: string[]; parts?: unknown[]; settings?: Record<string, unknown> }): SeedState {
    const sections = o.sections as { id: string }[];
    return {
        version: 3,
        song: {
            key: 'C', scale: 'major', bpm: o.bpm ?? 240, timeSignature: { beats: 4, unit: 4 },
            space: { reverb: { size: 2.5, ret: 0.8 }, delay: { time: '8n', feedback: 0.35, ret: 0.7 }, out: { level: 1 } },
            parts: o.parts ?? [chordPart(), bassPart(), melodyPart()],
            sections,
            chain: (o.chain ?? sections.map(s => s.id)).map(sectionId => ({ sectionId })),
        },
        settings: {
            voiceLeading: false, octave: 4, inversion: 0, loop: true, theme: 'dark', nextHint: true, padPart: '', clickAccent: true,
            openSection: sections[0].id, playMode: 'loop', learnTab: 'progressions', chordMood: false, soundPreview: false, shapeView: 'simple', partsTab: 'sound', chordLength: 'bar',
            ...o.settings,
        },
    };
}

/** Pitch classes of the C major triads' roots, as bass MIDI numbers in octave 2 (the default bass part). */
export const ROOT = { C: 36, D: 38, E: 40, F: 41, G: 43, A: 45, B: 47 };
