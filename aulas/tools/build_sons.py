#!/usr/bin/env python3
"""Synthesise the two sound tracks the Aulas 6 and 7 demos play (our own work, CC0).

Both files are 32 beats of 4/4 at 120 BPM -- exactly 16 s, mono -- and both
start on the first sample, so they line up when Scratch starts them together:
the melody "Brilha, brilha, estrelinha" (public domain, C major) and a
kick/snare/hi-hat beat. The output is byte-identical on every run, so the
committed files are the ones tools/build_sb3.py embeds.

Needs numpy and an ffmpeg built with libmp3lame.

Usage:
    python3 tools/build_sons.py           # write src/sons/*.mp3
    python3 tools/build_sons.py --check   # fail if the committed files differ
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "sons"

RATE = 44100
BPM = 120
BEATS = 32                      # 8 bars of 4/4
BEAT = RATE * 60 // BPM         # 22050 samples, an exact number at 120 BPM
SAMPLES = BEATS * BEAT
BITRATE = "96k"

# "Brilha, brilha, estrelinha" (Twinkle Twinkle Little Star), first two phrases,
# then the same two phrases again: 32 beats, ending on the tonic.
PHRASE_1 = [("C5", 1), ("C5", 1), ("G5", 1), ("G5", 1), ("A5", 1), ("A5", 1), ("G5", 2)]
PHRASE_2 = [("F5", 1), ("F5", 1), ("E5", 1), ("E5", 1), ("D5", 1), ("D5", 1), ("C5", 2)]
MELODY = PHRASE_1 + PHRASE_2 + PHRASE_1 + PHRASE_2

SEMITONES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def freq(name: str) -> float:
    """Frequency of a note name such as `C5` (C4 = middle C = 261.63 Hz)."""
    pitch, octave = name[0], int(name[1:])
    midi = 12 * (octave + 1) + SEMITONES[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


def tone(f: float, seconds: float) -> np.ndarray:
    """A soft flute-like tone: three harmonics under a plucked envelope."""
    t = np.arange(int(round(seconds * RATE))) / RATE
    wave = (np.sin(2 * np.pi * f * t)
            + 0.25 * np.sin(2 * np.pi * 2 * f * t)
            + 0.08 * np.sin(2 * np.pi * 3 * f * t))
    env = np.minimum(1.0, t / 0.008) * np.exp(-t / 0.9)
    release = t > seconds - 0.06
    env[release] *= np.linspace(1.0, 0.0, int(release.sum()))
    return wave * env


def kick() -> np.ndarray:
    """Kick drum: a sine sweeping 140 Hz -> 50 Hz, 0.3 s."""
    t = np.arange(int(0.3 * RATE)) / RATE
    sweep = 50.0 + 90.0 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(sweep) / RATE) * np.exp(-t / 0.09)


def snare(rng: np.random.Generator) -> np.ndarray:
    """Snare drum: high-passed noise plus a 190 Hz body, 0.2 s."""
    t = np.arange(int(0.2 * RATE)) / RATE
    noise = np.diff(rng.standard_normal(len(t)), prepend=0.0)
    return (0.35 * noise + 0.5 * np.sin(2 * np.pi * 190 * t)) * np.exp(-t / 0.05)


def hihat(rng: np.random.Generator) -> np.ndarray:
    """Closed hi-hat: twice-differenced noise, 60 ms."""
    t = np.arange(int(0.06 * RATE)) / RATE
    noise = np.diff(rng.standard_normal(len(t)), n=2, prepend=[0.0, 0.0])
    return noise * np.exp(-t / 0.015) * 0.18


def render_melody() -> np.ndarray:
    out = np.zeros(SAMPLES)
    at = 0
    for name, beats in MELODY:
        # a 30 ms gap keeps two equal notes apart to the ear
        length = beats * BEAT - int(0.03 * RATE)
        seg = tone(freq(name), length / RATE)
        out[at:at + len(seg)] += seg
        at += beats * BEAT
    return out


def render_beat() -> np.ndarray:
    out = np.zeros(SAMPLES)
    rng = np.random.default_rng(20261031)
    for beat in range(BEATS):
        at = beat * BEAT
        bar = beat % 4
        hits = []
        if bar in (0, 2):
            hits.append((0, kick()))
        if bar in (1, 3):
            hits.append((0, snare(rng)))
        hits += [(0, hihat(rng)), (BEAT // 2, hihat(rng))]
        for offset, seg in hits:
            out[at + offset:at + offset + len(seg)] += seg
    return out


def encode_mp3(samples: np.ndarray) -> bytes:
    """Normalise to -1 dBFS, 16-bit mono PCM, then LAME at a fixed bitrate.

    The MP3 is written to a file, not a pipe: ffmpeg only patches the LAME tag
    (encoder delay and padding) on a seekable output, and without it the
    decoder plays 25 ms of silence before the first beat.
    """
    peak = float(np.max(np.abs(samples)))
    pcm = (samples / peak * 0.89 * 32767.0).astype("<i2").tobytes()
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "som.raw"
        target = Path(tmp) / "som.mp3"
        source.write_bytes(pcm)
        subprocess.run([
            "ffmpeg", "-nostdin", "-loglevel", "error",
            "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", str(source),
            "-c:a", "libmp3lame", "-b:a", BITRATE,
            "-map_metadata", "-1", "-id3v2_version", "0", "-f", "mp3", str(target),
        ], check=True)
        return target.read_bytes()


def tracks() -> dict[str, bytes]:
    return {
        "melodia.mp3": encode_mp3(render_melody()),
        "batida.mp3": encode_mp3(render_beat()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="compare the committed MP3s with a fresh synthesis")
    args = parser.parse_args()

    data = tracks()
    failed = False
    OUT.mkdir(parents=True, exist_ok=True)
    for name, content in data.items():
        path = OUT / name
        if args.check:
            current = path.read_bytes() if path.exists() else b""
            ok = current == content
            failed = failed or not ok
            print(f"{'ok' if ok else 'DIFERENTE'}  {path.relative_to(ROOT)}")
        else:
            path.write_bytes(content)
            print(f"wrote {path.relative_to(ROOT)} ({len(content)} bytes)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
