import { describe, expect, it } from 'vitest';
import { MAX_SHARE_BYTES, MAX_SHARE_CHARS, decodeShare, defaultSettings, encodeShare, newFullSong, readSaved } from './song';
import { applySectionEdit, chainLayout, engineStrips, sectionView } from './sections';
import { chainEvents } from './playback';
import { Part, newPart } from './parts';

/** A save with every kind of part and content, a section with its own sound, and a chain. */
function fullSave() {
    const song = newFullSong();
    const parts: Part[] = [...song.parts];
    parts.push(newPart('drums', parts));
    parts.push(newPart('voice', parts));
    const first = {
        ...song.sections[0],
        chords: [
            { start: 0, len: 96, chord: { degree: 0, type: 'triad' as const, inversion: 0, octave: 4 } },
            { start: 96, len: 96, rest: true as const, plays: { p1: true } },
        ],
        content: {
            p3: { notes: [{ start: 0, len: 24, step: 3, acc: 1 as const }] },
            p4: { drums: { bars: 2 as const, hits: { kick: [0, 8], hat: [1, 2, 3] } } },
            p5: { vowels: [{ start: 0, len: 96, vowel: 'a' as const }] },
        },
        sound: { p1: { instrument: 'organ', shape: { attack: 0.2 } } },
    };
    return {
        version: 3,
        song: { ...song, parts, sections: [first, { ...first, id: 's2', name: 'B' }], chain: [{ sectionId: 's1' }, { sectionId: 's2' }, { sectionId: 's1' }] },
        settings: defaultSettings(),
    };
}
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('ids in saves', () => {
    it('keeps the ids the app makes', () => {
        const read = readSaved(copy(fullSave()))!;
        expect(read.song.parts.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
        expect(read.song.sections.map(s => s.id)).toEqual(['s1', 's2']);
    });

    it.each(['__proto__', 'p1@s1', 'a b', '', 'x'.repeat(25), "a'b"])('a part id %j is replaced by a fresh one', bad => {
        const save = copy(fullSave());
        save.song.parts[2].id = bad;
        const read = readSaved(save)!;
        const ids = read.song.parts.map(p => p.id);
        expect(ids).not.toContain(bad);
        expect(new Set(ids).size).toBe(5);
        expect(ids.every(id => /^[A-Za-z0-9_-]{1,24}$/.test(id))).toBe(true);
        // strips stay one per name
        const strips = engineStrips(read.song).map(s => s.id);
        expect(new Set(strips).size).toBe(strips.length);
    });

    it.each(['__proto__', 's1@x', 'two words'])('a section id %j is replaced, and chain entries naming it go', bad => {
        const save = copy(fullSave());
        save.song.sections[1].id = bad;
        save.song.chain = [{ sectionId: 's1' }, { sectionId: bad }];
        const read = readSaved(save)!;
        expect(read.song.sections.map(s => s.id)).not.toContain(bad);
        expect(read.song.sections).toHaveLength(2);
        expect(read.song.chain).toEqual([{ sectionId: 's1' }]);
    });
});

describe('a section’s own sound in a save', () => {
    it('an instrument that isn’t one is dropped, not turned into the default instrument', () => {
        const save = copy(fullSave());
        (save.song.parts[0] as { instrument: string }).instrument = 'strings';
        save.song.sections[0].sound = { p1: { instrument: 'kazoo', shape: { attack: 0.2 } } };
        const read = readSaved(save)!;
        expect(read.song.sections[0].sound).toEqual({ p1: { shape: { attack: 0.2 } } });
        expect(sectionView(read.song, 's1').parts[0]).toMatchObject({ instrument: 'strings' });
    });

    it('a real instrument is kept', () => {
        const read = readSaved(copy(fullSave()))!;
        expect(read.song.sections[0].sound?.p1).toMatchObject({ instrument: 'organ' });
    });
});

describe('share links', () => {
    it('refuses a link that unpacks into far more than a song', async () => {
        // a megabyte of zeros deflates to about a kilobyte: this is ~8 MB from ~8 KB
        const zeros = new Uint8Array(2 * MAX_SHARE_BYTES);
        const packed = new Uint8Array(await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
        expect(packed.length).toBeLessThan(20_000);
        let bin = '';
        packed.forEach(b => (bin += String.fromCharCode(b)));
        const data = `z${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
        await expect(decodeShare(data)).rejects.toThrow();
    });

    it('refuses a link longer than any song needs', async () => {
        await expect(decodeShare(`p${'A'.repeat(MAX_SHARE_CHARS)}`)).rejects.toThrow();
    });

    it('still opens a full song', async () => {
        const state = readSaved(copy(fullSave()))!;
        const data = await encodeShare(state);
        expect(data.length).toBeLessThan(MAX_SHARE_CHARS / 50);
        expect(readSaved(await decodeShare(data))).toEqual(state);
    });
});

describe('whatever a save holds, reading it never throws and gives a song the app can use', () => {
    const JUNK: unknown[] = [null, -1, 0, 1e9, -1e9, '', 'x', '__proto__', 'constructor', [], {}, [[]], { length: 5 }, true, 1.5, '9'.repeat(40), "a'b\"c<d>&", 's1@p1'];
    let seed = 20261110;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
    type Path = (string | number)[];
    const paths = (o: unknown, at: Path = [], out: Path[] = []): Path[] => {
        if (o && typeof o === 'object') for (const k of Object.keys(o)) {
            out.push([...at, k]);
            paths((o as Record<string, unknown>)[k], [...at, k], out);
        }
        return out;
    };

    it('2,000 saves with a few values swapped for junk', () => {
        for (let i = 0; i < 2000; i++) {
            const save = copy(fullSave()) as unknown as Record<string, unknown>;
            const all = paths(save);
            for (let m = 0; m <= Math.floor(rnd() * 4); m++) {
                const path = pick(all);
                let o: unknown = save;
                for (const k of path.slice(0, -1)) o = (o as Record<string, unknown> | undefined)?.[k as string];
                if (!o || typeof o !== 'object') continue;
                const rec = o as Record<string, unknown>;
                const k = path[path.length - 1] as string;
                if (rnd() < 0.15) delete rec[k];
                // (not on arrays: a key like "1000000000" would make one a billion long)
                else if (rnd() < 0.2 && !Array.isArray(o)) rec[String(pick(JUNK))] = rec[k];
                else rec[k] = pick(JUNK);
            }
            const read = readSaved(copy(save));
            if (!read) continue;
            // stable: reading the repaired save again changes nothing
            expect(readSaved(copy(read))).toEqual(read);
            const song = read.song;
            expect(chainLayout(song).length).toBeGreaterThan(0);
            const { events, length } = chainEvents(song);
            expect(length).toBeGreaterThan(0);
            expect(events.every(e => Number.isFinite(e.tick) && Number.isFinite(e.duration) && e.duration >= 0)).toBe(true);
            const strips = engineStrips(song).map(s => s.id);
            expect(new Set(strips).size).toBe(strips.length);
            for (const sec of song.sections) expect(applySectionEdit(song, sec.id, sectionView(song, sec.id))).toBe(song);
        }
    });
});
