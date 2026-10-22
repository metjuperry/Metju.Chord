// Usage: node scripts/icons.cjs  — renders the app icons in public/icons/ from the favicon design
// (yellow tile, three black bars) with headless Chromium. Re-run after changing the design.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, '../public/icons');
/** The favicon: a rounded yellow tile. */
const rounded = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#ffcc00"/><path d="M9 23V12M16 23V8M23 23V15" stroke="#000" stroke-width="4" stroke-linecap="round" fill="none"/></svg>';
/** Full-bleed, for iOS and maskable icons (the system rounds the corners); the bars sit inside the 80% safe zone. */
const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#ffcc00"/><g transform="translate(16 16) scale(0.78) translate(-16 -15.5)"><path d="M9 23V12M16 23V8M23 23V15" stroke="#000" stroke-width="4" stroke-linecap="round" fill="none"/></g></svg>';

const ICONS = [
    ['icon-192.png', 192, rounded],
    ['icon-512.png', 512, rounded],
    ['maskable-512.png', 512, square],
    ['apple-touch-icon.png', 180, square],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
        args: ['--no-sandbox'],
    });
    for (const [file, size, svg] of ICONS) {
        const page = await browser.newPage({ viewport: { width: size, height: size } });
        await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
        await page.screenshot({ path: path.join(OUT, file), omitBackground: true });
        await page.close();
    }
    fs.writeFileSync(path.join(OUT, 'icon.svg'), rounded + '\n');
    await browser.close();
})();
