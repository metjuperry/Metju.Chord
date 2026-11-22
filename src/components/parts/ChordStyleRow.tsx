import React from 'react';
import { STRUM_PATTERNS, STRUM_SPREAD_LABELS } from '../../strum';
import { ArpRate } from '../../audio/engine';
import { PlayMode, STRUM_DIRECTIONS, STRUM_SPREADS } from '../../parts';
import { Own } from './Own';
import { ARP_PATTERNS, ARP_RATES, ChordStyle, NOTE_LENGTHS, STRUM_HINTS, STRUM_LABELS, ms } from './labels';

/** A strum pattern's strokes as a row of 8 cells: ↓ down, ↑ up, a dot for a rest; beats are marked. */
const StrumPreview: React.FC<{ strokes: string }> = ({ strokes }) => (
    <span className="strum-preview" aria-hidden="true">
        {strokes.split('').map((c, i) => (
            <span key={i} className={`sp-cell ${i % 2 === 0 ? 'beat' : ''} ${c === '-' ? 'rest' : ''}`}>{c === 'D' ? '↓' : c === 'U' ? '↑' : '·'}</span>
        ))}
    </span>
);

/** Play as Chord / Strum / Arp, and that mode's options inline. */
export const ChordStyleRow: React.FC<{ style: ChordStyle; onChange: (patch: Partial<ChordStyle>) => void }> = ({ style, onChange }) => {
    const lengths = NOTE_LENGTHS.includes(style.noteLength) ? NOTE_LENGTHS : [...NOTE_LENGTHS, style.noteLength].sort((a, b) => a - b);
    return (
        <div className="pd-block">
            <span className="pd-label">Play as</span>
            <div className="pd-style">
                <div className="segmented small-seg" role="group" aria-label="Play as">
                    {(['Chord', 'Strum', 'Arp'] as PlayMode[]).map(m => (
                        <button key={m} aria-pressed={style.playMode === m} onClick={() => onChange({ playMode: m })}>{m}<Own k="playMode" when={style.playMode === m} /></button>
                    ))}
                </div>
                {style.playMode === 'Chord' && <span className="section-note">chords ring for as long as they're held</span>}
                {style.playMode === 'Strum' && (
                    <>
                        <div className="bass-row strum-row" role="radiogroup" aria-label="Strum pattern">
                            {STRUM_PATTERNS.map(p => (
                                <button key={p.id} role="radio" aria-checked={style.strumPattern === p.id} className="bass-tile strum-tile" title={p.hint} onClick={() => onChange({ strumPattern: p.id })}>
                                    <StrumPreview strokes={p.strokes} />
                                    <span>{p.label}</span>
                                    <Own k="strumPattern" when={style.strumPattern === p.id} />
                                </button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label="Strum speed">
                            {STRUM_SPREADS.map((sp, i) => (
                                <button key={sp} aria-pressed={Math.abs(style.strumSpread - sp) < 0.001} title={`${ms(sp)} from the low note to the high one`} onClick={() => onChange({ strumSpread: sp })}>{STRUM_SPREAD_LABELS[i]}<Own k="strumSpread" when={Math.abs(style.strumSpread - sp) < 0.001} /></button>
                            ))}
                        </div>
                        <div className="segmented small-seg" role="group" aria-label={style.strumPattern === 'once' ? 'Strum direction' : 'Strum direction on the pads'}>
                            {STRUM_DIRECTIONS.map(d => (
                                <button key={d} aria-pressed={style.strumDirection === d} title={STRUM_HINTS[d]} onClick={() => onChange({ strumDirection: d })}>{STRUM_LABELS[d]}<Own k="strumDirection" when={style.strumDirection === d} /></button>
                            ))}
                        </div>
                        <span className="section-note pd-hint">
                            {STRUM_PATTERNS.find(p => p.id === style.strumPattern)?.label}: {STRUM_PATTERNS.find(p => p.id === style.strumPattern)?.hint}.
                            {style.strumPattern === 'once' ? ' The direction sets which way it rolls.' : ' Up strokes are lighter and catch the top notes; the pads play one stroke, in the direction set here.'}
                        </span>
                    </>
                )}
                {style.playMode === 'Arp' && (
                    <>
                        <div className="segmented small-seg" role="group" aria-label="Arp pattern">
                            {ARP_PATTERNS.map(p => (
                                <button key={p.id} aria-pressed={style.arpPattern === p.id} onClick={() => onChange({ arpPattern: p.id })}>{p.label}<Own k="arpPattern" when={style.arpPattern === p.id} /></button>
                            ))}
                        </div>
                        <label className="pd-select">
                            <span>Rate<Own k="arpRate" /></span>
                            <select value={style.arpRate} onChange={e => onChange({ arpRate: e.target.value as ArpRate })}>
                                {ARP_RATES.map(r => <option key={r.rate} value={r.rate}>{r.label}</option>)}
                            </select>
                        </label>
                        <label className="pd-select">
                            <span>Length<Own k="noteLength" /></span>
                            <select value={style.noteLength} onChange={e => onChange({ noteLength: parseFloat(e.target.value) })}>
                                {lengths.map(l => <option key={l} value={l}>{l.toFixed(2)} s</option>)}
                            </select>
                        </label>
                    </>
                )}
            </div>
        </div>
    );
};
