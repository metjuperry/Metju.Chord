#!/usr/bin/env python3
"""The Voice part's singers, measured from real singers: VocalSet.

  VocalSet: A Singing Voice Dataset. Julia Wilkins, Prem Seetharaman, Alison Wahl, Bryan Pardo
  (Northwestern University), 2018. https://doi.org/10.5281/zenodo.1442513 . CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/).

What it measures (the app's voice is a source, each singer's own sound, sung through a "mouth" of
four resonant filters at the vowel's formants; see src/audio/voice.ts):

  - the straight long tones (each singer holds three notes in a row on each vowel, without vibrato):
    the lowest of the three, found by tracking the pitch (men C3, women C4), where the vowels are sung
    most clearly
  - from the steady middle of each, the vocal tract's resonances by linear prediction (LPC):
    the first four formants (Hz), their bandwidths and levels
  - each vowel's formants: the median over the chosen singers
  - each singer's source: the strengths of their first 48 harmonics with the vowel's resonances
    divided out (inverse filtering), averaged over the five vowels, so the colour is the singer's
    and the vowel comes from the filters
  - five singers per range: those whose long tones are the most steady and harmonic
  - a vowel whose measured formants can't be that vowel (a formant missed between the harmonics of
    a high note) takes the other range's, scaled; the output lists those under "fallbacks"

Two stages, so a choice made in the second can be changed without fetching or analysing again:

  analyse   every steady note of every recording (all three of each long tone), kept as numbers: its
            pitch, length, formants, harmonics, source (harmonics with the vowel divided out), LPC,
            harmonicity and vibrato, plus each file's pitch track. Bad files are recorded, not fatal.
  make      the app's tables from that: which singers and notes to use, medians, fallbacks. Never
            fails: what it couldn't do is listed under "warnings".

Usage (Python 3.10+, numpy):

  python3 scripts/voices/vocalset.py selftest              check it all on synthetic singers (and broken files)
  python3 scripts/voices/vocalset.py fetch DIR             the straight, vibrato and breathy long tones into DIR, read
                                                           from Zenodo's archive by HTTP ranges (not the whole 2 GB),
                                                           and an inventory of every long tone in it
  python3 scripts/voices/vocalset.py analyse DIR OUT.json  the analysis (scripts/voices/analysis/vocalset-analysis.json)
  python3 scripts/voices/vocalset.py make ANALYSIS OUT     the app's tables (src/audio/vocalset.json)

The GitHub Action "Voice data" (.github/workflows/voice-data.yml) runs them and pushes a branch with both
files; the analysis is what lets the tables be redone without running it again.
"""
import io
import json
import re
import sys
import time
import urllib.request
import wave
import zipfile
from pathlib import Path

import numpy as np

URL = "https://zenodo.org/api/records/1442513/files/VocalSet11.zip/content"
LONG_TONE = re.compile(r"FULL/(?P<singer>(?:male|female)\d+)/long_tones/(?P<technique>[a-z_]+)/[^/]*_(?P<vowel>[aeiou])\.wav$")
FILE_NAME = re.compile(r"(?P<singer>(?P<sex>male|female)\d+)_(?P<technique>[a-z_]+)_(?P<vowel>[aeiou])")
# the long tones fetched: straight for the voice itself; vibrato and breathy to match the knobs to real singers
TECHNIQUES = ("straight", "vibrato", "breathy")
VOWELS = "aeiou"
HARMONICS = 48
SINGERS = 5
MIN_SINGERS = 3
SR = 16000            # analysis rate: formants below 5 kHz
LPC_ORDER = 18        # 2 + SR / 1000, the usual rule
# the note analysed per range: the lowest of each singer's long tones (men C3, women C4)
NOTE = {"low": 130.81, "high": 261.63}
CREDIT = ("VocalSet (Wilkins, Seetharaman, Wahl, Pardo, Northwestern University, 2018), "
          "https://doi.org/10.5281/zenodo.1442513, CC BY 4.0. Changed: measured into formants and harmonic "
          "strengths by scripts/voices/vocalset.py; no recording is included.")


# ---- reading ------------------------------------------------------------------------------------

def read_wav(path):
    """Mono float samples and the rate of a PCM WAV."""
    with wave.open(str(path)) as w:
        n, ch, width, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if width == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    elif width == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        x = ((b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16)) << 8 >> 8) / 8388608
    elif width == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648
    else:
        raise ValueError(f"{path}: {width * 8}-bit audio")
    return x.reshape(-1, ch).mean(axis=1), rate


