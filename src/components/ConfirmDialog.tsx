import React, { useRef } from 'react';
import { useDialog } from './useDialog';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    children: React.ReactNode;
    /** The button that does it, e.g. "Clear all". */
    confirm: string;
    onConfirm: () => void;
    onCancel: () => void;
}

/** "Are you sure?" for big edits. Cancel has the focus, so Enter or Esc never does the big thing by accident. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = p => {
    const box = useRef<HTMLDivElement>(null);
    useDialog(box, p.open, p.onCancel);
    if (!p.open) return null;
    return (
        <div className="help-backdrop" onClick={p.onCancel}>
            <div
                ref={box}
                className="help-dialog panel confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-body"
                onClick={e => e.stopPropagation()}
            >
                <h2 id="confirm-title" className="confirm-title">{p.title}</h2>
                <div id="confirm-body" className="confirm-body">{p.children}</div>
                <div className="confirm-buttons">
                    <button className="chip-button" data-autofocus onClick={p.onCancel}>Cancel</button>
                    <button className="chip-button confirm-danger" onClick={p.onConfirm}>{p.confirm}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
