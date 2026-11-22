import React, { useState } from 'react';
import { MenuAnchor, PopMenu } from '../PopMenu';
import { FX_HINTS, FX_LABELS } from '../FxMatrix';
import { PartFx } from '../../parts';

/**
 * "+ Effect": the effects that are off, to turn one on. A PopMenu, so it stays in the window: on a
 * landscape phone the button sits low on the screen and the list opens above it.
 */
export const AddEffectMenu: React.FC<{ off: (keyof PartFx)[]; onAdd: (k: keyof PartFx) => void }> = ({ off, onAdd }) => {
    const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
    if (off.length === 0) return null;
    return (
        <div className="add-effect">
            <button
                className="knob-tile add-tile"
                aria-haspopup="menu"
                aria-expanded={!!anchor}
                // while open, a press here only closes it (the menu's outside-press would close it and the click reopen it)
                onPointerDown={e => anchor && e.stopPropagation()}
                onClick={e => setAnchor(anchor ? null : { rect: e.currentTarget.getBoundingClientRect() })}
            >
                <span className="add-plus" aria-hidden="true">+</span>
                <span className="knob-label">Effect</span>
            </button>
            {anchor && (
                <PopMenu
                    anchor={anchor}
                    label="Add an effect"
                    onClose={() => setAnchor(null)}
                    items={off.map(k => ({ label: FX_LABELS[k], note: FX_HINTS[k], onSelect: () => onAdd(k) }))}
                />
            )}
        </div>
    );
};
