import React, { useEffect, useMemo, useRef, useState } from 'react';
import './LearnPanel.css';
import {
    ACCIDENTAL_TIPS, COMBOS, Fit, LEARN_TABS, LearnTab, MELODY_RULES, MelodyRule, PAD_ROLES, PROGRESSIONS, Progression, STICK_ARROWS,
    STICK_SOUNDS, chordNames, chordNumeral, comboDegree, exampleChordClips, fitProgression, keyLabel, progressionClips,
    progressionNumerals, showcaseDegree, squeeze, stickFor,
} from '../learn';
import {
    ChordType, MusicalKey, ScaleId, buildChordMidi, keyPitchClass, noteNames, resolveChord, romanNumeral, spellNoteOctave,
    stickChordType, triadQuality,
} from '../theory';
import { MELODY_STEPS, melodyMidi } from '../parts';
import { TimeSignature, ticksPerStep } from '../song';
import { TICKS_PER_SIXTEENTH } from '../drums';
import { useDialog } from './useDialog';
import { BookIcon } from './TopBar';

/** Something to hear: notes from a tick, for a length, on the chords (the pads' part) or the melody. */
export interface HearEvent {
    midi: number[];
    start: number;
    len: number;
    layer: 'chords' | 'melody';
}

/** How a progression goes in: as it fits, after switching the song's scale, or as the closest in-scale version. */
export type UseHow = 'fit' | 'switch' | 'closest';

interface LearnPanelProps {
    open: boolean;
    /** Desktop: in the right-hand column next to the instrument, not over everything. */
    docked: boolean;
    onClose: () => void;
    tab: LearnTab;
    onTab: (tab: LearnTab) => void;
    songKey: MusicalKey;
    scale: ScaleId;
    ts: TimeSignature;
    /** The pads' octave (chords are heard and written there). */
    octave: number;
    /** The melody part examples play on: its octave and colour. */
    melodyOctave: number;
    melodyColor: string;
    /** The open section, and the sequencer's selected step (a progression can go there). */
    sectionName: string;
    selectedStep: number;
    /** The id of what's being heard, if anything. */
    hearing: string | null;
    onHear: (id: string, events: HearEvent[]) => void;
    onStopHearing: () => void;
    onUse: (p: Progression, how: UseHow, at: number) => void;
    /** The progression just added, while undoing it would take exactly that out. */
    justAdded: string | null;
    onUndoAdd: () => void;
}


/** ▶ / ■: hear something, or stop it. */
const HearButton: React.FC<{ id: string; hearing: string | null; label: string; onHear: () => void; onStop: () => void; text?: string; sub?: string }> = p => {
    const on = p.hearing === p.id;
    return (
        <button
            className={`lp-hear ${on ? 'on' : ''}`}
            aria-pressed={on}
            aria-label={on ? `Stop ${p.label}` : `Hear ${p.label}`}
            title={on ? 'Stop' : 'Hear it'}
            onClick={() => (on ? p.onStop() : p.onHear())}
        >
            <span aria-hidden="true">{on ? '■' : '▶'}</span>{p.text && <span>{p.text}</span>}{p.sub && <span className="lp-hear-sub">{p.sub}</span>}
        </button>
    );
};