def resample(x, rate, to):
    """Band-limited resampling by FFT (fine for analysis)."""
    n = int(round(len(x) * to / rate))
    spec = np.fft.rfft(x)
    keep = n // 2 + 1
    out = np.zeros(keep, dtype=complex)
    m = min(keep, len(spec))
    out[:m] = spec[:m]
    return np.fft.irfft(out, n) * (n / len(x))


def steady_middle(x, rate, seconds=0.6):
    """The middle `seconds` of the note: past the onset, before the release."""
    n = int(seconds * rate)
    mid = len(x) // 2
    return x[max(0, mid - n // 2): mid + n // 2]


def pitch_track(x, rate, hop=0.02, size=0.05):
    """The pitch (Hz, 0 where unvoiced) every `hop` seconds, by YIN (de Cheveigné & Kawahara, 2002), 70 Hz - 1 kHz.

    YIN takes the first period whose (cumulative mean normalised) difference dips under a threshold,
    rather than the best-correlating one, so a note isn't heard an octave low (a period two cycles
    long fits just as well); parabolic interpolation places it between samples.
    """
    pr = 22050
    y = resample(x, rate, pr)
    n, h = int(size * pr), int(hop * pr)
    lo, hi = pr // 1000, pr // 70
    # a quarter of the file's level, and never silence
    loud = max(np.sqrt(np.mean(y ** 2)) * 0.25, 1e-3)
    out = []
    for i in range(0, len(y) - n - hi, h):
        f = y[i:i + n + hi]
        if np.sqrt(np.mean(f[:n] ** 2)) < loud:
            out.append(0.0)
            continue
        # difference function d(tau) = sum (x_j - x_{j+tau})^2 for tau < hi, via FFT
        w = f[:n]
        spec = np.fft.rfft(f, 2 * len(f))
        corr = np.fft.irfft(np.fft.rfft(w[::-1], 2 * len(f)) * spec)[n - 1:n - 1 + hi]
        energy = np.cumsum(f ** 2)
        e_tau = energy[np.arange(hi) + n - 1] - np.concatenate([[0], energy[:hi - 1]])
        d = np.sum(w ** 2) + e_tau - 2 * corr
        d[0] = 0
        cm = d[1:] * np.arange(1, hi) / np.maximum(np.cumsum(d[1:]), 1e-12)
        cm = np.concatenate([[1], cm])
        below = np.where(cm[lo:] < 0.15)[0]
        if not len(below):
            out.append(0.0)
            continue
        t = lo + below[0]
        while t + 1 < hi and cm[t + 1] < cm[t]:
            t += 1
        a, b, c = cm[t - 1], cm[t], cm[t + 1] if t + 1 < hi else cm[t]
        shift = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0
        out.append(pr / (t + shift))
    return np.array(out), hop


def notes_in(track, hop, min_seconds=0.4):
    """The steady notes of a pitch track: (pitch, first frame, end frame), in order.

    The track is median-smoothed over five frames; a note is a stretch staying within 0.6 semitone of
    its own median, through dropouts of up to three frames, lasting at least `min_seconds`.
    """
    t = np.array(track, dtype=float)
    padded = np.pad(t, 2, mode="edge")
    smooth = np.array([np.median(padded[i:i + 5]) for i in range(len(t))])
    notes, start, gap = [], None, 0
    for i, f in enumerate(list(smooth) + [0.0] * 5):
        if start is not None:
            voiced = [x for x in smooth[start:i] if x > 0]
            centre = np.median(voiced) if voiced else f
            if f > 0 and abs(12 * np.log2(f / centre)) <= 0.6:
                gap = 0
                continue
            gap += 1
            if gap <= 3 and f == 0 and i < len(smooth):
                continue
            end = i - gap + 1
            if (end - start) * hop >= min_seconds:
                notes.append((float(np.median([x for x in smooth[start:end] if x > 0])), start, end))
            start, gap = None, 0
        if start is None and i < len(smooth) and f > 0:
            start = i
    return notes


# ---- measuring ----------------------------------------------------------------------------------

def lpc(x, order):
    """Linear prediction coefficients a[0..order] (a[0] = 1) by autocorrelation and Levinson-Durbin."""
    r = np.correlate(x, x, mode="full")[len(x) - 1: len(x) + order]
    r[0] *= 1 + 1e-9
    a = np.zeros(order + 1)
    a[0] = 1.0
    e = r[0]
    for i in range(1, order + 1):
        k = -(r[i] + np.dot(a[1:i], r[i - 1:0:-1])) / e
        a[1:i + 1] = a[1:i + 1] + k * np.concatenate([a[i - 1:0:-1], [1.0]])
        e *= 1 - k * k
    return a


def envelope_db(a, freqs, rate):
    """The LPC envelope's level (dB) at `freqs`."""
    z = np.exp(-2j * np.pi * np.outer(freqs, np.arange(len(a))) / rate)
    return -20 * np.log10(np.abs(z @ a) + 1e-12)


def frames(x, rate, size=0.04, hop=0.02):
    n, h = int(size * rate), int(hop * rate)
    return [x[i:i + n] for i in range(0, len(x) - n, h)]


def formants(x, rate):
    """The first four formants of a held vowel: [[Hz, bandwidth Hz, dB relative to the first], ...].

    Per 40 ms frame: pre-emphasis, Hamming window, LPC; the roots above the real axis are the
    resonances (see below for which count). The median over frames keeps a stray root out.
    """
    y = resample(x, rate, SR)
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])
    found = []
    for f in frames(y, SR):
        if np.sqrt(np.mean(f ** 2)) < 1e-4:
            continue
        a = lpc(f * np.hamming(len(f)), LPC_ORDER)
        roots = [r for r in np.roots(a) if np.imag(r) > 0]
        res = sorted(
            (np.angle(r) * SR / (2 * np.pi), -np.log(np.abs(r)) * SR / np.pi)
            for r in roots
        )
        # F1: the lowest resonance under 1.1 kHz (at a low sung pitch it comes out broad, so up to 600 Hz wide);
        # F2-F4: the next sharp ones above it (a broad root up there is the spectrum's slope, not a resonance)
        f1 = next(((hz, bw) for hz, bw in res if 200 < hz < 1100 and bw < 600), None)
        if not f1:
            continue
        res = [f1] + [(hz, bw) for hz, bw in res if f1[0] + 150 < hz < 4800 and bw < 350][:3]
        if len(res) == 4:
            found.append((res, a))
    if not found:
        raise ValueError("no steady vowel found")
    hz = np.median([[r[0] for r in res] for res, _ in found], axis=0)
    bw = np.median([[r[1] for r in res] for res, _ in found], axis=0)
    # levels: the mean envelope at each formant, against the first
    levels = np.mean([envelope_db(a, hz, SR) for _, a in found], axis=0)
    # pre-emphasis lifted the highs by ~6 dB an octave: take that back off the levels
    tilt = 20 * np.log10(np.abs(1 - 0.97 * np.exp(-2j * np.pi * hz / SR)))
    levels = levels - tilt
    return [[round(float(h)), round(float(b)), round(float(l - levels[0]), 1)] for h, b, l in zip(hz, bw, levels)]


