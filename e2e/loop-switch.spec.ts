import { test, expect } from '@playwright/test';
import { open, notes, clearNotes, seed, section, clip, ROOT } from './helpers';

// Loop mode, section A one bar long: opening section B while it plays must move the music over to B
// within two bars (it once kept looping A until the end of a longer section).
test('loop mode: switching section in the last bar plays the other section within two bars', async ({ browser }) => {
    const { page, context } = await open(browser, {
        seed: seed({ bpm: 240, sections: [section('s1', 'A', 4, [clip(0, 0, 384)]), section('s2', 'B', 8, [clip(3, 0, 384), clip(4, 384, 384)])] }),
    });
    const BAR_MS = 1000; // 4 beats at 240 BPM
    await page.getByRole('button', { name: 'Song', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Loop', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.tb-play').tap();
    // A is a one-bar loop, so every moment is its last bar: wait until it has gone round twice
    await expect.poll(async () => (await notes(page)).filter(n => n.midi === ROOT.C).length, { timeout: 8000 }).toBeGreaterThan(5);

    await clearNotes(page);
    const switchedAt = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: /^Open B,/ }).tap();

    await expect.poll(async () => (await notes(page)).some(n => n.midi === ROOT.G), { timeout: 8000 }).toBe(true);
    const after = await notes(page);
    const firstF = after.find(n => n.midi === ROOT.F)!;
    const firstG = after.find(n => n.midi === ROOT.G)!;
    expect(firstF, 'B starts with F').toBeTruthy();
    expect(firstF.w - switchedAt, 'F was scheduled within two bars of the switch').toBeLessThan(2 * BAR_MS + 400);
    expect(firstG.t).toBeGreaterThan(firstF.t);
    // and A's C is no longer scheduled once B's first note is
    expect(after.filter(n => n.t > firstF.t && n.midi === ROOT.C)).toEqual([]);
    await context.close();
});
