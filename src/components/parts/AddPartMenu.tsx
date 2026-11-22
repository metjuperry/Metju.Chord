import React, { useState } from 'react';
import { MenuAnchor, PopMenu } from '../PopMenu';
import { MAX_PARTS, PART_LABELS, PartKind } from '../../parts';
import { KIND_HINT } from './labels';

/**
 * "+ Part": a short menu of part kinds. A PopMenu, so it stays in the window (inside the parts list
 * it was cut off on a phone).
 */
export const AddPartMenu: React.FC<{ full: boolean; onAdd: (kind: PartKind) => void; short?: boolean }> = ({ full, onAdd, short }) => {
    const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
    return (
        <div className="add-part">
            <button
                className="chip-button small-chip"
                aria-haspopup="menu"
                aria-expanded={!!anchor}
                disabled={full}
                title={full ? `Up to ${MAX_PARTS} parts` : 'Add a part'}
                aria-label={short ? 'Add a part' : undefined}
                // while open, a press here only closes it (the menu's outside-press would close it and the click reopen it)
                onPointerDown={e => anchor && e.stopPropagation()}
                onClick={e => setAnchor(anchor ? null : { rect: e.currentTarget.getBoundingClientRect() })}
            >
                {short ? '+' : '+ Part'}
            </button>
            {anchor && (
                <PopMenu
                    anchor={anchor}
                    label="Add a part"
                    onClose={() => setAnchor(null)}
                    items={(['chords', 'bass', 'melody', 'voice', 'drums'] as PartKind[]).map(k => ({ label: PART_LABELS[k], note: KIND_HINT[k], onSelect: () => onAdd(k) }))}
                />
            )}
        </div>
    );
};