def harmonics(x, rate, f0_guess):
    """f0 (refined near `f0_guess`) and the strengths of the first HARMONICS harmonics, by a windowed FFT."""
    n = 1 << int(np.ceil(np.log2(len(x))))
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), n))
    hz = np.fft.rfftfreq(n, 1 / rate)
    # refine f0: the strongest peak within a third of a semitone of the guess (the pitch track's)
    near = (hz > f0_guess * 0.98) & (hz < f0_guess * 1.02)
    f0 = float(hz[near][np.argmax(spec[near])])
    amps = []
    for k in range(1, HARMONICS + 1):
        band = (hz > f0 * (k - 0.25)) & (hz < f0 * (k + 0.25))
        amps.append(float(spec[band].max()) if band.any() and f0 * k < rate / 2 else 0.0)
    return f0, np.array(amps)


def harmonicity(x, rate, f0):
    """How much of the energy is in the harmonics (0..1): a steady, clean tone scores high."""
    n = 1 << int(np.ceil(np.log2(len(x))))
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)) ** 2
    hz = np.fft.rfftfreq(n, 1 / rate)
    on = np.zeros_like(hz, dtype=bool)
    for k in range(1, int(5000 / f0)):
        on |= np.abs(hz - k * f0) < f0 * 0.08
    under = hz < 5000
    return float(spec[on & under].sum() / (spec[under].sum() + 1e-12))


