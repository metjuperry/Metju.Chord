import type { ChordType, TriadQuality } from './theory';

/** A one- or two-word mood for a chord type on a pad of `quality`: what Play mode can show next to the chord. */
export function chordMood(type: ChordType, quality: TriadQuality): string {
    const minor = quality === 'minor';
    switch (type) {
        case 'triad': return quality === 'dim' ? 'restless' : quality === 'aug' ? 'unsettled' : minor ? 'reflective' : 'bright';
        case 'flip': return quality === 'major' ? 'wistful' : quality === 'minor' ? 'borrowed lift' : 'restless';
        case 'diatonic7': return quality === 'dim' ? 'uneasy' : minor ? 'mellow' : quality === 'major' ? 'dreamy' : 'tense';
        case 'dom7': return 'tension';
        case 'diatonic9': return minor ? 'bittersweet' : quality === 'major' ? 'airy' : 'uneasy';
        case 'six': return 'sweet';
        case 'sus2': return 'floating';
        case 'sus4': return 'anticipation';
        case 'dim': return 'restless';
        case 'minor': return 'reflective';
        case 'aug': return 'mysterious';
        default: return '';
    }
}
