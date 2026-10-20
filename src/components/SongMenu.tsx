import React, { useEffect, useRef, useState } from 'react';
import './SongMenu.css';

interface SongMenuProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onNew: () => void;
    onOpenFile: (file: File) => void;
    onSaveFile: () => void;
    onShare: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

const SongMenu: React.FC<SongMenuProps> = ({ canUndo, canRedo, onUndo, onRedo, onNew, onOpenFile, onSaveFile, onShare }) => {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);

    const run = (action: () => void) => () => {
        setOpen(false);
        action();
    };

    return (
        <div className="song-menu" ref={root}>
            <button className="icon-button" aria-label={`Undo (${mod}Z)`} title={`Undo (${mod}Z)`} disabled={!canUndo} onClick={onUndo}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 3 2 6l3 3M2 6h8a4 4 0 0 1 0 8H7" /></svg>
            </button>
            <button className="icon-button" aria-label={`Redo (${mod}Shift+Z)`} title={`Redo (${mod}Shift+Z)`} disabled={!canRedo} onClick={onRedo}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m11 3 3 3-3 3M14 6H6a4 4 0 0 0 0 8h3" /></svg>
            </button>
            <button className="chip-button song-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
                Song ▾
            </button>
            {open && (
                <div className="song-popover panel" role="menu">
                    <button role="menuitem" onClick={run(onNew)}>New song <span className="kbd">undoable</span></button>
                    <button role="menuitem" onClick={run(() => fileInput.current?.click())}>Open file…</button>
                    <button role="menuitem" onClick={run(onSaveFile)}>Save to file</button>
                    <button role="menuitem" onClick={run(onShare)}>Copy share link</button>
                    <p className="song-note">Your song saves automatically in this browser.</p>
                </div>
            )}
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) onOpenFile(file);
                    e.target.value = '';
                }}
            />
        </div>
    );
};

export default SongMenu;
