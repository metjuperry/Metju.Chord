import React, { createContext, useContext } from 'react';

// ---- a section's own sound: a small mark on what it sets its own way ----------------------------------

/** While Song has a section open: the open section's name and what it sets its own way for this part. */
export const OwnContext = createContext<{ section: string; keys: Set<string> } | null>(null);

/**
 * A small dot on a control whose value the open section sets its own way ('instrument', 'fx.reverb'…),
 * on the picked option only (`when`). Read out as "(Chorus only)".
 */
export const Own: React.FC<{ k: string; when?: boolean }> = ({ k, when = true }) => {
    const own = useContext(OwnContext);
    if (!when || !own?.keys.has(k)) return null;
    return (
        <span className="own-dot" title={`Set for ${own.section} only`}>
            <span className="visually-hidden"> ({own.section} only)</span>
        </span>
    );
};

/** Parts' scope: "Chorus only" while Song has a section open, "Whole song" otherwise; a tap switches. */
export const ScopeChip: React.FC<{ name: string; only: boolean; onToggle: () => void }> = ({ name, only, onToggle }) => (
    <button
        className={`chip-button scope-chip ${only ? 'only' : ''}`}
        aria-label={only ? `Editing ${name} only. Switch to the whole song` : `Editing the whole song. Switch to ${name} only`}
        title={only ? `Changes here are for ${name} only · tap for the whole song` : `Changes here reach every section · tap for ${name} only`}
        onClick={onToggle}
    >
        {only ? (<><span className="scope-name">{name}</span>&nbsp;only</>) : 'Whole song'}
    </button>
);
