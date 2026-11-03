import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/** Every .ts/.tsx file under src/. */
const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? files(p) : /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
    });

describe('effects', () => {
    // An effect's return value is its cleanup: React calls it on unmount, and anything that isn't a
    // function crashes the whole app ("c is not a function"). Expression bodies return whatever the
    // expression gives, e.g. a Promise from scrollTo in newer browsers, which once blanked the app
    // when Learn closed. So effects use a block body, unless they return a cleanup on purpose.
    const CLEANUP_ON_PURPOSE = [
        'useEffect(() => () =>', // returns a cleanup
        'useEffect(() => clear,', // PopMenu: the cleanup function itself
        'useEffect(() => (audioReady ? keepScreenOn() : undefined)', // keepScreenOn returns its cleanup
    ];

    it('use a block body unless they return a cleanup function on purpose', () => {
        const bad: string[] = [];
        for (const f of files(path.join(__dirname))) {
            fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
                const m = line.match(/use(Layout)?Effect\(\(\) => [^{]/);
                if (m && !CLEANUP_ON_PURPOSE.some(ok => line.includes(ok))) bad.push(`${path.relative(__dirname, f)}:${i + 1}: ${line.trim()}`);
            });
        }
        expect(bad).toEqual([]);
    });
});
