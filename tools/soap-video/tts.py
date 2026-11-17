#!/usr/bin/env python3
"""Synthesise every spoken line of js/soap-script.js with espeak-ng (one slowed voice per character),
write WAVs + durs.json (seconds per beat index) into the output dir.  usage: tts.py OUTDIR [speed-scale]"""
import json, re, subprocess, sys, os, wave
out = sys.argv[1]; scale = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
os.makedirs(out, exist_ok=True)
src = open(os.path.join(os.path.dirname(__file__), '../../js/soap-script.js')).read()
beats = json.loads(src[src.index('['):src.rindex(']') + 1])
# voice, pitch(0-99), speed(wpm), word gap(10ms), ffmpeg filter
V = {
 'COMPUTER': ('en-us+f5', 35, 112, 2, 'aecho=0.8:0.6:40:0.3,highpass=f=120'),
 'TREMBLAY': ('en-gb-x-rp+m3', 38, 112, 1, 'aecho=0.7:0.5:60:0.15'),
 'OKAFOR':   ('en-us+f3', 58, 118, 1, ''),
 'REAL':     ('en-us+f4', 66, 132, 0, ''),
 'MACLEOD':  ('en-gb-scotland+m6', 28, 108, 1, ''),
 'DOC':      ('en-us+f2', 72, 112, 1, 'tremolo=f=9:d=0.35,aecho=0.8:0.7:35:0.4'),
 'GORN':     ('en-us+m1', 4, 70, 12, 'asetrate=44100*0.82,aresample=44100,lowpass=f=1800,acompressor,aecho=0.8:0.5:90:0.35,volume=1.4'),
 'DRONE':    ('en-us+m5', 8, 96, 3, 'tremolo=f=38:d=0.55,aecho=0.8:0.6:25:0.5,volume=1.1'),
}
durs = {}
for i, b in enumerate(beats):
    if b['k'] != 'line': continue
    v, p, s, g, fx = V[b['who']]; txt = b['t'].replace('...', ' ... ')
    raw = f'{out}/raw_{i}.wav'; fin = f'{out}/line_{i}.wav'
    subprocess.run(['espeak-ng', '-v', v, '-p', str(p), '-s', str(int(s * scale)), '-g', str(g), '-w', raw, txt], check=True)
    chain = (fx + ',' if fx else '') + 'apad=pad_dur=0.05,aresample=44100'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', chain, '-ac', '1', fin], check=True)
    with wave.open(fin) as w: durs[i] = w.getnframes() / w.getframerate()
    os.remove(raw)
json.dump(durs, open(f'{out}/durs.json', 'w'))
tot = 0.0
for i, b in enumerate(beats):
    tot += durs[i] + 0.45 if b['k'] == 'line' else b['s'] if b['k'] == 'sfx' else 0
print(f'lines {len(durs)}, total {tot:.1f}s = {int(tot//60)}:{int(tot%60):02d}')
