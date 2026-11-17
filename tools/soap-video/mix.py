#!/usr/bin/env python3
"""Mix the espeak line WAVs (tts.py) and the page's synthesised stings (render.cjs audio) into one 44.1 kHz WAV.
usage: mix.py TTS_DIR RENDER_DIR OUT.wav [total-seconds]"""
import json, sys, wave
import numpy as np
tts, rd, out = sys.argv[1:4]
meta = json.load(open(f'{rd}/lines.json')); total = float(sys.argv[4]) if len(sys.argv) > 4 else meta['endT'] + 3
SR = 44100; mix = np.zeros(int(total * SR) + SR)
def load(path):
    with wave.open(path) as w:
        sr, n = w.getframerate(), w.getnframes(); a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768
        if w.getnchannels() > 1: a = a.reshape(-1, w.getnchannels()).mean(1)
    return sr, a
sr, sfx = load(f'{rd}/sfx.wav'); sfx = np.interp(np.arange(0, len(sfx) * SR / sr) * sr / SR, np.arange(len(sfx)), sfx)
n = min(len(sfx), len(mix)); mix[:n] += sfx[:n] * 0.9
for ln in meta['lines']:
    _, a = load(f"{tts}/line_{ln['i']}.wav"); s = int(ln['t'] * SR); e = min(len(mix), s + len(a)); mix[s:e] += a[:e - s] * 1.1
peak = np.abs(mix).max(); mix *= 0.89 / max(peak, 1e-6)
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print('mix', len(mix) / SR, 's, peak was', round(float(peak), 2))
