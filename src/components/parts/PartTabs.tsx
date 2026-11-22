import React, { useRef } from 'react';
import { PartsTab } from '../../song';
import { TAB_LABELS } from './labels';

/**
 * The part's sub-tabs on a phone: a real tablist (arrow keys, Home, End move and pick; only the picked
 * tab is in the Tab order).
 */
export const PartTabs: React.FC<{ id: string; tabs: PartsTab[]; tab: PartsTab; onTab: (t: PartsTab) => void }> = ({ id, tabs, tab, onTab }) => {
    const ref = useRef<HTMLDivElement>(null);
    const go = (t: PartsTab) => {
        onTab(t);
        ref.current?.querySelector<HTMLElement>(`#pt-${id}-${t}`)?.focus();
    };
    return (
        <div className="pd-tabs segmented small-seg" role="tablist" aria-label="Part settings" ref={ref}>
            {tabs.map(t => (
                <button
                    key={t}
                    role="tab"
                    id={`pt-${id}-${t}`}
                    aria-selected={t === tab}
                    aria-pressed={t === tab}
                    aria-controls={`pp-${id}`}
                    tabIndex={t === tab ? 0 : -1}
                    onClick={() => onTab(t)}
                    onKeyDown={e => {
                        const i = tabs.indexOf(tab);
                        const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
                            : e.key === 'ArrowLeft' ? tabs[(i + tabs.length - 1) % tabs.length]
                                : e.key === 'Home' ? tabs[0]
                                    : e.key === 'End' ? tabs[tabs.length - 1] : null;
                        if (!next) return;
                        e.preventDefault();
                        e.stopPropagation();
                        go(next);
                    }}
                >
                    {TAB_LABELS[t]}
                </button>
            ))}
        </div>
    );
};
