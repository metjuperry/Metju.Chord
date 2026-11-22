import React, { useRef } from 'react';
import { MenuItem, PopMenu, useMenuOpener } from './PopMenu';
import './SongMenu.css';

interface SongMenuProps {
    onNew: () => void;
    onOpenFile: (file: File) => void;
    onSaveFile: () => void;
    onShare: () => void;
    onHooktheory: () => void;
    /** Clear all: a clean slate (asks first, undoable). */
    onClearAll: () => void;
    canClearAll: boolean;
    /** The song from before a share link was opened is kept aside: go back to it. */
    onRestoreOwn?: () => void;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

/** Undo and redo (Ctrl/⌘ Z, Shift+Ctrl/⌘ Z), for every song edit. */
export const UndoRedo: React.FC<{ canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }> = ({ canUndo, canRedo, onUndo, onRedo }) => (
    <div className="undo-redo" role="group" aria-label="History">
        <button className="icon-button" aria-label={`Undo (${mod}Z)`} title={`Undo (${mod}Z)`} disabled={!canUndo} onClick={onUndo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 3 2 6l3 3M2 6h8a4 4 0 0 1 0 8H7" /></svg>
        </button>
        <button className="icon-button" aria-label={`Redo (${mod}Shift+Z)`} title={`Redo (${mod}Shift+Z)`} disabled={!canRedo} onClick={onRedo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m11 3 3 3-3 3M14 6H6a4 4 0 0 0 0 8h3" /></svg>
        </button>
    </div>
);

/** The Song menu: new, open, save, share link, Paste from Hooktheory, Clear all. */
const SongMenu: React.FC<SongMenuProps> = ({ onNew, onOpenFile, onSaveFile, onShare, onHooktheory, onClearAll, canClearAll, onRestoreOwn }) => {
    const { anchor, open, close } = useMenuOpener();
    const fileInput = useRef<HTMLInputElement>(null);

    const items: MenuItem[] = [
        ...(onRestoreOwn ? [{ label: 'Back to my song', hint: 'from before the link', onSelect: onRestoreOwn }] : []),
        { label: 'New song', hint: 'undoable', onSelect: onNew },
        { label: 'Open file…', onSelect: () => fileInput.current?.click() },
        { label: 'Save to file', onSelect: onSaveFile },
        { label: 'Copy share link', onSelect: onShare },
        { label: 'Paste from Hooktheory…', onSelect: onHooktheory },
        { label: 'Clear all', hint: 'undoable', danger: true, disabled: !canClearAll, onSelect: onClearAll },
    ];

    return (
        <div className="song-menu">
            <button className="chip-button song-button" aria-haspopup="menu" aria-expanded={!!anchor} aria-label="Song menu: new, open, save, share, paste from Hooktheory" onClick={e => open(e.currentTarget)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 3.5h4l1.2 1.5H12v6.5H2z" /></svg>
                Song menu ▾
            </button>
            {anchor && (
                <PopMenu
                    anchor={anchor}
                    label="Song menu"
                    className="song-menu-pop"
                    align="end"
                    gap={6}
                    items={items}
                    onClose={close}
                    footer={<p className="song-note">Your song saves automatically in this browser.</p>}
                />
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
