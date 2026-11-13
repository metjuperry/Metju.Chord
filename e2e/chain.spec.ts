import { test, expect } from '@playwright/test';
import { open, notes, clearNotes, roots, oscTypes, savedState, seed, section, clip, ROOT } from './helpers';

// A chain of two sections of different lengths, the second with its own bass sound (instrument and octave):
// each slot must play its own notes, for its own length, and the section's own strip must exist.
const chain = (own: boolean) => seed({
    bpm: 240,
    chain: ['s1', 's2'],
    sections: [
        section('s1', 'A', 4, [clip(0, 0, 384)]),
        section('s2', 'B', 8, [clip(3, 0, 384), clip(4, 384, 384)], own ? { sound: { p2: { instrument: 'chip', octave: 3 } } } : {}),
    ],
    settings: { playMode: 'chain' },
});

test('chain of two sections: each slot plays its own notes for its own length, through its own strip', async ({ browser }) => {
    const control = await open(browser, { seed: chain(false) });
    const base = (await oscTypes(control.page)).length;
    await control.context.close();

    const { page, context } = await open(browser, { seed: chain(true) });
    // the section's own bass sound builds one more synth voice than the song's parts alone
    await expect.poll(async () => (await oscTypes(page)).length).toBeGreaterThan(base);

    await page.locator('.tb-play').tap();
    await clearNotes(page);
    // A: C (octave 2, the song's bass); B: F then G, an octave up (B's own octave); then round again
    const one = [ROOT.C, ROOT.F + 12, ROOT.G + 12];
    await expect.poll(async () => (await roots(page)).join()).toContain([...one, ...one].join());

    // lengths: A is one bar (1 s at 240 BPM), B two bars. Note starts are exact audio times; measure from slot start
    // to slot start (the first note after the previous slot's last), since the first A may have been cut by clearNotes.
    const all = await notes(page);
    const first = (midi: number, after: number) => all.find(n => n.midi === midi && n.t > after)!.t;
    const b1 = first(ROOT.F + 12, 0);
    const a2 = first(ROOT.C, b1);
    const b2 = first(ROOT.F + 12, a2);
    expect(a2 - b1, 'B is two bars').toBeCloseTo(2, 1);
    expect(b2 - a2, 'A is one bar').toBeCloseTo(1, 1);
    // B's second chord comes a bar into B
    expect(first(ROOT.G + 12, b1) - b1).toBeCloseTo(1, 1);

    // the own sound is part of the saved song, in B only
    const saved = (await savedState(page)).song;
    expect(saved.sections[1].sound.p2).toMatchObject({ instrument: 'chip', octave: 3 });
    expect(saved.sections[0].sound).toBeUndefined();
    await context.close();
});
