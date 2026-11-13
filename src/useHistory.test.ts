import { describe, expect, it } from 'vitest';
import { History, MERGE_MS, commitHistory, initialHistory, redoHistory, undoHistory } from './useHistory';

const set = (v: number) => () => v;
const same = (v: number) => v;

/** Undo until there's nothing left, collecting each state on the way. */
function undoAll(h: History<number>) {
    const seen = [h.present];
    while (h.past.length) {
        h = undoHistory(h);
        seen.push(h.present);
    }
    return seen;
}

describe('history', () => {
    it('edits with the same key in quick succession are one undo step', () => {
        let h = initialHistory(0);
        h = commitHistory(h, set(1), 'knob', 0);
        h = commitHistory(h, set(2), 'knob', 100);
        h = commitHistory(h, set(3), 'knob', 200);
        expect(undoAll(h)).toEqual([3, 0]);
    });

    it('the same key after a pause, or another key, is a new step', () => {
        let h = initialHistory(0);
        h = commitHistory(h, set(1), 'knob', 0);
        h = commitHistory(h, set(2), 'knob', MERGE_MS + 1);
        h = commitHistory(h, set(3), 'other', MERGE_MS + 2);
        h = commitHistory(h, set(4), undefined, MERGE_MS + 3);
        expect(undoAll(h)).toEqual([4, 3, 2, 1, 0]);
    });

    it('an edit that changes nothing records nothing', () => {
        const h = initialHistory(0);
        expect(commitHistory(h, same, 'knob', 0)).toBe(h);
    });

    it('a no-op first edit of a drag does not make the next edit merge into the step before', () => {
        let h = initialHistory(0);
        h = commitHistory(h, set(1), 'a', 0); // an earlier step
        h = commitHistory(h, set(2), undefined, 2000); // another step
        h = commitHistory(h, same, 'knob', 2100); // the drag starts with a move that changes nothing
        h = commitHistory(h, set(5), 'knob', 2200); // then it does change
        h = commitHistory(h, set(6), 'knob', 2300);
        // undo takes back the drag only, back to 2
        expect(undoAll(h)).toEqual([6, 2, 1, 0]);
    });

    it('undo and redo end a merge: the next edit is its own step', () => {
        let h = initialHistory(0);
        h = commitHistory(h, set(1), 'knob', 0);
        h = undoHistory(h);
        h = redoHistory(h);
        expect(h.present).toBe(1);
        h = commitHistory(h, set(2), 'knob', 100);
        expect(undoAll(h)).toEqual([2, 1, 0]);
    });

    it('a new edit clears the redo list', () => {
        let h = initialHistory(0);
        h = commitHistory(h, set(1), undefined, 0);
        h = undoHistory(h);
        h = commitHistory(h, set(7), undefined, 10);
        expect(redoHistory(h)).toBe(h);
    });
});