def source(amps, f0, x, rate):
    """A singer's harmonics with the vowel's resonances divided out (inverse filtering by the LPC envelope)."""
    y = resample(x, rate, SR)
    a = lpc(y * np.hamming(len(y)), LPC_ORDER)
    k = np.arange(1, len(amps) + 1) * f0
    # above the analysis band, the envelope's level at its top edge stands in
    env = envelope_db(a, np.minimum(k, SR / 2 - 100), SR)
    return amps / 10 ** (env / 20)


# ---- analyse: every note of every recording, kept as numbers ------------------------------------

def report(line):
    """What happened, on stderr (the workflow log shows it)."""
    print(line, file=sys.stderr, flush=True)


def r1(x, nd=1):
    return round(float(x), nd)


def vibrato(track, hop, a, b):
    """Rate (Hz) and depth (cents, either way) of the pitch's wobble over frames [a, b)."""
    p = np.array(track[a:b], dtype=float)
    p = p[p > 0]
    if len(p) < 16:
        return None
    cents = 1200 * np.log2(p / np.median(p))
    cents = cents - np.polyval(np.polyfit(np.arange(len(cents)), cents, 1), np.arange(len(cents)))
    spec = np.abs(np.fft.rfft(cents * np.hanning(len(cents)), 256))
    hz = np.fft.rfftfreq(256, hop)
    band = (hz >= 3) & (hz <= 9)
    return {"rate": r1(hz[band][np.argmax(spec[band])], 2), "depth": r1(np.std(cents) * np.sqrt(2))}


def analyse_note(x, rate, f0, a, b, hop, track):
    """Everything worth keeping about one held note (its middle, trimmed by a fifth at each end)."""
    trim = (b - a) // 5
    mid = x[int((a + trim) * hop * rate): int((b - trim) * hop * rate)]
    note = {"f0": r1(f0, 2), "start": r1(a * hop, 2), "seconds": r1((b - a) * hop, 2)}
    try:
        f0, amps = harmonics(mid, rate, f0)
        note["f0"] = r1(f0, 2)
        note["harmonicity"] = r1(harmonicity(mid, rate, f0), 3)
        note["harmonics_db"] = [r1(20 * np.log10(v / (amps.max() + 1e-12) + 1e-9)) for v in amps]
        src = source(amps, f0, mid, rate)
        note["source_db"] = [r1(20 * np.log10(v / (src.max() + 1e-12) + 1e-9)) for v in src]
        y = resample(mid, rate, SR)
        note["lpc"] = [round(float(c), 5) for c in lpc(y * np.hamming(len(y)), LPC_ORDER)]
    except Exception as e:      # noqa: BLE001 - one bad note mustn't stop the rest
        note["error_harmonics"] = str(e)
    try:
        note["formants"] = formants(mid, rate)
    except Exception as e:      # noqa: BLE001
        note["error_formants"] = str(e)
    v = vibrato(track, hop, a + trim, b - trim)
    if v:
        note["vibrato"] = v
    return note


def analyse(src_dir, out_path):
    """Every recording in `src_dir` (from `fetch`) -> one JSON of numbers: per file its pitch track and
    every steady note found, each with its formants, harmonics, source, LPC, harmonicity and vibrato.
    Never stops on a bad file: it's recorded with its error."""
    inventory = Path(src_dir) / "inventory.json"
    dump = {
        "version": 2, "credit": CREDIT, "analysis_rate": SR, "lpc_order": LPC_ORDER, "harmonics": HARMONICS,
        "inventory": json.loads(inventory.read_text()) if inventory.exists() else None,
        "recordings": [],
    }
    paths = sorted(Path(src_dir).glob("*.wav"))
    for n, p in enumerate(paths, 1):
        m = FILE_NAME.fullmatch(p.stem)
        if not m:
            continue
        rec = {"file": p.name, "singer": m["singer"], "range": "low" if m["sex"] == "male" else "high",
               "technique": m["technique"], "vowel": m["vowel"]}
        try:
            x, rate = read_wav(p)
            rec["seconds"] = r1(len(x) / rate, 2)
            rec["rate"] = rate
            rec["peak_db"] = r1(20 * np.log10(np.abs(x).max() + 1e-12))
            track, hop = pitch_track(x, rate)
            rec["track"] = {"hop": hop, "hz": [int(round(f)) for f in track]}
            rec["notes"] = [analyse_note(x, rate, f0, a, b, hop, track) for f0, a, b in notes_in(track, hop)]
        except Exception as e:      # noqa: BLE001
            rec["error"] = f"{type(e).__name__}: {e}"
        dump["recordings"].append(rec)
        found = ", ".join(f"{q['f0']:.0f} Hz {q['seconds']:.1f} s" for q in rec.get("notes", [])) or rec.get("error", "no steady note")
        report(f"[{n}/{len(paths)}] {rec['singer']} {rec['technique']} {rec['vowel']}: {found}")
    Path(out_path).write_text(json.dumps(dump, separators=(",", ":")) + "\n")
    report(f"analysed {len(dump['recordings'])} recordings into {out_path}")


