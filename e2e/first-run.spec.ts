import { test, expect } from '@playwright/test';
import { open, roots, clearNotes, savedState, ROOT } from './helpers';

// A new player's first minute: start, record four chords from the pads, play them back in a loop.
test('first run: record four pads, play them back in order and loop', async ({ browser }) => {
    const { page, context } = await open(browser, { width: 844, height: 390 });

    // fast tempo keeps the run short; two-beat chords make four pads fill the two-bar section
    await page.locator('.tb-chip').tap();
    const bpm = page.locator('.tb-bpm');
    await bpm.fill('240');
    await bpm.press('Enter');
    await page.getByRole('button', { name: 'Close' }).tap();
    await page.getByRole('button', { name: 'Settings' }).tap();
    await page.getByRole('button', { name: '2 beats' }).tap();
    await page.getByRole('button', { name: 'Close' }).tap();

    await page.locator('.tb-rec').tap();
    await expect(page.locator('.tb-rec')).toHaveClass(/\bon\b/);
    for (const pad of [1, 4, 5, 6]) await page.locator(`.pad-${pad}`).tap();
    await page.locator('.tb-rec').tap();
    await expect(page.locator('.tb-rec')).not.toHaveClass(/\bon\b/);

    // autosave is debounced, so wait for it
    await expect.poll(async () => (await savedState(page)).song.sections[0].chords.map((c: { chord: { degree: number } }) => c.chord.degree)).toEqual([0, 3, 4, 5]);

    await clearNotes(page);
    await page.locator('.tb-play').tap();
    await expect(page.locator('.tb-play')).toHaveClass(/\bon\b/);
    // Play starts at the cursor (the last pad's chord, a beat from the end), then the section loops:
    // C F G Am twice over, in order, with nothing else in between
    const pass = [ROOT.C, ROOT.F, ROOT.G, ROOT.A];
    const want = [...pass, ...pass].join();
    await expect.poll(async () => (await roots(page)).join()).toContain(want);
    expect((await roots(page)).join()).toMatch(new RegExp(`^(${ROOT.A},)?${want}`));
    await context.close();
});
