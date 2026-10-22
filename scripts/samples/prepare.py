#!/usr/bin/env python3
"""
Builds public/samples/ from the original sample libraries (not committed; see README "Samples").

  python3 scripts/samples/prepare.py <vsco-2-ce dir> <tonejs-audio dir> <fluidr3 dir>

<fluidr3 dir> holds electric_piano_1/ and celesta/ with the MIDI.js FluidR3_GM mp3 renders
(https://github.com/gleitz/midi-js-soundfonts, FluidR3_GM/<name>-mp3/<note>.mp3).

Every file is mapped by its measured pitch (several VSCO files are named an octave off), mixed to
mono, trimmed, level-matched within its instrument, given a baked crossfade loop when the
instrument sustains, and encoded as 64 kb/s mono mp3 (the safest format for iOS Safari).
Writes public/samples/<instrument>/<midi>.mp3 and src/audio/samples.json (what the app loads).
"""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfiltfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'samples')

def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)

def trim_lead(x, db=-50):
    """Drop leading silence (keeps 2 ms before the onset)."""
    th = 10 ** (db / 20) * np.max(np.abs(x))
    i = int(np.argmax(np.abs(x) > th))
    return x[max(0, i - int(0.002 * SR)):]

def bake_loop(x, l0, l1, xfade=0.25, pad=0.25):
    """
    A seamless loop between l0 and l1 seconds: the end of the loop is crossfaded (equal power) into
    the audio just before l0, and the file carries on past l1 with what follows l0, so the loop
    still joins cleanly if a decoder shifts the audio by a few samples.
    """
    a, b, f, p = int(l0 * SR), int(l1 * SR), int(xfade * SR), int(pad * SR)
    y = x[:b].copy()
    t = np.linspace(0, np.pi / 2, f)
    y[b - f:b] = x[b - f:b] * np.cos(t) + x[a - f:a] * np.sin(t)
    return np.concatenate([y, y[a:a + p]])

def fade_out(x, length, fade):
    x = x[:int(length * SR)].copy()
    n = min(len(x), int(fade * SR))
    x[len(x) - n:] *= np.linspace(1, 0, n) ** 2
    return x

def rms(x, a=0.05, b=0.6):
    seg = x[int(a * SR):int(b * SR)]
    return np.sqrt(np.mean(seg ** 2)) + 1e-12

def encode(x, path):
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', path], input=pcm, check=True)

def build(name, files, *, length, fade=0.6, loop=None, match='rms', hp=30):
    """files: {midi: source path}. loop: (l0, l1) seconds for sustained instruments."""
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    clips = {}
    for midi, src in files.items():
        x = trim_lead(load(src))
        x = sosfiltfilt(butter(2, hp, 'highpass', fs=SR, output='sos'), x)  # rumble and DC
        x = bake_loop(x, *loop) if loop else fade_out(x, length, fade)
        clips[midi] = x
    # level-match within the instrument: equal RMS for sustained sounds, equal peak for struck ones
    level = {m: (rms(x) if match == 'rms' else np.max(np.abs(x))) for m, x in clips.items()}
    target = np.median(list(level.values()))
    clips = {m: x * target / level[m] for m, x in clips.items()}
    peak = max(np.max(np.abs(x)) for x in clips.values())
    for m, x in clips.items():
        encode(x * 10 ** (-1 / 20) / peak, os.path.join(OUT, name, f'{m}.mp3'))
    return {'notes': sorted(clips), 'loop': list(loop) if loop else None}