# ---- make: the app's tables from the analysis ---------------------------------------------------

def make(dump):
    """The analysis -> the JSON the app reads. Never fails: what it couldn't do is listed in "warnings",
    and a range with no usable singers is left out (the app keeps its stand-ins for it)."""
    out = {"credit": CREDIT, "warnings": [], "fallbacks": []}
    recs = [r for r in dump["recordings"] if r.get("technique") == "straight" and r.get("notes")]
    for rng in ("low", "high"):
        expect = NOTE[rng]
        rows = {}
        for s in sorted({r["singer"] for r in recs if r["range"] == rng}):
            per = {}
            for v in VOWELS:
                rec = next((r for r in recs if r["singer"] == s and r["vowel"] == v), None)
                cands = [q for q in (rec or {}).get("notes", []) if "harmonics_db" in q and -4 <= 12 * np.log2(q["f0"] / expect) <= 13]
                if not cands:
                    report(f"{s} {v}: no usable note ({', '.join(f'{q['f0']:.0f} Hz' for q in (rec or {}).get('notes', [])) or 'none'})")
                    continue
                q = min(cands, key=lambda q: q["f0"])
                per[v] = dict(q, low=abs(12 * np.log2(q["f0"] / expect)) <= 4)
            if len(per) >= 3:
                rows[s] = per
                lows = sum(per[v]["low"] for v in per)
                report(f"{s}: {len(per)} vowels, the low note on {lows}, harmonicity {np.mean([per[v]['harmonicity'] for v in per]):.2f}")
            else:
                report(f"{s}: left out, only {len(per)} vowels usable")
        steady = {s: r for s, r in rows.items() if sum(r[v]["low"] for v in r) >= 2}
        if len(steady) >= MIN_SINGERS:
            rows = steady
        best = sorted(rows, key=lambda s: (-sum(rows[s][v]["low"] for v in rows[s]), -np.mean([rows[s][v]["harmonicity"] for v in rows[s]])))[:SINGERS]
        report(f"{rng}: {len(rows)} usable singers; using {', '.join(best) or 'none'}")
        if not best:
            out["warnings"].append(f"{rng}: no usable singers, the app keeps its stand-ins")
            continue
        if len(best) < MIN_SINGERS:
            out["warnings"].append(f"{rng}: only {len(best)} usable singers")
        chosen = [best[i % len(best)] for i in range(SINGERS)]
        singers = []
        for s in chosen:
            notes = list(rows[s].values())
            low = [q for q in notes if q["low"]]
            if not low:
                pitches = [round(12 * np.log2(q["f0"])) for q in notes]
                common = max(set(pitches), key=pitches.count)
                low = [q for q, p in zip(notes, pitches) if p == common]
            # in dB, so one loud vowel doesn't outweigh the rest
            src = 10 ** (np.mean([colour_db(q) for q in low if "formants" in q] or [colour_db(q) for q in low], axis=0) / 20)
            src = src / src.max()
            singers.append([round(float(a), 5) for a in src])
        fmts, counted = {}, {}
        for v in VOWELS:
            on_low = [rows[s][v]["formants"] for s in rows if v in rows[s] and rows[s][v]["low"] and "formants" in rows[s][v]]
            anyhow = [rows[s][v]["formants"] for s in rows if v in rows[s] and "formants" in rows[s][v]]
            use = on_low or anyhow
            counted[v] = len(on_low)
            if use:
                fmts[v] = [[round(float(c)) if i < 2 else round(float(c), 1) for i, c in enumerate(col)] for col in np.median(use, axis=0)]
        report(f"{rng}: formants from " + ", ".join(f"{v} {counted[v]} singers" for v in VOWELS))
        out[rng] = {"singers": singers, "formants": fmts, "counted": counted, "from": chosen}
    for rng, other, scale in (("high", "low", 1.15), ("low", "high", 1 / 1.15)):
        if rng not in out or other not in out:
            continue
        for v in VOWELS:
            mine, theirs = out[rng]["formants"].get(v), out[other]["formants"].get(v)
            if mine and plausible(v, mine) or not theirs or not plausible(v, theirs):
                continue
            out[rng]["formants"][v] = [[round(hz * scale), bw, db] for hz, bw, db in theirs]
            out["fallbacks"].append(f"{rng}.{v}")
    for rng in ("low", "high"):
        missing = [v for v in VOWELS if rng in out and v not in out[rng]["formants"]]
        if missing:
            out["warnings"].append(f"{rng}: no formants for {', '.join(missing)} (the app keeps its stand-ins for them)")
    # the vibrato and breathy long tones, for the Vibrato and Breath knobs to match real singers
    extra = {}
    for tech in ("vibrato", "breathy"):
        notes = [q for r in dump["recordings"] if r.get("technique") == tech for q in r.get("notes", [])]
        if not notes:
            continue
        e = {"notes": len(notes), "harmonicity": r1(np.median([q["harmonicity"] for q in notes if "harmonicity" in q] or [0]), 3)}
        vib = [q["vibrato"] for q in notes if "vibrato" in q]
        if vib:
            e["vibrato_rate"] = r1(np.median([w["rate"] for w in vib]), 2)
            e["vibrato_depth"] = r1(np.median([w["depth"] for w in vib]))
        extra[tech] = e
    straight = [q for r in recs for q in r["notes"] if "harmonicity" in q]
    if straight:
        extra["straight"] = {"notes": len(straight), "harmonicity": r1(np.median([q["harmonicity"] for q in straight]), 3)}
    out["techniques"] = extra
    return out