const LearnPanel: React.FC<LearnPanelProps> = p => {
    const box = useRef<HTMLDivElement>(null);
    // phones: a modal over everything (focus trapped, Esc); desktop: a panel in the right column
    useDialog(box, p.open && !p.docked, p.onClose);
    useEffect(() => {
        if (!p.open || !p.docked) return;
        const before = document.activeElement as HTMLElement | null;
        box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) p.onClose();
        };
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('keydown', key);
            if (before && document.contains(before)) before.focus();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [p.open, p.docked]);
    // the body scrolls back to the top when the tab changes
    const body = useRef<HTMLDivElement>(null);
    useEffect(() => body.current?.scrollTo?.({ top: 0 }), [p.tab]);
    if (!p.open) return null;

    const tabs = (
        <div className="lp-tabs segmented" role="tablist" aria-label="Learn">
            {LEARN_TABS.map(t => (
                <button
                    key={t.id}
                    id={`lp-tab-${t.id}`}
                    role="tab"
                    aria-selected={p.tab === t.id}
                    aria-pressed={p.tab === t.id}
                    aria-controls="lp-body"
                    tabIndex={p.tab === t.id ? 0 : -1}
                    data-autofocus={p.tab === t.id ? '' : undefined}
                    onClick={() => p.onTab(t.id)}
                    onKeyDown={e => {
                        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                        e.preventDefault();
                        e.stopPropagation();
                        const i = LEARN_TABS.findIndex(x => x.id === p.tab);
                        const next = LEARN_TABS[(i + (e.key === 'ArrowRight' ? 1 : LEARN_TABS.length - 1)) % LEARN_TABS.length].id;
                        p.onTab(next);
                        document.getElementById(`lp-tab-${next}`)?.focus();
                    }}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );

    const panel = (
        <div
            ref={box}
            className={`lp ${p.docked ? 'docked panel' : 'sheet'}`}
            role={p.docked ? 'region' : 'dialog'}
            aria-modal={p.docked ? undefined : true}
            aria-labelledby="lp-title"
        >
            <div className="lp-head">
                <span className="lp-title-row">
                    <BookIcon />
                    <h2 id="lp-title">Learn</h2>
                    <span className="section-note lp-key">in {keyLabel(keyPitchClass(p.songKey), p.songKey, p.scale)}</span>
                </span>
                {tabs}
                <button className="ss-close lp-close" aria-label="Close Learn" title="Close (Esc)" onClick={p.onClose}>×</button>
            </div>
            <div className="lp-body" id="lp-body" ref={body} role="tabpanel" aria-labelledby={`lp-tab-${p.tab}`} tabIndex={-1}>
                {p.tab === 'progressions' && <ProgressionsTab {...p} />}
                {p.tab === 'chords' && <ChordsTab {...p} />}
                {p.tab === 'melody' && <MelodyTab {...p} />}
            </div>
        </div>
    );
    return p.docked ? panel : <div className="lp-backdrop">{panel}</div>;
};

export default LearnPanel;

// ---- Progressions ---------------------------------------------------------------------------------

const ProgressionsTab: React.FC<LearnPanelProps> = p => {
    const beats = p.ts.beats;
    const [where, setWhere] = useState<'start' | 'selected'>(p.selectedStep > 0 ? 'selected' : 'start');
    const at = where === 'selected' && p.selectedStep > 0 ? p.selectedStep : 0;
    const bar = Math.floor(p.selectedStep / beats) + 1;
    const beat = (p.selectedStep % beats) + 1;
    return (
        <>
            <p className="lp-lead">
                Chord loops to start from. Chords are in your key; <b>▶</b> plays one on the pads’ part, <b>Use in song</b> writes it into the open section, <b>{p.sectionName}</b> (one undo step).
            </p>
            {p.selectedStep > 0 && (
                <div className="lp-where">
                    <span className="eyebrow" id="lp-where">Goes in at</span>
                    <div className="segmented" role="group" aria-labelledby="lp-where">
                        <button aria-pressed={where === 'start'} onClick={() => setWhere('start')}>Start</button>
                        <button aria-pressed={where === 'selected'} onClick={() => setWhere('selected')}>Bar {bar}{beat > 1 ? `, beat ${beat}` : ''}</button>
                    </div>
                </div>
            )}
            <div className="lp-cards">
                {PROGRESSIONS.map(prog => <ProgressionCard key={prog.id} prog={prog} at={at} {...p} />)}
            </div>
        </>
    );
};

const ProgressionCard: React.FC<LearnPanelProps & { prog: Progression; at: number }> = p => {
    const { prog, songKey: key, scale } = p;
    const [choosing, setChoosing] = useState(false);
    const fit: Fit = useMemo(() => fitProgression(prog, key, scale), [prog, key, scale]);
    // what it's meant to sound like: as it fits, or in its own scale on the song's tonic
    const shownScale = fit.kind === 'needs' ? fit.needs : scale;
    const names = chordNames(key, shownScale, fit.chords);
    const chips = squeeze(fit.chords.map((ch, i) => ({ ch, name: names[i] })), (a, b) => a.name === b.name);
    const hear = () => {
        const clips = progressionClips(fit.chords, key, shownScale, p.ts, p.octave);
        p.onHear(`prog:${prog.id}`, clips.map(c => ({
            midi: resolveChord(key, { ...c.chord, scale: shownScale }).midi, start: c.start, len: c.len, layer: 'chords',
        })));
    };
    const use = (how: 'fit' | 'switch' | 'closest') => {
        setChoosing(false);
        p.onUse(prog, how, p.at * ticksPerStep(p.ts));
    };
    const here = keyLabel(keyPitchClass(key), key, scale);
    return (
        <article className="lp-card" aria-labelledby={`lp-p-${prog.id}`}>
            <div className="lp-card-head">
                <h3 id={`lp-p-${prog.id}`}>{prog.name}</h3>
                <span className="lp-numerals">{progressionNumerals(prog)}</span>
            </div>
            <div className="lp-chips" aria-label={`Chords: ${names.join(', ')}`}>
                {chips.map(({ item, count, index }) => {
                    const dir = fit.kind === 'needs' ? null : stickFor(item.ch.type, triadQuality(item.ch.degree, scale));
                    return (
                        <span key={index} className="lp-chip">
                            <b>{item.name}</b>
                            {count > 1 && <span className="lp-times">×{count}</span>}
                            {dir && <span className="lp-pad" title={`Pad ${item.ch.degree + 1}${dir !== 'C' ? `, stick ${STICK_ARROWS[dir]}` : ''}`}>{item.ch.degree + 1}{dir !== 'C' ? ` ${STICK_ARROWS[dir]}` : ''}</span>}
                        </span>
                    );
                })}
            </div>
            {fit.kind === 'relative' && <p className="lp-fit">On the relative {isMinor(scale) ? 'major' : 'minor'}: {keyLabel(fit.tonic, key, scale, isMinor(scale) ? 'major' : 'minor')}</p>}
            {fit.kind === 'needs' && <p className="lp-fit needs">Needs {keyLabel(keyPitchClass(key), key, fit.needs)}; your song is in {here}.</p>}
            <dl className="lp-facts">
                <div><dt>Feel</dt><dd>{prog.feel}</dd></div>
                <div><dt>Where</dt><dd>{prog.where}</dd></div>
                <div><dt>Why</dt><dd>{prog.why}</dd></div>
            </dl>
            {prog.note && <p className="section-note lp-note">{prog.note}</p>}
            <div className="lp-actions">
                <HearButton id={`prog:${prog.id}`} hearing={p.hearing} label={prog.name} text="Hear" onHear={hear} onStop={p.onStopHearing} />
                <button
                    className="chip-button lp-use"
                    aria-expanded={fit.kind === 'needs' ? choosing : undefined}
                    onClick={() => (fit.kind === 'needs' ? setChoosing(c => !c) : use('fit'))}
                >
                    Use in song
                </button>
                {p.justAdded === prog.id && (
                    <span className="lp-added" role="status">
                        Added to {p.sectionName} · <button className="lp-link" onClick={p.onUndoAdd}>Undo</button>
                    </span>
                )}
            </div>
            {choosing && fit.kind === 'needs' && (
                <div className="lp-choice" role="group" aria-label={`${prog.name} needs another scale`}>
                    <button className="chip-button" onClick={() => use('switch')}>
                        Switch the song to <b>{keyLabel(keyPitchClass(key), key, fit.needs)}</b> and add it
                    </button>
                    <button className="chip-button" onClick={() => use('closest')}>
                        Add the closest in {here}: <b>{squeeze(chordNames(key, scale, fit.closest)).map(x => (x.count > 1 ? `${x.item} ×${x.count}` : x.item)).join(' ')}</b>
                    </button>
                    <p className="section-note">
                        {fit.changes.map(c => `${c.wanted} isn’t in ${here}, so ${c.got} stands in.`).join(' ')} Switching the scale moves every part with it (undoable).
                    </p>
                    <button className="lp-link" onClick={() => setChoosing(false)}>Cancel</button>
                </div>
            )}
        </article>
    );
};

const isMinor = (scale: ScaleId) => triadQuality(0, scale) !== 'major';

// ---- Chords -----------------------------------------------------------------------------------------

const ChordsTab: React.FC<LearnPanelProps> = p => {
    const { songKey: key, scale } = p;
    const [family, setFamily] = useState<'major' | 'minor'>(isMinor(scale) ? 'minor' : 'major');
    const one = (id: string, list: { degree: number; type: ChordType; scale: ScaleId }[]) => () =>
        p.onHear(id, list.map((c, i) => ({
            midi: resolveChord(key, { degree: c.degree, type: c.type, inversion: 0, octave: p.octave, scale: c.scale }).midi,
            start: i * 192, len: 192, layer: 'chords' as const,
        })));
    const typeOn = (degree: number, dir: Parameters<typeof stickChordType>[0], sc: ScaleId) => stickChordType(dir, triadQuality(degree, sc));
    const name = (degree: number, type: ChordType, sc: ScaleId) => resolveChord(key, { degree, type, inversion: 0, octave: 4, scale: sc }).name.symbol;
    const padScale: ScaleId = family === 'major' ? 'major' : 'minor';
    const plain = scale === padScale;
    return (
        <>
            <p className="lp-lead">What chords tend to sound like. These are <b>common associations, not rules</b>: context, voicing, tempo and the instrument all change the feel. <b>▶</b> plays it in your key.</p>

            <h3 className="lp-h">The stick: chord colour</h3>
            <div className="lp-cards lp-grid">
                {STICK_SOUNDS.map(s => {
                    const shows = s.on.map(on => showcaseDegree(on, scale)).filter((d): d is number => d !== null)
                        .filter((d, i, all) => all.indexOf(d) === i);
                    return (
                        <article key={s.dir} className="lp-card lp-small" aria-labelledby={`lp-s-${s.dir}`}>
                            <div className="lp-card-head">
                                <span className="lp-arrow" aria-hidden="true">{STICK_ARROWS[s.dir]}</span>
                                <h3 id={`lp-s-${s.dir}`}>{s.label}</h3>
                            </div>
                            <p className="lp-mood">{s.mood}{s.minorMood && <><br />{s.minorMood}</>}</p>
                            <p className="lp-text">{s.text}</p>
                            <div className="lp-chips">
                                {shows.map(d => {
                                    const t = typeOn(d, s.dir, scale);
                                    const nm = name(d, t, scale);
                                    return (
                                        <HearButton
                                            key={d}
                                            id={`stick:${s.dir}:${d}`}
                                            hearing={p.hearing}
                                            label={`${nm}, pad ${d + 1} ${s.label}`}
                                            text={nm}
                                            sub={`pad ${d + 1}`}
                                            onHear={one(`stick:${s.dir}:${d}`, [{ degree: d, type: t, scale }])}
                                            onStop={p.onStopHearing}
                                        />
                                    );
                                })}
                            </div>
                        </article>
                    );
                })}
            </div>

            <h3 className="lp-h">The pads: what each does in a key</h3>
            <div className="lp-where">
                <div className="segmented" role="group" aria-label="Major or minor key">
                    <button aria-pressed={family === 'major'} onClick={() => setFamily('major')}>Major key</button>
                    <button aria-pressed={family === 'minor'} onClick={() => setFamily('minor')}>Minor key</button>
                </div>
                <span className="section-note">
                    {keyLabel(keyPitchClass(key), key, padScale)}
                    {!plain && (family === (isMinor(scale) ? 'minor' : 'major')) ? ` · your ${keyLabel(keyPitchClass(key), key, scale)} pads differ a little` : ''}
                </span>
            </div>
            <ul className="lp-pads">
                {PAD_ROLES[family].map((role, d) => {
                    const variants: { type: ChordType; label: string }[] = [{ type: 'triad', label: romanNumeral(d, padScale) }];
                    // minor v: also the borrowed major V (stick ↑)
                    if (family === 'minor' && d === 4) variants.push({ type: 'flip', label: 'V' });
                    return (
                        <li key={d} className="lp-pad-row">
                            <span className="lp-pad-num" aria-hidden="true">{d + 1}</span>
                            <span className="lp-pad-text"><b>{variants.map(v => v.label).join(' / ')}</b> <span>{role}</span></span>
                            <span className="lp-pad-hear">
                                {variants.map(v => {
                                    const nm = name(d, v.type, padScale);
                                    const id = `pad:${family}:${d}:${v.type}`;
                                    return <HearButton key={v.type} id={id} hearing={p.hearing} label={`${v.label}, ${nm}`} text={nm} onHear={one(id, [{ degree: d, type: v.type, scale: padScale }])} onStop={p.onStopHearing} />;
                                })}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <h3 className="lp-h">Combining them</h3>
            <p className="lp-text">A pad’s role plus the stick’s colour gives the chord its character:</p>
            <ul className="lp-combos">
                {COMBOS.map((cb, i) => {
                    const d = comboDegree(cb.pad, scale);
                    const t = typeOn(d, cb.dir, scale);
                    const nm = name(d, t, scale);
                    const list = [{ degree: d, type: t, scale }];
                    let then = '';
                    if (cb.then) {
                        const d2 = comboDegree(cb.then.pad, scale);
                        const t2 = typeOn(d2, cb.then.dir, scale);
                        list.push({ degree: d2, type: t2, scale });
                        then = name(d2, t2, scale);
                    }
                    const id = `combo:${i}`;
                    return (
                        <li key={i} className="lp-combo">
                            <p>
                                <b className="lp-combo-name">{nm}</b> = {cb.sum} → <b>{cb.result}</b>
                                <span className="lp-pad"> pad {d + 1} {STICK_ARROWS[cb.dir]}</span>
                            </p>
                            <HearButton id={id} hearing={p.hearing} label={then ? `${nm} then ${then}` : nm} text={then ? `${nm} → ${then}` : nm} onHear={one(id, list)} onStop={p.onStopHearing} />
                        </li>
                    );
                })}
            </ul>
            <p className="section-note lp-foot">Same chord, different song: a slow Am9 on strings is tender, a fast one on a synth can be cool and driving. Trust your ears over the words.</p>
        </>
    );
};

// ---- Melody -----------------------------------------------------------------------------------------

const MelodyTab: React.FC<LearnPanelProps> = p => (
    <>
        <p className="lp-lead">Short rules of thumb for writing a tune over your chords. Each example is in your key; <b>▶</b> plays it over its chords.</p>
        <div className="lp-cards">
            {MELODY_RULES.map((r, i) => <RuleCard key={r.id} rule={r} n={i + 1} {...p} />)}
        </div>
        <h3 className="lp-h">♭ and ♯, sparingly</h3>
        <p className="lp-text">
            A note outside the scale stands out, which is the point: one is colour, many sound like a wrong key. Pick a note in the melody grid and use <b>♭ ♮ ♯</b>, or push the stick <b>←</b> / <b>→</b> in Notes mode.
            Put them on weak beats or on a chord that contains them, and step from them to a scale note.
        </p>
        <div className="lp-cards">
            {ACCIDENTAL_TIPS.map(r => <RuleCard key={r.id} rule={r} {...p} />)}
        </div>
    </>
);

const RuleCard: React.FC<LearnPanelProps & { rule: MelodyRule; n?: number }> = p => {
    const { rule, songKey: key, scale } = p;
    const ex = rule.example;
    const chordClips = exampleChordClips(ex);
    const id = `mel:${rule.id}`;
    const hear = () => {
        const backing = progressionClips(ex.chords, key, scale, { beats: 4, unit: 4 }, 3);
        p.onHear(id, [
            ...backing.map(c => ({ midi: resolveChord(key, { ...c.chord, scale }).midi, start: c.start, len: c.len, layer: 'chords' as const })),
            ...ex.notes.map(nt => ({ midi: [melodyMidi({ octave: p.melodyOctave }, { key, scale }, nt.step, nt.acc ?? 0)], start: nt.start, len: nt.len, layer: 'melody' as const })),
        ]);
    };
    return (
        <article className="lp-card" aria-labelledby={`lp-m-${rule.id}`}>
            <div className="lp-card-head">
                {p.n && <span className="lp-num" aria-hidden="true">{p.n}</span>}
                <h3 id={`lp-m-${rule.id}`}>{rule.title}</h3>
            </div>
            <p className="lp-text">{rule.text}</p>
            <MiniGrid rule={rule} songKey={key} scale={scale} octave={p.melodyOctave} color={p.melodyColor} chordClips={chordClips} />
            <div className="lp-actions">
                <HearButton id={id} hearing={p.hearing} label={`example: ${rule.title}`} text="Hear" onHear={hear} onStop={p.onStopHearing} />
                <span className="lp-chips lp-ex-chords" aria-label="Chords">
                    {chordClips.map((c, i) => (
                        <span key={i} className="lp-chip small">{chordNumeral(scale, c)} <b>{resolveChord(key, { degree: c.degree, type: c.type, inversion: 0, octave: 4, scale }).name.symbol}</b></span>
                    ))}
                </span>
            </div>
            <p className="lp-try"><b>Try this:</b> {rule.tryThis}</p>
        </article>
    );
};

/** The example as a tiny read-only melody grid: scale rows (high at the top), 1/16 columns, chord tones shaded. */
const MiniGrid: React.FC<{
    rule: MelodyRule; songKey: MusicalKey; scale: ScaleId; octave: number; color: string;
    chordClips: { start: number; len: number; degree: number; type: ChordType }[];
}> = ({ rule, songKey: key, scale, octave, color, chordClips }) => {
    const ex = rule.example;
    const cols = ex.bars * 16;
    const steps = ex.notes.map(n => n.step);
    const lo = Math.max(0, Math.min(...steps) - 1);
    const hi = Math.min(MELODY_STEPS - 1, Math.max(...steps) + 1);
    const names = noteNames(key, scale);
    const kp = keyPitchClass(key);
    const rows = [];
    for (let s = hi; s >= lo; s--) rows.push(s);
    const chordAt = (col: number) => {
        const tick = col * TICKS_PER_SIXTEENTH;
        const ch = chordClips.find(c => tick >= c.start && tick < c.start + c.len);
        return ch ? new Set(buildChordMidi(kp, ch.degree, ch.type, 4, scale).map(m => m % 12)) : new Set<number>();
    };
    const shade = Array.from({ length: cols }, (_, c) => chordAt(c));
    const cell = new Map<string, { head: boolean; acc: number }>();
    for (const n of ex.notes) {
        const a = n.start / TICKS_PER_SIXTEENTH;
        const b = (n.start + n.len) / TICKS_PER_SIXTEENTH;
        for (let c = a; c < b; c++) cell.set(`${n.step}:${c}`, { head: c === a, acc: n.acc ?? 0 });
    }
    const spoken = ex.notes.map(n => spellNoteOctave(names, melodyMidi({ octave }, { key, scale }, n.step), n.acc ?? 0)).join(' ');
    return (
        <div className="lp-grid-wrap" role="img" aria-label={`Example melody: ${spoken}`} style={{ '--track': color, '--cols': cols } as React.CSSProperties}>
            {rows.map(s => {
                const midi = melodyMidi({ octave }, { key, scale }, s);
                const pc = midi % 12;
                return (
                    <div key={s} className={`lp-g-row ${s % 7 === 0 ? 'tonic' : ''}`}>
                        <span className="lp-g-name">{names[pc]}{Math.floor(midi / 12) - 1}</span>
                        {Array.from({ length: cols }, (_, c) => {
                            const note = cell.get(`${s}:${c}`);
                            const cls = [
                                'lp-g-cell',
                                c % 4 === 0 ? 'beat' : '',
                                c % 16 === 0 ? 'bar' : '',
                                shade[c].has(pc) ? 'tone' : '',
                                note ? 'note' : '',
                                note?.head ? 'head' : '',
                            ].filter(Boolean).join(' ');
                            return <span key={c} className={cls}>{note?.head && note.acc ? (note.acc > 0 ? '♯' : '♭') : ''}</span>;
                        })}
                    </div>
                );
            })}
        </div>
    );
};
