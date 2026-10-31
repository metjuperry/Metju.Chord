import React, { useEffect, useRef, useState } from 'react';
import { Section, TimeSignature } from '../song';
import { sectionBars } from '../sections';

interface SectionSwitcherProps {
    sections: Section[];
    openId: string;
    timeSignature: TimeSignature;
    /** How many times each section is in the chain. */
    counts: { [id: string]: number };
    /** The section waiting for the next bar line (Loop mode), shown as NEXT. */
    queued: string | null;
    onBack: () => void;
    onPick: (id: string) => void;
}

const Chevron: React.FC<{ dir: 'left' | 'right' | 'down' }> = ({ dir }) => (
    <svg width={dir === 'down' ? 10 : 14} height={dir === 'down' ? 10 : 14} viewBox={dir === 'down' ? '0 0 10 10' : '0 0 14 14'} fill="none" stroke="currentColor" strokeWidth={dir === 'down' ? 1.6 : 1.8} aria-hidden="true">
        <path d={dir === 'left' ? 'M8.5 3L4.5 7l4 4' : dir === 'right' ? 'M5.5 3l4 4-4 4' : 'M2 3.5l3 3 3-3'} />
    </svg>
);

/** "‹ Song" back to the song view, and ‹ [V · Verse · 2/6 ▾] › to step through or pick sections. */
const SectionSwitcher: React.FC<SectionSwitcherProps> = ({ sections, openId, timeSignature, counts, queued, onBack, onPick }) => {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const i = Math.max(0, sections.findIndex(s => s.id === openId));
    const cur = sections[i];
    useEffect(() => {
        if (!open) return;
        root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
        const close = (e: PointerEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent) {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    const list = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
                    const k = list.indexOf(document.activeElement as HTMLElement);
                    list[(k + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
                    e.preventDefault();
                }
            } else if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);
    return (
        <div className="section-switcher" ref={root}>
            <button className="ss-back" onClick={onBack} aria-label="Back to the song: sections and chain">
                <Chevron dir="left" />Song
            </button>
            <button className="ss-arrow" aria-label="Previous section" disabled={i === 0} onClick={() => onPick(sections[i - 1].id)}><Chevron dir="left" /></button>
            <button className="ss-current" aria-haspopup="listbox" aria-expanded={open} aria-label={`Section ${cur.name}, ${i + 1} of ${sections.length}. Choose a section`} onClick={() => setOpen(o => !o)}>
                <span className="sec-badge">{cur.letter}</span>
                <span className="ss-name">{cur.name}</span>
                <span className="ss-pos">{i + 1}/{sections.length}</span>
                <Chevron dir="down" />
            </button>
            <button className="ss-arrow" aria-label="Next section" disabled={i >= sections.length - 1} onClick={() => onPick(sections[i + 1].id)}><Chevron dir="right" /></button>
            {open && (
                <div className="song-popover ss-list panel" role="listbox" aria-label="Sections">
                    {sections.map(s => (
                        <button
                            key={s.id}
                            role="option"
                            aria-selected={s.id === openId}
                            onClick={() => {
                                setOpen(false);
                                onPick(s.id);
                            }}
                        >
                            <span className="sec-badge">{s.letter}</span>
                            <span className="ss-name">{s.name}</span>
                            <span className="kbd">{queued === s.id ? 'NEXT · ' : ''}{sectionBars(timeSignature, s)} bars{counts[s.id] ? ` · ×${counts[s.id]}` : ' · not in chain'}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SectionSwitcher;