def biquad_mag(kind, f, f0, q, gain_db=0.0, sr=44100):
    """|H(f)| of a Web Audio BiquadFilter (the RBJ cookbook filters it uses): 'lowpass' or 'peaking'."""
    w0 = 2 * np.pi * f0 / sr
    alpha = np.sin(w0) / (2 * q)
    cw = np.cos(w0)
    if kind == "highshelf":
        A = 10 ** (gain_db / 40)
        al = np.sin(w0) / 2 * np.sqrt(2)
        sa = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa)]
        a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa]
    elif kind == "lowpass":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    else:
        A = 10 ** (gain_db / 40)
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    z = np.exp(-1j * 2 * np.pi * np.asarray(f, dtype=float) / sr)
    return np.abs((b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z))


def peak_db(hz, bw, k):
    """How far a formant rises (dB) as a peaking filter: as high as a resonance of its sharpness would,
    kept within 3 dB and PEAK_MAX_DB[k] (F1 highest, the upper ones lower, as in a voice)."""
    return float(np.clip(20 * np.log10(hz / bw), 3, PEAK_MAX_DB[k]))


PEAK_MAX_DB = [24, 20, 15, 15]
AIR_HZ, AIR_DB = 2500, 18


def mouth(f, fmts):
    """The app's mouth (audio/voice.ts), as a magnitude at frequencies `f`: F1 and F2 as resonances in a
    row (low-pass biquads, Q = centre / bandwidth: the vowel, with the valleys and the fall above it a
    vocal tract has), F3 and F4 as peaks (peaking biquads) so the top stays as open as real singers'."""
    out = np.ones_like(np.asarray(f, dtype=float))
    for k, (hz, bw, _db) in enumerate(fmts):
        out = out * (biquad_mag("lowpass", f, hz, hz / bw) if k < 2 else biquad_mag("peaking", f, hz, hz / bw, peak_db(hz, bw, k)))
    # the air above the formants a voice keeps (four resonances alone fall away too fast)
    out = out * biquad_mag("highshelf", f, AIR_HZ, 1, AIR_DB)
    return out


# how far the colour may make up for the mouth's fall (dB): all of it, in practice, since the app's
# mouth takes it away again; a lower limit leaves the top of the voice dull and far away
MOUTH_FLOOR_DB = 45


def colour_db(q):
    """A singer's colour from one note (dB per harmonic, 0 at the loudest): its harmonics with just this
    vowel's four formants divided out, the way the app puts them back (as a cascade). The voice's natural slope (its
    harmonics falling ~10 dB an octave) stays; dividing by the whole LPC envelope (`source_db`) would take
    that out too and leave a flat, buzzy wave. The division is limited to MOUTH_FLOOR_DB."""
    h = np.array(q["harmonics_db"])
    if "formants" not in q:
        return h - h.max()
    k = np.arange(1, len(h) + 1) * q["f0"]
    m = mouth(k, q["formants"])
    m = np.maximum(m, m.max() * 10 ** (-MOUTH_FLOOR_DB / 20))
    c = h - 20 * np.log10(m)
    c[h <= -150] = -150
    return c - c.max()