def main(vsco, tjaudio, fluid):
    V = lambda *p: os.path.join(vsco, *p)
    sets = {}
    # Piano: Salamander Grand (CC-BY 3.0), minor thirds; names are correct
    names = {'C': 0, 'Ds': 3, 'Fs': 6, 'A': 9}
    piano = {}
    for o in range(1, 8):
        for n, pc in names.items():
            m = 12 * (o + 1) + pc
            if 24 <= m <= 96 and (2 <= o <= 6 or n in ('C', 'Fs') and o == 1 or m == 96):
                piano[m] = os.path.join(tjaudio, 'salamander', f'{n}{o}.mp3')
    sets['piano'] = build('piano', piano, length=5, fade=1.2, match='peak')
    # E-piano: FluidR3 electric_piano_1 (CC-BY 3.0), major thirds C1..C7
    ep = {}
    for o in range(1, 8):
        for n, pc in {'C': 0, 'E': 4, 'Ab': 8}.items():
            if o == 7 and n != 'C':
                continue
            ep[12 * (o + 1) + pc] = os.path.join(fluid, 'electric_piano_1', f'{n}{o}.mp3')
    sets['epiano'] = build('epiano', ep, length=3.1, fade=0.4, match='peak')
    # Bells: FluidR3 celesta (CC-BY 3.0), C3..Ab7
    cel = {}
    for o in range(3, 8):
        for n, pc in {'C': 0, 'E': 4, 'Ab': 8}.items():
            cel[12 * (o + 1) + pc] = os.path.join(fluid, 'celesta', f'{n}{o}.mp3')
    sets['bells'] = build('bells', cel, length=3.1, fade=0.5, match='peak')
    # Strings: VSCO-2 CE cello section below B3, violin section above (CC0); keys = measured pitch
    cello = V('Strings', 'Cello Section', 'susvib')
    vln = V('Strings', 'Violin Section', 'susVib')
    strings = {36: f'{cello}/susvib_C1_v1_1.wav', 40: f'{cello}/susvib_E1_v1_1.wav', 43: f'{cello}/susvib_G1_v1_1.wav',
               47: f'{cello}/susvib_B1_v1_1.wav', 50: f'{cello}/susvib_D2_v1_1.wav', 53: f'{cello}/susvib_F2_v1_1.wav',
               57: f'{cello}/susvib_A2_v1_1.wav', 59: f'{vln}/VlnEns_susVib_B2_v1.wav', 62: f'{vln}/VlnEns_susVib_D3_v1.wav',
               66: f'{vln}/VlnEns_susVib_F#3_v1.wav', 69: f'{vln}/VlnEns_susVib_A3_v1.wav', 72: f'{vln}/VlnEns_susVib_C4_v1.wav',
               76: f'{vln}/VlnEns_susVib_E4_v1.wav', 79: f'{vln}/VlnEns_susVib_G4_v1.wav', 83: f'{vln}/VlnEns_susVib_B4_v1.wav',
               86: f'{vln}/VlnEns_susVib_D5_v1.wav'}
    sets['strings'] = build('strings', strings, length=0, loop=(1.6, 4.4))
    # Organ: VSCO-2 CE pipe organ, quiet manual (CC0); file number - 86 = MIDI note
    org = V('Keys', 'Organ', 'Quiet')
    sets['organ'] = build('organ', {n - 86: f'{org}/NT5_Man3Quiet_{n}_rr1.wav' for n in range(122, 183, 6)}, length=0, loop=(1.4, 4.0))
    # Brass: VSCO-2 CE French horn low, trumpet above (CC0); keys = measured pitch
    horn = V('Brass', 'F Horn', 'sus')
    tpt = V('Brass', 'Trumpet', 'sus')
    brass = {36: f'{horn}/MOHorn_sus_C1_v2_1.wav', 43: f'{horn}/MOHorn_sus_G1_v2_1.wav', 46: f'{horn}/MOHorn_sus_A#1_v2_1.wav',
             50: f'{horn}/MOHorn_sus_D2_v2_1.wav'}
    for m, n in {53: 'F2', 57: 'A2', 60: 'C3', 63: 'D#3', 67: 'G3', 70: 'A#3', 74: 'D4', 77: 'F4', 81: 'A4', 84: 'C5'}.items():
        brass[m] = f'{tpt}/Sum_SHTrumpet_sus_{n}_v3_rr1.wav'
    sets['brass'] = build('brass', brass, length=0, loop=(1.2, 3.6))
    # Mallets: VSCO-2 CE marimba (CC0); the files sound an octave above their names
    mar = V('Percussion', 'Marimba')
    sets['mallets'] = build('mallets', {m: f'{mar}/Marimba_hit_Outrigger_{n}_loud_01.wav' for m, n in
                                        {41: 'F1', 48: 'C2', 55: 'G2', 59: 'B2', 65: 'F3', 72: 'C4', 79: 'G4', 83: 'B4', 89: 'F5', 96: 'C6'}.items()},
                            length=2.6, fade=0.8, match='peak', hp=70)
    with open(os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'audio', 'samples.json'), 'w') as f:
        json.dump(sets, f, separators=(',', ':'), sort_keys=True)
        f.write('\n')

if __name__ == '__main__':
    main(*sys.argv[1:4])
