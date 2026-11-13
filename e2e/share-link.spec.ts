import { test, expect } from '@playwright/test';
import { newPage, start, savedState, seed, section, clip, STORAGE_KEY } from './helpers';

const BEFORE_SHARE_KEY = `${STORAGE_KEY}.before-share`;

// A share link over a song already saved in this browser must not lose that song (it once did, after a reload).
test('share link over a saved song: the old song comes back with "Back to my song", also after a reload', async ({ browser }) => {
    const mine = seed({ bpm: 90, sections: [section('s1', 'A', 8, [clip(0, 0, 384), clip(4, 384, 384)], { name: 'Mine' })] });
    (mine.song as { key: string }).key = 'D';
    const theirs = seed({ bpm: 150, sections: [section('x1', 'A', 8, [clip(5, 0, 768)], { name: 'Theirs' })] });
    (theirs.song as { key: string }).key = 'G';
    // the plain (uncompressed) form of a share link: p + base64url(JSON)
    const link = 'p' + btoa(JSON.stringify(theirs)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const { page, context } = await newPage(browser, { seed: mine });
    await page.goto(`/#song=${link}`);
    await start(page);

    // the link's song is open, the address bar is tidy, and the old one is kept aside
    await expect(page.locator('.tb-chip')).toHaveAttribute('aria-label', /^Key G Major, 150 BPM/);
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await savedState(page))?.song.sections[0].name).toBe('Theirs');
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? 'null')?.song.sections[0].name, BEFORE_SHARE_KEY)).toBe('Mine');

    // a reload keeps the shared song (autosaved) and still offers the way back
    await page.reload();
    await start(page);
    await expect(page.locator('.tb-chip')).toHaveAttribute('aria-label', /^Key G Major/);
    await page.getByRole('button', { name: 'Song', exact: true }).tap();

    // on the phone it is in the Song menu and in a section's ⋯ menu
    await page.getByRole('button', { name: /^Song menu/ }).tap();
    const inSongMenu = page.getByRole('menuitem', { name: /Back to my song/ });
    await expect(inSongMenu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(inSongMenu).toBeHidden();
    await page.locator('.sec-main').first().tap();
    await page.locator('.prog-more').tap();
    const inSectionMenu = page.getByRole('menuitem', { name: /Back to my song/ });
    await expect(inSectionMenu).toBeVisible();

    await inSectionMenu.tap();
    await expect(page.locator('.tb-chip')).toHaveAttribute('aria-label', /^Key D Major, 90 BPM/);
    await expect.poll(async () => (await savedState(page)).song.sections[0].name).toBe('Mine');
    expect(await page.evaluate(k => localStorage.getItem(k), BEFORE_SHARE_KEY)).toBeNull();
    await context.close();
});
