import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { highestPr } = require('./version.cjs');

describe('app version', () => {
    it('takes the highest merged PR number, from merge and squash commits', () => {
        expect(highestPr([
            'Merge pull request #36 from metjuperry/claude/effect-menu-fit',
            'Merge pull request #37 from metjuperry/claude/sound-preview',
            'Fix something (#12)',
            'Play the pads with H U J I K O L and the numpad too',
        ])).toBe(37);
        expect(highestPr(['Big change (#40)', 'Merge pull request #37 from x/y'])).toBe(40);
    });
    it('ignores other mentions of numbers and gives null without any PR', () => {
        expect(highestPr(['Fix #99 in the text', 'Release 2'])).toBe(null);
    });
});
