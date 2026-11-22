import React from 'react';
import { PopMenu, useMenuOpener } from '../PopMenu';
import { FX_HINTS, FX_LABELS } from '../FxMatrix';
import { PartFx } from '../../parts';

/**
 * "+ Effect": the effects that are off, to turn one on. A PopMenu, so it stays in the window: on a
 * landscape phone the button sits low on the screen and the list opens above it.
 */
export const AddEffectMenu: React.FC<{ off: (keyof PartFx)[]; onAdd: (k: keyof PartFx) => void }> = ({ off, onAdd }) => {
    const { anchor, open, close } = useMenuOpener();
    if (off.length === 0) return null;
    return (
        <div className="add-effect">
            <button
                className="knob-tile add-tile"
                aria-haspopup="menu"
                aria-expanded={!!anchor}
                onClick={e => open(e.currentTarget)}
            >
                <span className="add-plus" aria-hidden="true">+</span>
                <span className="knob-label">Effect</span>
            </button>
            {anchor && (
                <PopMenu
                    anchor={anchor}
                    label="Add an effect"
                    onClose={close}
                    items={off.map(k => ({ label: FX_LABELS[k], note: FX_HINTS[k], onSelect: () => onAdd(k) }))}
                />
            )}
        </div>
    );
};