# where each vowel's F1 and F2 can be (Hz), for men and women alike: broad, only to catch a missed formant
VOWEL_SPACE = {"a": ((550, 1150), (950, 1900)), "e": ((380, 900), (1450, 2600)), "i": ((220, 520), (1800, 3300)),
               "o": ((330, 750), (650, 1350)), "u": ((230, 560), (550, 1500))}


def plausible(v, fmts):
    (lo1, hi1), (lo2, hi2) = VOWEL_SPACE[v]
    return lo1 <= fmts[0][0] <= hi1 and lo2 <= fmts[1][0] <= hi2


# ---- fetch: the long tones, by HTTP ranges ------------------------------------------------------

class RangeFile(io.RawIOBase):
    """A remote file read by HTTP Range requests, so the zip's directory and a few members are all that come down."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            self.size = int(r.headers["Content-Length"])

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = {0: offset, 1: self.pos + offset, 2: self.size + offset}[whence]
        return self.pos

    def readinto(self, buf):
        n = min(len(buf), self.size - self.pos)
        if n <= 0:
            return 0
        for attempt in range(4):
            try:
                req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
                break
            except OSError:
                if attempt == 3:
                    raise
                time.sleep(5 * (attempt + 1))
        buf[:len(data)] = data
        self.pos += len(data)
        return len(data)


def fetch(dest):
    """The long tones of the techniques in TECHNIQUES into `dest` (named singer_technique_vowel.wav),
    and `inventory.json`: every long tone in the archive with its size, for whatever comes next."""
    dest.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL), buffer_size=1 << 20))
    inventory, count = [], 0
    for info in z.infolist():
        m = LONG_TONE.search(info.filename)
        if not m:
            continue
        inventory.append({"path": info.filename, "bytes": info.file_size})
        if m["technique"] not in TECHNIQUES:
            continue
        out = dest / f"{m['singer']}_{m['technique']}_{m['vowel']}.wav"
        if not (out.exists() and out.stat().st_size == info.file_size):
            try:
                out.write_bytes(z.read(info))
            except Exception as e:      # noqa: BLE001 - one bad member mustn't stop the rest
                report(f"{info.filename}: {e}")
                continue
        count += 1
    (dest / "inventory.json").write_text(json.dumps(inventory, indent=0) + "\n")
    techs = sorted({LONG_TONE.search(i["path"])["technique"] for i in inventory})
    print(f"{count} long tones in {dest} (the archive's long tones: {len(inventory)}, techniques {', '.join(techs)})")


# ---- selftest: synthetic vowels with known formants ---------------------------------------------

def synth_vowel(f0, fmts, rate=44100, seconds=1.5, tilt=1.2, seed=0):
    """A sung vowel: harmonics of f0 falling `tilt` per octave-ish, shaped by resonances at `fmts`, with a little jitter."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * rate)) / rate
    x = np.zeros_like(t)
    for k in range(1, int(5000 / f0)):
        f = k * f0
        gain = k ** -tilt
        for hz, bw in fmts:
            gain *= 1 + 8 / (1 + ((f - hz) / (bw / 2)) ** 2)
        x += gain * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    return x / np.abs(x).max() * 0.5 + rng.normal(0, 1e-4, len(t))


