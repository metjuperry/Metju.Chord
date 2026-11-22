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
    // reduced motion: no view transitions, so a screen is in place (and hit-testable) the moment it renders
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', ...(phone ? { hasTouch: true, isMobile: true } : {}) });
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

export const drumPart = (extra = {}) => ({ id: 'p4', name: 'Drums', color: '#ffb347', volume: 0, mute: false, solo: false, fx, kind: 'drums', drums: { bars: 1, hits: {} }, ...extra });
export const melodyNotes = [0, 2, 4, 5, 7, 4, 2, 0].map((step, i) => ({ start: i * 2, len: 2, step }));

/** A song with every kind of lane filled in: chords, bass, melody and a four-bar drum pattern in two sections. */
export function fullSong() {
    const drums = { bars: 4, hits: { kick: [0, 8, 16, 24, 32, 40, 48, 56], snare: [4, 12, 20, 28, 36, 44, 52, 60], hat: Array.from({ length: 32 }, (_, i) => i * 2) } };
    return seed({
        bpm: 100,
        parts: [chordPart(), bassPart(), melodyPart(), drumPart(), chordPart({ id: 'p5', name: 'Pad', instrument: 'warmpad', color: '#b39ddb' })],
        sections: [
            section('s1', 'A', 16, [clip(0, 0, 384), clip(3, 384, 384), clip(4, 768, 384), clip(5, 1152, 384)], { content: { p3: { notes: melodyNotes }, p4: { drums } } }),
            section('s2', 'B', 8, [clip(5, 0, 384), clip(3, 384, 384)]),
        ],
    });
}

// ---- layout checks ----------------------------------------------------------------------------------------------

/** The page is not wider than the window (no horizontal scrolling), by document and body. */
export async function noHorizontalOverflow(page: Page, where: string) {
    const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, win: document.documentElement.clientWidth }));
    expect(m.doc, `${where}: document is ${m.doc}px wide in a ${m.win}px window`).toBeLessThanOrEqual(m.win);
    expect(m.body, `${where}: body is ${m.body}px wide in a ${m.win}px window`).toBeLessThanOrEqual(m.win);
}

/** Every visible element matching `selector` lies inside the window. At least one must be visible. */
export async function insideWindow(page: Page, selector: string, where: string) {
    const r = await page.evaluate((sel) => {
        const els = [...document.querySelectorAll(sel)].filter(e => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed');
        return { n: els.length, win: { w: window.innerWidth, h: window.innerHeight }, out: els.map(e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; })
            .filter(b => b.l < -0.5 || b.t < -0.5 || b.r > window.innerWidth + 0.5 || b.b > window.innerHeight + 0.5) };
    }, selector);
    expect(r.n, `${where}: ${selector} is open`).toBeGreaterThan(0);
    expect(r.out, `${where}: ${selector} sticks out of the ${r.win.w}×${r.win.h} window`).toEqual([]);
}

/** A control's whole box is inside the window (not clipped by it). */
export async function inViewport(page: Page, selector: string, where: string) {
    const b = await page.locator(selector).first().boundingBox();
    const v = page.viewportSize()!;
    expect(b, `${where}: ${selector} exists`).not.toBeNull();
    expect(b!.x, `${where}: ${selector} left`).toBeGreaterThanOrEqual(-0.5);
    expect(b!.y, `${where}: ${selector} top`).toBeGreaterThanOrEqual(-0.5);
    expect(b!.x + b!.width, `${where}: ${selector} right`).toBeLessThanOrEqual(v.width + 0.5);
    expect(b!.y + b!.height, `${where}: ${selector} bottom`).toBeLessThanOrEqual(v.height + 0.5);
}

/**
 * The 44 px hit-area audit (PR 54): for every visible button, select, input, slider and switch, scroll it into view and
 * probe `elementFromPoint` 21.5 px left, right, up and down of its centre: it must still be that control (or its label).
 * Exempt: the grids' cells, the stick's directions and the pads (own designs: the pads are big, and the upper row overlaps
 * the lower one like piano keys; src/touch.css says the same). Returns the controls that fail, and fails itself if it found fewer than `min` controls (an audit that probes nothing proves nothing).
 */
export async function hitAreaFailures(page: Page, min = 5, root = 'body') {
    const { bad, checked } = await page.evaluate((rootSel) => {
        const EXEMPT = '.mel-cell, .drum-cell, .stick-dir, .pad';
        const controls = [...document.querySelectorAll(`${rootSel} :is(button, select, input, [role=slider], [role=switch])`)]
            .filter(el => !el.matches(EXEMPT) && !el.closest(EXEMPT)) as HTMLElement[];
        const bad: string[] = [];
        let checked = 0;
        for (const el of controls) {
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || (el as HTMLButtonElement).disabled) continue;
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;
            checked++;
            const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            const label = el.closest('label');
            const name = `${el.tagName.toLowerCase()}.${String(el.className).trim().replace(/\s+/g, '.')} "${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? ''}"`;
            for (const [dx, dy, side] of [[-21.5, 0, 'left'], [21.5, 0, 'right'], [0, -21.5, 'up'], [0, 21.5, 'down']] as const) {
                const hit = document.elementFromPoint(cx + dx, cy + dy);
                const ok = hit && (hit === el || el.contains(hit) || (label && label.contains(hit)));
                if (!ok) { bad.push(`${name} at ${Math.round(cx)},${Math.round(cy)} (${Math.round(b.width)}×${Math.round(b.height)}): ${side} hits ${hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).trim().replace(/\s+/g, '.') : 'nothing'}`); break; }
            }
        }
        window.scrollTo(0, 0);
        return { bad, checked };
    }, root);
    expect(checked, 'controls probed by the hit-area audit').toBeGreaterThanOrEqual(min);
    return bad;
}
