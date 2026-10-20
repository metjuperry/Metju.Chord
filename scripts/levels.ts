// Usage: npm run levels
// Bundles scripts/levels-page.ts with esbuild, runs it in headless Chromium and prints
// per-instrument peak and RMS (0.1-1.0 s) for a C4 triad and a diatonic 9th, plus the
// limiter output with every effect at max.
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import * as fs from 'fs';
import * as path from 'path';
import { INSTRUMENTS } from '../src/audio/instruments';

interface Level { peak: number; rms: number }
interface Row { id: string; triad: Level; ninth: Level; fx: Level }

const fmt = (n: number) => n.toFixed(1).padStart(6);

async function main() {
    const result = await build({
        entryPoints: [path.join(__dirname, '../scripts/levels-page.ts')],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        logLevel: 'error',
    });

    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
        args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    });
    try {
        const page = await browser.newPage();
        page.on('pageerror', e => console.error('page error:', e));
        await page.setContent('<html><body></body></html>');
        await page.addScriptTag({ content: result.outputFiles[0].text });
        const rows: Row[] = await page.evaluate(() => (window as any).runLevels());

        console.log('dBFS            triad peak  triad RMS | 9th peak  9th RMS | all-fx limiter peak');
        for (const r of rows) {
            console.log(`${r.id.padEnd(12)}  ${fmt(r.triad.peak)}  ${fmt(r.triad.rms)}   | ${fmt(r.ninth.peak)}  ${fmt(r.ninth.rms)} | ${fmt(r.fx.peak)}`);
        }

        const sustains = new Set(INSTRUMENTS.filter(i => i.sustains).map(i => i.id as string));
        const sustaining = rows.filter(r => sustains.has(r.id)).map(r => r.triad.rms);
        const spread = Math.max(...sustaining) - Math.min(...sustaining);
        const peaksOk = rows.every(r => r.triad.peak >= -10 && r.triad.peak <= -3);
        const fxOk = rows.every(r => r.fx.peak <= -0.5);
        console.log(`\nsustaining RMS spread: ${spread.toFixed(1)} dB (limit 6)`);
        console.log(`triad peaks within -10..-3 dBFS: ${peaksOk ? 'yes' : 'NO'}`);
        console.log(`all-fx limiter output <= -0.5 dBFS: ${fxOk ? 'yes' : 'NO'}`);
        process.exitCode = spread <= 6 && peaksOk && fxOk ? 0 : 1;
    } finally {
        await browser.close();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
