import { test, expect, Page } from '@playwright/test';
import { open, PHONES, fullSong, noHorizontalOverflow, insideWindow, inViewport, hitAreaFailures } from './helpers';

// The phone is the main device and its layout is landscape only. At every phone size: Play fits without scrolling,
// nothing is wider than the window, every open menu stays inside it, the top bar stays in view with the drum
// editor scrolled to its end, and every control has a 44 px hit area.
for (const phone of PHONES) {
    test(`phone layout ${phone.name}`, async ({ browser }) => {
        test.setTimeout(90_000);
        const { page, context } = await open(browser, { width: phone.width, height: phone.height, seed: fullSong() });
        const tab = (name: 'Play' | 'Song' | 'Parts') => page.locator('.tb-modes').getByRole('button', { name, exact: true }).tap();
        const closeMenu = async (selector: string) => { await page.keyboard.press('Escape'); await expect(page.locator(selector)).toHaveCount(0); };
        const audit = async (where: string, min = 15) => expect(await hitAreaFailures(page, min), `${where}: controls under 44 px`).toEqual([]);

        // ---- Play: fits without scrolling
        await tab('Play');
        const noScroll = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
        expect(noScroll.h, 'Play does not scroll vertically').toBeLessThanOrEqual(noScroll.ch);
        await noHorizontalOverflow(page, 'Play');
        for (const sel of ['.tb-play', '.pad-1', '.pad-7', '.pad-2', '.stick-knob']) await inViewport(page, sel, 'Play');
        await audit('Play', 15);
        // its menus: key, scale and tempo; the part the pads play
        await page.locator('.tb-chip').tap();
        await insideWindow(page, '.tb-sheet', 'Play, key and tempo sheet');
        await noHorizontalOverflow(page, 'Play, key and tempo sheet');
        await page.keyboard.press('Escape');
        await expect(page.locator('.tb-sheet')).toHaveCount(0);
        await page.locator('.pads-target').tap();
        await insideWindow(page, '[role=menu]', 'Play, pads menu');
        await closeMenu('[role=menu]');

        // ---- Song
        await tab('Song');
        await noHorizontalOverflow(page, 'Song');
        await page.locator('.song-button').tap();
        await insideWindow(page, '[role=menu]', 'Song menu');
        await closeMenu('[role=menu]');
        await page.locator('.sec-more').first().tap();
        await insideWindow(page, '[role=menu]', 'section tile menu');
        await closeMenu('[role=menu]');

        // ---- a section, with the Melody lane open, and the Drums lane scrolled to its end
        await page.getByRole('button', { name: /^Open A,/ }).tap();
        await noHorizontalOverflow(page, 'Section');
        await audit('Section');
        await page.locator('.prog-more').tap();
        await insideWindow(page, '[role=menu]', 'section ⋯ menu');
        await closeMenu('[role=menu]');

        await page.getByRole('button', { name: 'Edit Melody' }).first().tap();
        await expect(page.locator('.lane-back')).toBeVisible();
        await noHorizontalOverflow(page, 'Section, Melody lane');
        await inViewport(page, '.tb-play', 'Section, Melody lane');
        await page.locator('.more-button').first().tap();
        await insideWindow(page, '[role=menu]', 'Melody ⋯ menu');
        await closeMenu('[role=menu]');

        await page.locator('.lane-back').tap();
        await page.getByRole('button', { name: 'Edit Drums' }).first().tap();
        await expect(page.locator('.drum-cell').first()).toBeVisible();
        await noHorizontalOverflow(page, 'Section, Drums lane');
        // scroll the editor to its end, in both directions: the top bar must still be there
        await page.evaluate(() => {
            const cells = [...document.querySelectorAll('.drum-cell')];
            cells[cells.length - 1].scrollIntoView({ block: 'end', inline: 'end' });
            for (let el = cells[cells.length - 1] as HTMLElement | null; el; el = el.parentElement) { el.scrollTop = el.scrollHeight; el.scrollLeft = el.scrollWidth; }
        });
        await inViewport(page, '.tb-play', 'Drums lane scrolled to its end');
        await inViewport(page, '.tb-modes', 'Drums lane scrolled to its end');
        await noHorizontalOverflow(page, 'Drums lane scrolled to its end');
        await page.evaluate(() => window.scrollTo(0, 0));

        // ---- Parts: every tab of a part
        await tab('Parts');
        await noHorizontalOverflow(page, 'Parts');
        await audit('Parts');
        const tabs = page.locator('[role=tablist][aria-label="Part settings"] [role=tab]');
        const n = await tabs.count();
        expect(n, 'a chord part has several tabs').toBeGreaterThanOrEqual(2);
        for (let i = 0; i < n; i++) {
            const t = tabs.nth(i);
            const label = (await t.textContent())?.trim();
            await t.tap();
            await expect(t).toHaveAttribute('aria-selected', 'true');
            await noHorizontalOverflow(page, `Parts, ${label}`);
            await inViewport(page, '.tb-play', `Parts, ${label}`);
            await audit(`Parts, ${label}`);
        }

        // ---- Learn, Settings
        await learnAndSettings(page);
        await context.close();
    });
}

/** Learn (every tab) and the Settings sheet: no horizontal overflow, the sheet inside the window. */
async function learnAndSettings(page: Page) {
    await page.locator('.tb-learn').tap();
    await noHorizontalOverflow(page, 'Learn');
    const tabs = page.locator('.lp-tabs [role=tab]');
    const n = await tabs.count();
    expect(n, 'Learn has tabs').toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i++) {
        await tabs.nth(i).tap();
        await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
        await noHorizontalOverflow(page, `Learn, tab ${i + 1}`);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.lp-tabs')).toHaveCount(0);
    await page.locator('.tb-settings').tap();
    await insideWindow(page, '.ss-sheet', 'Settings');
    await noHorizontalOverflow(page, 'Settings');
    await page.keyboard.press('Escape');
}
