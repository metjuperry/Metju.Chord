import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSaved } from './song';

/**
 * Old saves keep loading exactly as they did. Each `test-saves/<name>.json` is a save (version 2 or 3:
 * every part kind, rests with plays, section sound, accidentals, drums of 1, 2 and 4 bars, an old Voice
 * part with singers and vowels, hostile ids) and `<name>.read.json` is what `readSaved` made of it when
 * the fixture was written. A change to the readers or the data model must leave these files as they are;
 * if a reader is meant to change, say why in the PR and update the snapshot with `vitest -u`.
 */
const dir = join(__dirname, 'test-saves');
const saves = readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.read.json'));

describe('old saves read the same as before', () => {
    it('has fixtures', () => expect(saves.length).toBeGreaterThanOrEqual(5));
    for (const file of saves) {
        it(file, async () => {
            const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
            const read = readSaved(raw);
            await expect(`${JSON.stringify(read, null, 1)}\n`).toMatchFileSnapshot(join(dir, file.replace(/\.json$/, '.read.json')));
            // and a save of what was read reads back the same
            expect(readSaved(JSON.parse(JSON.stringify(read)))).toEqual(read);
        });
    }
});
