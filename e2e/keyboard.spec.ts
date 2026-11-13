import { test, expect } from '@playwright/test';
import { open, savedState, notes, clearNotes, seed, section, clip, chordPart, bassPart, melodyPart } from './helpers';

// Desktop keyboard: Space presses a button reached with Tab but plays/pauses after a mouse click;
// 1 to 7 play the pads; Ctrl+Z undoes. (Space on a clicked button once pressed it instead of playing.)
test('keyboard: Space after Tab or click, keys 1 to 7, Ctrl+Z', async ({ browser }) => {
    const { page, context } = await open(browser, {
        width: 1280, height: 720,
        // the chord part on a synth, so pad notes can be seen as frequencies
        seed: seed({ bpm: 120, parts: [chordPart({ instrument: 'pad' }), bassPart(), melodyPart()], sections: [section('s1', 'A', 8, [clip(0, 0, 384), clip(3, 384, 384)])] }),
    });
    const play = page.locator('.tb-play');
    const rec = page.locator('.tb-rec');
    const isOn = (l: typeof play) => expect(l).toHaveClass(/\bon\b/);
    const isOff = (l: typeof play) => expect(l).not.toHaveClass(/\bon\b/);

    // 1. Tab to the Record button: Space presses it, and does not start playback
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        if (await rec.evaluate(el => el === document.activeElement)) break;
    }
    await expect(rec).toBeFocused();
    await page.keyboard.press('Space');
    await isOn(rec);
    await isOff(play);
    await page.keyboard.press('Space');
    await isOff(rec);
    await isOff(play);

    // 2. After a mouse click on a button, Space plays and pauses (and doesn't press that button again)
    const partsTab = page.getByRole('tab', { name: 'Parts' });
    await partsTab.click();
    await expect(partsTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Space');
    await isOn(play);
    await expect(partsTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Space');
    await isOff(play);

    // 3. Keys 1 to 7 play the seven pads: each sounds its own triad (pitch classes of the C major scale's triads)
    const triads = [[0, 4, 7], [2, 5, 9], [4, 7, 11], [5, 9, 0], [7, 11, 2], [9, 0, 4], [11, 2, 5]];
    for (let d = 0; d < 7; d++) {
        await clearNotes(page);
        await page.keyboard.press(`Digit${d + 1}`);
        await expect.poll(async () => [...new Set((await notes(page)).map(n => n.midi % 12))].sort((a, b) => a - b), { message: `key ${d + 1}` })
            .toEqual([...triads[d]].sort((a, b) => a - b));
    }

    // 4. Ctrl+Z undoes (a new section), Ctrl+Shift+Z brings it back
    await page.getByRole('tab', { name: 'Song' }).click();
    const sectionCount = () => savedState(page).then(s => s.song.sections.length);
    await expect.poll(sectionCount).toBe(1);
    await page.locator('.sec-new').click();
    await expect.poll(sectionCount).toBe(2);
    await page.keyboard.press('Control+z');
    await expect.poll(sectionCount).toBe(1);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(sectionCount).toBe(2);
    await context.close();
});
