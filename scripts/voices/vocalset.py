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

Usage (Python 3.10+, numpy):

  python3 scripts/voices/vocalset.py selftest          check the analysis on synthetic vowels
  python3 scripts/voices/vocalset.py fetch DIR         the straight long tones (~84 MB) into DIR, read from
                                                       Zenodo's archive by HTTP ranges (not the whole 2 GB)
  python3 scripts/voices/vocalset.py make DIR OUT.json measure them into OUT.json (src/audio/vocalset.json)

The GitHub Action "Voice data" (.github/workflows/voice-data.yml) runs all three and opens a PR.
"""
import io
import json
import re
import sys
import urllib.request
import wave
import zipfile
from pathlib import Path

import numpy as np

URL = "https://zenodo.org/api/records/1442513/files/VocalSet11.zip/content"
LONG_TONE = re.compile(r"FULL/(?P<singer>(?:male|female)\d+)/long_tones/straight/[^/]*_(?P<vowel>[aeiou])\.wav$")
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
    loud = np.sqrt(np.mean(y ** 2)) * 0.25
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


def lowest_note(x, rate, expect):
    """The long tones hold three notes in a row; the lowest one's steady middle and its pitch.

    Of the steady notes (`notes_in`), the lowest not more than 5 semitones under `expect` (an octave
    slip of the pitch tracker would be), trimmed by a fifth at each end (onset and release).
    Raises ValueError saying what was found when there's none.
    """
    track, hop = pitch_track(x, rate)
    found = notes_in(track, hop)
    usable = [n for n in found if 12 * np.log2(n[0] / expect) > -5]
    if not usable:
        heard = ", ".join(f"{f:.0f} Hz {(b - a) * hop:.1f} s" for f, a, b in found) or "nothing steady"
        raise ValueError(f"no steady note near {expect:.0f} Hz ({heard})")
    f0, a, b = min(usable)
    trim = (b - a) // 5
    return x[int((a + trim) * hop * rate): int((b - trim) * hop * rate)], f0


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


# ---- the tables ---------------------------------------------------------------------------------

def report(line):
    """What happened to each recording, on stderr (the workflow log shows it)."""
    print(line, file=sys.stderr)


def measure(files):
    """files: {(range, singer, vowel): path} -> the JSON the app reads."""
    out = {"credit": CREDIT, "low": {}, "high": {}}
    for rng in ("low", "high"):
        singers = sorted({s for (r, s, _) in files if r == rng})
        rows = {}
        for s in singers:
            per = {}
            for v in VOWELS:
                p = files.get((rng, s, v))
                if not p:
                    report(f"{s} {v}: no recording")
                    break
                x, rate = read_wav(p)
                try:
                    mid, f0 = lowest_note(x, rate, NOTE[rng])
                except ValueError as e:
                    report(f"{s} {v}: {e}")
                    break
                off = 12 * np.log2(f0 / NOTE[rng])
                if not -4 <= off <= 13:
                    report(f"{s} {v}: lowest note {f0:.0f} Hz, too far from {NOTE[rng]:.0f} Hz")
                    break
                f0, amps = harmonics(mid, rate, f0)
                per[v] = {
                    # many singers skip or clip the lowest of the three notes on some vowels: their next
                    # one (an octave up) still gives their colour, but formants only count from the low note
                    "low": abs(off) <= 4,
                    "formants": formants(mid, rate),
                    "source": source(amps, f0, mid, rate),
                    "clean": harmonicity(mid, rate, f0),
                    "f0": f0,
                }
            if len(per) == len(VOWELS):
                rows[s] = per
                lows = sum(per[v]["low"] for v in per)
                report(f"{s}: ok, " + ", ".join(f"{v} {per[v]['f0']:.0f} Hz" for v in VOWELS) +
                       f", the low note on {lows} vowel{'s' if lows != 1 else ''}"
                       f", harmonicity {np.mean([per[v]['clean'] for v in VOWELS]):.2f}")
        # singers with the low note on at least two vowels; others only if there aren't enough of those
        steady = {s: r for s, r in rows.items() if sum(r[v]["low"] for v in VOWELS) >= 2}
        if len(steady) >= MIN_SINGERS:
            rows = steady
        # most vowels on the low note first, then the cleanest tone
        best = sorted(rows, key=lambda s: (-sum(rows[s][v]["low"] for v in VOWELS), -np.mean([rows[s][v]["clean"] for v in VOWELS])))[:SINGERS]
        report(f"{rng}: {len(rows)} usable singers of {len(singers)}; using {', '.join(best)}")
        if len(best) < MIN_SINGERS:
            raise SystemExit(f"{rng}: only {len(best)} usable singers (need {MIN_SINGERS})")
        # fewer than a choir's worth: the clearest sing twice (each choir voice is detuned its own way anyway)
        best = [best[i % len(best)] for i in range(SINGERS)]
        out[rng]["singers"] = []
        for s in best:
            # a singer's colour from the vowels sung on one note (harmonic k means the same thing in all of
            # them): the low note's, or else the most common one's
            low = [v for v in VOWELS if rows[s][v]["low"]]
            if not low:
                pitches = [round(12 * np.log2(rows[s][v]["f0"])) for v in VOWELS]
                common = max(set(pitches), key=pitches.count)
                low = [v for v, p in zip(VOWELS, pitches) if p == common]
            src = np.mean([rows[s][v]["source"] / (rows[s][v]["source"][0] + 1e-12) for v in low], axis=0)
            src = src / src.max()
            out[rng]["singers"].append([round(float(a), 5) for a in src])
        # each vowel's formants: the median over every usable singer who sang it on the low note
        out[rng]["formants"] = {}
        out[rng]["counted"] = {}
        for v in VOWELS:
            on_low = [rows[s][v]["formants"] for s in rows if rows[s][v]["low"]]
            use = on_low or [rows[s][v]["formants"] for s in rows]
            out[rng]["counted"][v] = len(on_low)
            out[rng]["formants"][v] = [[round(float(c)) if i < 2 else round(float(c), 1) for i, c in enumerate(col)]
                                       for col in np.median(use, axis=0)]
        report(f"{rng}: formants from " + ", ".join(f"{v} {out[rng]['counted'][v]} singers" for v in VOWELS))
        out[rng]["from"] = best
    # a vowel whose first two formants land outside where that vowel can be (LPC misses a formant that
    # falls between two widely spaced harmonics of a high note) takes the other range's, scaled by the
    # usual ratio of women's to men's formants
    out["fallbacks"] = []
    for rng, other, scale in (("high", "low", 1.15), ("low", "high", 1 / 1.15)):
        for v in VOWELS:
            if plausible(v, out[rng]["formants"][v]) or not plausible(v, out[other]["formants"][v]):
                continue
            out[rng]["formants"][v] = [[round(hz * scale), bw, db] for hz, bw, db in out[other]["formants"][v]]
            out["fallbacks"].append(f"{rng}.{v}")
    return out


# where each vowel's F1 and F2 can be (Hz), for men and women alike: broad, only to catch a missed formant
VOWEL_SPACE = {"a": ((550, 1150), (950, 1900)), "e": ((380, 900), (1450, 2600)), "i": ((220, 520), (1800, 3300)),
               "o": ((330, 750), (650, 1350)), "u": ((230, 560), (550, 1500))}


def plausible(v, fmts):
    (lo1, hi1), (lo2, hi2) = VOWEL_SPACE[v]
    return lo1 <= fmts[0][0] <= hi1 and lo2 <= fmts[1][0] <= hi2


# ---- fetch: the archive's straight long tones, by HTTP ranges -----------------------------------

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
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        buf[:len(data)] = data
        self.pos += len(data)
        return len(data)


def fetch(dest):
    dest.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(io.BufferedReader(RangeFile(URL), buffer_size=1 << 20))
    count = 0
    for info in z.infolist():
        m = LONG_TONE.search(info.filename)
        if not m:
            continue
        out = dest / f"{m['singer']}_{m['vowel']}.wav"
        if not (out.exists() and out.stat().st_size == info.file_size):
            out.write_bytes(z.read(info))
        count += 1
    print(f"{count} long tones in {dest}")


def files_in(src):
    files = {}
    for p in sorted(Path(src).glob("*.wav")):
        m = re.fullmatch(r"(?P<singer>(?P<sex>male|female)\d+)_(?P<vowel>[aeiou])", p.stem)
        if m:
            files[("low" if m["sex"] == "male" else "high", m["singer"], m["vowel"])] = p
    return files


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
    # the pipeline end to end on synthetic singers: tables of the right shape
    with tempfile.TemporaryDirectory() as d:
        for rng_, f0, sex in (("low", 130.81, "male"), ("high", 261.63, "female")):
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
                    x = np.concatenate(notes[:3] if (s, v) == (6, "e") else notes)
                    with wave.open(f"{d}/{sex}{s}_{v}.wav", "wb") as w:
                        w.setnchannels(1)
                        w.setsampwidth(2)
                        w.setframerate(44100)
                        w.writeframes((x * 32767).astype("<i2").tobytes())
        out = measure(files_in(d))
    for rng_ in ("low", "high"):
        assert len(out[rng_]["singers"]) == SINGERS and all(len(s) == HARMONICS for s in out[rng_]["singers"])
        assert set(out[rng_]["formants"]) == set(VOWELS)
        # singer 6 still counts, but its E (sung an octave up) stays out of E's formants
        assert out[rng_]["counted"] == {"a": 6, "e": 5, "i": 6, "o": 6, "u": 6}, out[rng_]["counted"]
        assert all(len(f) == 4 for f in out[rng_]["formants"].values())
        assert all(0 <= a <= 1 for s in out[rng_]["singers"] for a in s)
        # the fundamental and every harmonic near it are there: no note measured an octave off
        assert all(min(s[:6]) > 0.05 for s in out[rng_]["singers"]), out[rng_]["singers"]
    print("selftest ok")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "selftest":
        selftest()
    elif cmd == "fetch" and len(sys.argv) == 3:
        fetch(Path(sys.argv[2]))
    elif cmd == "make" and len(sys.argv) == 4:
        data = measure(files_in(sys.argv[2]))
        Path(sys.argv[3]).write_text(json.dumps(data, indent=1) + "\n")
        print(f"wrote {sys.argv[3]}: {', '.join(data['low']['from'] + data['high']['from'])}")
        if data["fallbacks"]:
            print(f"formants taken from the other range for: {', '.join(data['fallbacks'])}")
    else:
        print(__doc__)
        sys.exit(2)