def write_wav(path, x, rate=44100):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def selftest():
    import tempfile
    truth = {"a": [(768, 90), (1333, 100), (2522, 160), (3400, 200)],
             "i": [(342, 50), (2322, 120), (3000, 200), (3700, 220)],
             "u": [(378, 60), (997, 80), (2343, 150), (3300, 200)]}
    for v, fmts in truth.items():
        got = formants(steady_middle(synth_vowel(110, fmts), 44100), 44100)
        for (hz, _), (ghz, _, _) in zip(fmts[:3], got[:3]):
            # harmonics are 110 Hz apart: a formant can only be told to within about one
            assert abs(ghz - hz) < 120, (v, fmts, got)
    # the pipeline end to end on synthetic singers
    with tempfile.TemporaryDirectory() as d:
        for f0, sex in ((130.81, "male"), (261.63, "female")):
            for s in range(1, 7):
                for v in VOWELS:
                    fm = truth.get(v, truth["a"])
                    # three notes in a row, as VocalSet's long tones are: the octave, the fourth above it, then the lowest
                    base = f0 * 2 ** (np.random.default_rng(s).uniform(-0.2, 0.2) / 12)
                    gap = np.zeros(int(0.15 * 44100))
                    notes = [synth_vowel(base * 2, fm, tilt=1.0 + 0.1 * s, seed=s), gap,
                             synth_vowel(base * 2 ** (17 / 12), fm, tilt=1.0 + 0.1 * s, seed=s), gap,
                             synth_vowel(base, fm, tilt=1.0 + 0.1 * s, seed=s)]
                    # as many real singers do on some vowel: singer 6 skips the low note on E
                    write_wav(f"{d}/{sex}{s}_straight_{v}.wav", np.concatenate(notes[:3] if (s, v) == (6, "e") else notes))
            # a vibrato tone: 5.5 Hz, ±50 cents
            t = np.arange(int(2 * 44100)) / 44100
            ph = 2 * np.pi * np.cumsum(f0 * 2 ** (0.5 / 12 * np.sin(2 * np.pi * 5.5 * t))) / 44100
            write_wav(f"{d}/{sex}1_vibrato_a.wav", 0.4 * (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)))
        # broken files must not stop anything
        Path(f"{d}/male9_straight_a.wav").write_bytes(b"not a wav")
        write_wav(f"{d}/male9_straight_e.wav", np.zeros(44100))
        analyse(d, f"{d}/analysis.json")
        dump = json.loads(Path(f"{d}/analysis.json").read_text())
        out = make(dump)
    assert any("error" in r for r in dump["recordings"]), "a broken file is recorded with its error"
    for rng_ in ("low", "high"):
        assert len(out[rng_]["singers"]) == SINGERS and all(len(s) == HARMONICS for s in out[rng_]["singers"])
        assert set(out[rng_]["formants"]) == set(VOWELS)
        # singer 6 still counts, but its E (sung an octave up) stays out of E's formants
        assert out[rng_]["counted"] == {"a": 6, "e": 5, "i": 6, "o": 6, "u": 6}, out[rng_]["counted"]
        assert all(len(f) == 4 for f in out[rng_]["formants"].values())
        assert all(0 <= a <= 1 for s in out[rng_]["singers"] for a in s)
        # the fundamental and every harmonic near it are there: no note measured an octave off
        assert all(min(s[:3]) > 0.03 for s in out[rng_]["singers"]), out[rng_]["singers"]
        # and a singer through the app's mouth keeps a voice's natural slope (falling, as the synthetic
        # singers' harmonics do), not flattened: the colour times the mouth, on "a" at the expected note
        k = np.arange(1, 25)
        heard = lambda sg: np.array(sg[:24]) * mouth(k * NOTE[rng_], out[rng_]["formants"]["a"])
        for sg in out[rng_]["singers"]:
            assert np.polyfit(np.log2(k), 20 * np.log10(heard(sg) / heard(sg).max() + 1e-6), 1)[0] < -4, sg[:24]
    vib = out["techniques"]["vibrato"]
    assert abs(vib["vibrato_rate"] - 5.5) < 0.6 and 25 < vib["vibrato_depth"] < 80, vib
    # an analysis with nothing usable still makes a file, with warnings
    empty = make({"recordings": []})
    assert empty["warnings"] and "low" not in empty
    print("selftest ok")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "selftest":
        selftest()
    elif cmd == "fetch" and len(sys.argv) == 3:
        fetch(Path(sys.argv[2]))
    elif cmd == "analyse" and len(sys.argv) == 4:
        analyse(sys.argv[2], sys.argv[3])
    elif cmd == "make" and len(sys.argv) == 4:
        data = make(json.loads(Path(sys.argv[2]).read_text()))
        Path(sys.argv[3]).write_text(json.dumps(data, indent=1) + "\n")
        print(f"wrote {sys.argv[3]}: " + "; ".join(f"{r}: {', '.join(data[r]['from'])}" for r in ("low", "high") if r in data))
        for w in data["warnings"]:
            print(f"warning: {w}")
        if data["fallbacks"]:
            print(f"formants taken from the other range for: {', '.join(data['fallbacks'])}")
    else:
        print(__doc__)
        sys.exit(2)
