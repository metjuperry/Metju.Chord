import React, { useEffect, useMemo, useRef, useState } from 'react';
import './HelpDialog.css';
import './HooktheoryDialog.css';
import { HtClip, ImportOptions, ImportSummary, KeyMode, importHooktheory, keyChoice, parseHooktheory } from '../hooktheory';
import { Song, ticksPerStep } from '../song';

interface HooktheoryDialogProps {
    open: boolean;
    song: Song;
    /** The sequencer's selected step: the paste can go there instead of at the top. */
    selectedStep: number;
    /** Octave for imported chords (the pads' octave). */
    chordOctave: number;
    onClose: () => void;
    onImport: (clip: HtClip, options: ImportOptions, summary: ImportSummary) => void;
}

const canRead = () => typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Paste from Hooktheory: read the JSON Hookpad puts on the clipboard (straight from the clipboard
 * where the browser allows it, otherwise pasted into the box), show what it will add, and import it.
 */
const HooktheoryDialog: React.FC<HooktheoryDialogProps> = ({ open, song, selectedStep, chordOctave, onClose, onImport }) => {
    const [text, setText] = useState('');
    const [readNote, setReadNote] = useState<string | null>(null);
    const [keyMode, setKeyMode] = useState<KeyMode>('paste');
    const [where, setWhere] = useState<'start' | 'selected'>('start');
    const [halfTime, setHalfTime] = useState(false);
    const [withNotes, setWithNotes] = useState(true);
    const [withChords, setWithChords] = useState(true);
    const box = useRef<HTMLTextAreaElement>(null);

    // a fresh dialog every time it opens; read the clipboard straight away only where that's already allowed
    useEffect(() => {
        if (!open) return;
        setText('');
        setReadNote(null);
        setKeyMode('paste');
        setWhere(selectedStep > 0 ? 'selected' : 'start');
        setHalfTime(false);
        setWithNotes(true);
        setWithChords(true);
        box.current?.focus();
        let live = true;
        navigator.permissions?.query({ name: 'clipboard-read' as PermissionName })
            .then(p => (p.state === 'granted' && canRead() ? navigator.clipboard.readText() : null))
            .then(t => {
                if (live && t && parseHooktheory(t).ok) setText(t);
            })
            .catch(() => undefined);
        return () => {
            live = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const parsed = useMemo(() => (text.trim() ? parseHooktheory(text) : null), [text]);
    const clip = parsed?.ok ? parsed.clip : null;
    const choice = clip ? keyChoice(clip, song) : null;
    const T = ticksPerStep(song.timeSignature);
    const options: ImportOptions = {
        keyMode: choice?.same ? 'paste' : keyMode,
        at: where === 'selected' ? selectedStep * T : 0,
        halfTime,
        notes: withNotes,
        chords: withChords,
        chordOctave,
    };
    const result = useMemo(() => (clip ? importHooktheory(song, clip, options) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [clip, song, options.keyMode, options.at, halfTime, withNotes, withChords, chordOctave]);
    const summary = result?.summary;
    const hasNotes = !!clip?.notes.length;
    const hasChords = !!clip?.chords.some(c => !c.rest);

    if (!open) return null;

    const readClipboard = async () => {
        try {
            const t = await navigator.clipboard.readText();
            if (!t.trim()) setReadNote('The clipboard is empty. Copy the notes in Hookpad first.');
            else {
                setText(t);
                setReadNote(null);
            }
        } catch {
            setReadNote('This browser didn’t let the app read the clipboard. Paste into the box instead.');
            box.current?.focus();
        }
    };

    const confirm = () => {
        if (clip && summary && !summary.problem) onImport(clip, options, summary);
    };

    const bar = Math.floor(selectedStep / song.timeSignature.beats) + 1;
    const beatInBar = (selectedStep % song.timeSignature.beats) + 1;

    return (
        <div className="help-backdrop ht-backdrop" onClick={onClose}>
            <div
                className="help-dialog ht-dialog panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ht-title"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        onClose();
                    }
                }}
            >
                <div className="help-head">
                    <h2 id="ht-title">Paste from Hooktheory</h2>
                    <button className="icon-button" aria-label="Close" onClick={onClose}>✕</button>
                </div>
                <p className="ht-lead">
                    In Hookpad, select notes (and chords) and copy them. Then paste here: they’re added to this song as Melody parts and chords.
                </p>

                <div className="ht-paste">
                    <textarea
                        ref={box}
                        className="ht-box"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Paste here (Ctrl/⌘ V, or tap and hold → Paste)"
                        aria-label="Hooktheory clipboard data"
                        aria-describedby="ht-status"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        autoComplete="off"
                        rows={3}
                    />
                    <div className="ht-paste-row">
                        {canRead() && <button className="chip-button" onClick={readClipboard}>Paste from clipboard</button>}
                        {text && <button className="chip-button" onClick={() => { setText(''); box.current?.focus(); }}>Clear</button>}
                    </div>
                </div>

                <p id="ht-status" className={`ht-status ${parsed && !parsed.ok ? 'bad' : ''}`} role="status" aria-live="polite">
                    {readNote ?? (parsed && !parsed.ok ? parsed.error : clip ? `Read ${[hasNotes && plural(clip.notes.length, 'note'), hasChords && plural(clip.chords.filter(c => !c.rest).length, 'chord')].filter(Boolean).join(' and ')} in ${choice!.paste.label}.` : 'Waiting for a paste.')}
                </p>

                {clip && summary && choice && (
                    <>
                        {hasNotes && hasChords && (
                            <div className="ht-option">
                                <h3 className="eyebrow" id="ht-what">Import</h3>
                                <div className="segmented" role="group" aria-labelledby="ht-what">
                                    <button aria-pressed={withNotes} onClick={() => setWithNotes(v => !v)}>Notes</button>
                                    <button aria-pressed={withChords} onClick={() => setWithChords(v => !v)}>Chords</button>
                                </div>
                            </div>
                        )}

                        {!choice.same && (
                            <div className="ht-option">
                                <h3 className="eyebrow" id="ht-key">Key</h3>
                                <div className="segmented" role="group" aria-labelledby="ht-key">
                                    <button aria-pressed={keyMode === 'paste'} onClick={() => setKeyMode('paste')}>Use {choice.paste.label}</button>
                                    <button aria-pressed={keyMode === 'song'} onClick={() => setKeyMode('song')}>Keep {choice.song.label}</button>
                                </div>
                                <p className="section-note">
                                    {keyMode === 'paste'
                                        ? `The song changes to ${choice.paste.label}; its chords and parts move with it.`
                                        : choice.sharesNotes
                                            ? `${choice.song.label} has the same notes as ${choice.paste.label}, so nothing needs to move.`
                                            : `Each note keeps its scale degree, moved into ${choice.song.label} (the paste’s 1 becomes the song’s 1).`}
                                </p>
                            </div>
                        )}

                        <div className="ht-option">
                            <h3 className="eyebrow" id="ht-where">Where</h3>
                            {selectedStep > 0 ? (
                                <div className="segmented" role="group" aria-labelledby="ht-where">
                                    <button aria-pressed={where === 'start'} onClick={() => setWhere('start')}>Start of the song</button>
                                    <button aria-pressed={where === 'selected'} onClick={() => setWhere('selected')}>
                                        Selected beat (bar {bar}{beatInBar > 1 ? `, beat ${beatInBar}` : ''})
                                    </button>
                                </div>
                            ) : (
                                <p className="section-note">At the start of the song. To paste further on, close this, select a beat in the sequencer and paste again.</p>
                            )}
                        </div>

                        <div className="ht-option">
                            <h3 className="eyebrow" id="ht-time">Timing</h3>
                            <div className="segmented" role="group" aria-labelledby="ht-time">
                                <button aria-pressed={!halfTime} onClick={() => setHalfTime(false)}>1 beat = 1/4</button>
                                <button aria-pressed={halfTime} onClick={() => setHalfTime(true)}>Half time (1 beat = 1/2)</button>
                            </div>
                        </div>

                        <section className="ht-preview" aria-label="What will be added">
                            <h3 className="eyebrow">Adds</h3>
                            <p className="ht-totals">
                                {[summary.notes && plural(summary.notes, 'note'), summary.chords && plural(summary.chords, 'chord')].filter(Boolean).join(', ') || 'Nothing'}
                                {' · '}{plural(summary.bars, 'bar')} from bar {summary.startBar} · {summary.target.label}
                            </p>
                            <ul className="ht-parts">
                                {summary.parts.map(p => (
                                    <li key={p.id}>
                                        <span className="ht-swatch" style={{ background: p.color }} aria-hidden="true" />
                                        <b>{p.name}</b> · octave {p.octave} · {plural(p.notes, 'note')}{p.reused ? ' (fills the empty part)' : ' (new part)'}
                                    </li>
                                ))}
                                {summary.chords > 0 && (
                                    <li>
                                        <span className="ht-swatch chord" aria-hidden="true" />
                                        <b>Chord row</b> · {plural(summary.chords, 'chord')}
                                        {summary.replaced ? ` (replaces ${plural(summary.replaced, 'chord')} in that stretch)` : ''}
                                    </li>
                                )}
                            </ul>
                            {summary.warnings.length > 0 && (
                                <ul className="ht-warnings" aria-label="Changes made to fit">
                                    {summary.warnings.map(w => (
                                        <li key={w.text}>
                                            {w.text}
                                            {w.details && <ul>{w.details.map(d => <li key={d}>{d}</li>)}</ul>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {summary.problem && <p className="ht-problem" role="alert">{summary.problem}</p>}
                        </section>
                    </>
                )}

                <div className="ht-actions">
                    <button className="chip-button" onClick={onClose}>Cancel</button>
                    <button className="chip-button ht-go" disabled={!summary || !!summary.problem} onClick={confirm}>
                        Add to song
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HooktheoryDialog;
