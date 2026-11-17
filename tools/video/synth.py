#!/usr/bin/env python3
"""Procedural sea-shanty choir for the shanty video (numpy only, no samples, no TTS).

    python3 tools/video/synth.py [out/song.json] [out/cast.json] -> tools/video/out/shanty.wav (stereo, 44.1 kHz, 16 bit)

Voices are additive glottal-pulse spectra (harmonics with a -12 dB/oct source roll-off) shaped by five vowel formants per
voice type (bass / tenor / alto / soprano tables), with vibrato that eases in, pitch drift, detune and onset jitter per
singer, short consonant noise at syllable onsets and diphthong glides. The words are NOT intelligible (vowels and a hiss
of consonants only): the video shows the lyrics as karaoke captions. On top: stomps (beats 1 and 3), claps (2 and 4),
a squeezebox (two detuned reeds, bellows swell) on the chords plus the tune in the intro, a bass drone, and a simple
stereo convolution room. Deterministic (fixed seeds).
"""
import json, sys, wave, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
SR = 44100
CR = 500                      # control rate (Hz) for pitch / amplitude / formant curves
rng = np.random.default_rng(1867)

# ---- formant tables: vowel -> (freqs Hz, amps dB, bandwidths Hz) per voice type --------------------------------------
FT = {
 'bass': {'a': ([600, 1040, 2250, 2450, 2750], [0, -7, -9, -9, -20], [60, 70, 110, 120, 130]),
          'e': ([400, 1620, 2400, 2800, 3100], [0, -12, -9, -12, -18], [40, 80, 100, 120, 120]),
          'i': ([250, 1750, 2600, 3050, 3340], [0, -30, -16, -22, -28], [60, 90, 100, 120, 120]),
          'o': ([400, 750, 2400, 2600, 2900], [0, -11, -21, -20, -40], [40, 80, 100, 120, 120]),
          'u': ([350, 600, 2400, 2675, 2950], [0, -20, -32, -28, -36], [40, 80, 100, 120, 120])},
 'tenor': {'a': ([650, 1080, 2650, 2900, 3250], [0, -6, -7, -8, -22], [80, 90, 120, 130, 140]),
           'e': ([400, 1700, 2600, 3200, 3580], [0, -14, -12, -14, -20], [70, 80, 100, 120, 120]),
           'i': ([290, 1870, 2800, 3250, 3540], [0, -15, -18, -20, -30], [40, 90, 100, 120, 120]),
           'o': ([400, 800, 2600, 2800, 3000], [0, -10, -12, -12, -26], [40, 80, 100, 120, 120]),
           'u': ([350, 600, 2700, 2900, 3300], [0, -20, -17, -14, -26], [40, 60, 100, 120, 120])},
 'alto': {'a': ([800, 1150, 2800, 3500, 4950], [0, -4, -20, -36, -60], [80, 90, 120, 130, 140]),
          'e': ([400, 1600, 2700, 3300, 4950], [0, -24, -30, -35, -60], [60, 80, 120, 150, 200]),
          'i': ([350, 1700, 2700, 3700, 4950], [0, -20, -30, -36, -60], [50, 100, 120, 150, 200]),
          'o': ([450, 800, 2830, 3500, 4950], [0, -9, -16, -28, -55], [70, 80, 100, 130, 135]),
          'u': ([325, 700, 2530, 3500, 4950], [0, -12, -30, -40, -64], [50, 60, 170, 180, 200])},
 'soprano': {'a': ([800, 1150, 2900, 3900, 4950], [0, -6, -32, -20, -50], [80, 90, 120, 130, 140]),
             'e': ([350, 2000, 2800, 3600, 4950], [0, -20, -15, -40, -56], [60, 100, 120, 150, 200]),
             'i': ([270, 2140, 2950, 3900, 4950], [0, -12, -26, -26, -44], [60, 90, 100, 120, 120]),
             'o': ([450, 800, 2830, 3800, 4950], [0, -11, -22, -22, -50], [70, 80, 100, 130, 135]),
             'u': ([325, 700, 2700, 3800, 4950], [0, -16, -35, -40, -60], [50, 60, 170, 180, 200])},
}
FT['baritone'] = {v: (list((np.array(FT['bass'][v][0]) * 0.55 + np.array(FT['tenor'][v][0]) * 0.45)), FT['bass'][v][1], FT['bass'][v][2]) for v in 'aeiou'}
VOW = 'aeiou'

def vowels_of(word):
    """first vowel sound and an optional glide target for a sung syllable (rough English spelling rules)"""
    w = word.lower().strip("!-'")
    table = [('igh', 'a', 'i'), ('ign', 'a', 'i'), ('ay', 'e', 'i'), ('ey', 'e', 'i'), ('ee', 'i', None), ('ea', 'i', None), ('oo', 'u', None),
             ('or', 'o', None), ('ar', 'a', None), ('er', 'e', None), ('ou', 'a', 'u'), ('ow', 'a', 'u')]
    for pat, v, g in table:
        if pat in w: return v, g
    special = {'do': ('u', None), 'the': ('e', None), 'we': ('i', None), 'she': ('i', None), 'ly': ('i', None), 'ty': ('i', None),
               'up': ('a', None), 'drun': ('o', None), 'scrub': ('o', None), 'ri': ('a', 'i'), 're': ('i', None), 'what': ('o', None),
               'shave': ('e', 'i'), 'make': ('e', 'i'), 'way': ('e', 'i'), 'hay': ('e', 'i'), "he's": ('i', None), 'so': ('o', 'u'),
               'plat': ('a', None), 'phas': ('e', 'i'), 'a': ('a', None), 'ac': ('a', None), 'tor': ('o', None), 'bay': ('e', 'i')}
    if w in special: return special[w]
    for ch in w:
        if ch in 'aeiou': return {'a': 'a', 'e': 'e', 'i': 'i', 'o': 'o', 'u': 'o'}[ch], None
        if ch == 'y': return 'i', None
    return 'a', None

def consonant_of(word):
    w = word.lower().strip("!-'")
    if w.startswith(('sh', 'ch', 's', 'z', 'c')) and not w.startswith('ca'): return 'hiss'
    if w.startswith('th'): return 'soft'
    if w.startswith(('p', 't', 'k', 'b', 'd', 'g', 'ca')): return 'plosive'
    if w.startswith('h') or w.startswith('wh'): return 'breath'
    return None

def midi_hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def smooth(x, n):
    if n < 2: return x
    k = np.hanning(n); k /= k.sum(); pad = n // 2
    y = np.convolve(np.pad(x, pad, mode='edge'), k, mode='same')[pad:pad + len(x)]
    return y

# ---- one singer -------------------------------------------------------------------------------------------------------------
def sing(events, total_s, vtype, seed, gain=1.0, vib_depth=0.35, solo=False):
    """events: [(t0, dur, midi, word)], returns mono float32 of length total_s*SR"""
    r = np.random.default_rng(seed)
    nC = int(total_s * CR) + 2
    midi = np.full(nC, np.nan); amp = np.zeros(nC); since = np.zeros(nC); vix = np.zeros(nC); vgl = np.full(nC, -1.0); glk = np.zeros(nC)
    detune = r.normal(0, 0.08) if not solo else r.normal(0, 0.03)        # semitones
    late = r.normal(0.012, 0.018) if not solo else 0.0                    # onset jitter (s)
    vib_rate = r.uniform(4.8, 6.0); vib_d = vib_depth * r.uniform(0.7, 1.2)
    cons = []
    for (t0, dur, m, w) in events:
        t0 += late + r.normal(0, 0.006)
        a = int(max(0, t0) * CR); b = int(min(total_s, t0 + dur * 0.93) * CR)
        if b <= a: continue
        midi[a:b] = m + detune
        n = b - a; tt = np.arange(n) / CR
        att = 0.045 if consonant_of(w) in ('plosive', 'hiss') else 0.08
        env = np.minimum(1, tt / att) * np.minimum(1, (n / CR - tt) / 0.06)
        env *= 1.0 - 0.12 * np.minimum(1, tt / max(0.3, dur))               # slight decay on long notes
        amp[a:b] = np.maximum(amp[a:b], env)
        since[a:b] = tt
        v, g = vowels_of(w); vix[a:b] = VOW.index(v)
        if g: gs = a + int(n * 0.6); vgl[gs:b] = VOW.index(g)
        c = consonant_of(w)
        if c: cons.append((t0, c))
    on = ~np.isnan(midi)
    if not on.any(): return np.zeros(int(total_s * SR), np.float32)
    # pitch: fill rests with neighbours, glide (portamento) between notes, vibrato easing in, slow drift
    idx = np.arange(nC); m_f = np.interp(idx, idx[on], midi[on])
    m_f = smooth(m_f, int(0.035 * CR))
    drift = smooth(r.normal(0, 1, nC), int(0.4 * CR)); drift *= 0.06 / (np.std(drift) + 1e-9)
    vib = vib_d * np.minimum(1, np.maximum(0, since - 0.18) / 0.35) * np.sin(2 * np.pi * vib_rate * idx / CR + r.uniform(0, 6.28))
    m_f = m_f + drift + vib
    f0 = midi_hz(m_f)
    # vowel formants per control frame (smoothed transitions)
    vidx = vix.copy(); vidx[vgl >= 0] = vgl[vgl >= 0]
    T = FT[vtype]; F = np.zeros((5, nC)); A = np.zeros((5, nC)); B = np.zeros((5, nC))
    for k, v in enumerate(VOW):
        sel = vidx == k
        fr, ad, bw = T[v]
        for j in range(5): F[j, sel] = fr[j]; A[j, sel] = ad[j]; B[j, sel] = bw[j] * 1.6
    # unfilled frames (rests) take the neighbour vowel
    for arr in (F, A, B):
        for j in range(5):
            row = arr[j]; good = row != 0
            if good.any(): row[:] = np.interp(idx, idx[good], row[good])
            arr[j] = smooth(row, int(0.05 * CR))
    form_shift = r.uniform(0.95, 1.06)
    F *= form_shift
    amp = smooth(amp, int(0.02 * CR))
    # additive synthesis on the active spans only
    out = np.zeros(int(total_s * SR), np.float32)
    act = amp > 1e-3
    # spans of activity
    edges = np.flatnonzero(np.diff(np.r_[0, act.astype(np.int8), 0]))
    starts, ends = edges[0::2], edges[1::2]
    K = int(min(60, 5200 / max(60, np.nanmin(f0[act])))) if act.any() else 0
    breath = 0.035 if vtype in ('alto', 'soprano') else 0.025
    for s, e in zip(starts, ends):
        s0 = max(0, s - 2); e0 = min(nC - 1, e + 2)
        cidx = np.arange(s0, e0 + 1)
        a0 = int(s0 * SR / CR); a1 = min(len(out), int(e0 * SR / CR))
        if a1 - a0 < 16: continue
        ta = np.arange(a0, a1) * CR / SR
        f0a = np.interp(ta, cidx, f0[cidx])
        # glottal jitter / shimmer
        f0a *= 1 + 0.003 * np.interp(ta, cidx, r.normal(0, 1, len(cidx)))
        ph = 2 * np.pi * np.cumsum(f0a) / SR + r.uniform(0, 6.28)
        sig = np.zeros(a1 - a0)
        fc = f0[cidx]
        for k in range(1, K + 1):
            fk = fc * k
            env = np.zeros(len(cidx))
            for j in range(5):
                env += 10 ** (A[j, cidx] / 20) / (1 + ((fk - F[j, cidx]) / (B[j, cidx] / 2)) ** 2)
            ak = env * (k ** -0.9) * (1 + 1.8 * np.exp(-((fk - 2900) / 500) ** 2)) * (fk < SR * 0.42)   # + the "singer's formant" ring near 3 kHz
            if ak.max() < 1e-4: continue
            sig += np.interp(ta, cidx, ak) * np.sin(k * ph)
        # breath noise shaped roughly like the vowel (high-passed, follows the amplitude)
        nz = r.normal(0, 1, a1 - a0); nz = np.diff(nz, prepend=0) * 0.5
        sig += breath * nz * np.interp(ta, cidx, np.ones(len(cidx)))
        sig *= np.interp(ta, cidx, amp[cidx])
        out[a0:a1] += sig.astype(np.float32)
    # consonants
    for (t0, c) in cons:
        a = int((t0 - 0.03) * SR)
        if a < 0: continue
        if c == 'hiss': n = int(0.075 * SR); z = np.diff(r.normal(0, 1, n + 1)); e = np.sin(np.linspace(0, np.pi, n)) ** 2; z = z * e * 0.10
        elif c == 'soft': n = int(0.04 * SR); z = np.diff(r.normal(0, 1, n + 1)) * np.hanning(n) * 0.04
        elif c == 'breath': n = int(0.06 * SR); z = r.normal(0, 1, n) * np.hanning(n) * 0.035
        else: n = int(0.012 * SR); z = np.diff(r.normal(0, 1, n + 1)) * np.exp(-np.linspace(0, 6, n)) * 0.16
        b = min(len(out), a + n); out[a:b] += z[:b - a].astype(np.float32)
    return out * gain

# ---- percussion + squeezebox ------------------------------------------------------------------------------------------------
def stomp(n, r):
    t = np.arange(n) / SR
    f = 95 * np.exp(-t * 9) + 42
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 13)
    knock = r.normal(0, 1, n) * np.exp(-t * 70); knock = smooth(knock, 9)    # wooden deck plate, low-passed
    return s * 0.9 + knock * 0.5

def clap(n, r):
    t = np.arange(n) / SR
    z = r.normal(0, 1, n); z = np.diff(z, prepend=0) - 0.4 * np.diff(np.diff(z, prepend=0), prepend=0)
    env = np.exp(-t * 38)
    for d in (0.0, 0.008, 0.015):                                         # a clap is a few quick slaps
        env += 0.6 * np.exp(-np.maximum(0, t - d) * 180) * (t >= d)
    return z * env * 0.35

CHORD = {'Dm': [50, 53, 57], 'C': [48, 52, 55], 'Am': [45, 48, 52], 'G': [43, 47, 50]}

def reed(t0, dur, midi, total, r, gain=1.0):
    n0 = int(t0 * SR); n = int(dur * SR); n = min(n, total - n0)
    if n <= 0: return n0, np.zeros(0)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for det in (-0.07, 0.07):                                              # musette: two reeds a few cents apart
        f = midi_hz(midi + det)
        ph = 2 * np.pi * f * t + r.uniform(0, 6)
        for k in range(1, int(min(28, 6000 / f)) + 1):
            a = (k ** -1.0) * (1.0 if k % 2 else 0.55) * (1 + 1.2 * np.exp(-((k * f - 1500) / 700) ** 2))
            sig += a * np.sin(k * ph)
    env = np.minimum(1, t / 0.035) * np.minimum(1, (dur - t) / 0.05) * (0.85 + 0.15 * np.sin(np.pi * np.minimum(1, t / max(dur, 1e-3))))
    return n0, sig * env * gain * 0.08

def room_ir(r, secs=1.25):
    n = int(secs * SR); t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for c in range(2):
        z = r.normal(0, 1, n) * np.exp(-t * 6.9 / secs * 1.0)
        z = smooth(z, 3)
        z[:int(0.012 * SR)] = 0
        ir[:, c] = z
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    return ir

def fftconv(x, h):
    n = len(x) + len(h) - 1; N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[:len(x)]

# ---- main ---------------------------------------------------------------------------------------------------------------------
def main():
    song = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, 'song.json')))
    cast_p = sys.argv[2] if len(sys.argv) > 2 else os.path.join(OUT, 'cast.json')
    cast = json.load(open(cast_p)) if os.path.exists(cast_p) else {}
    E = song['E']; total = song['dur'] + 1.5; NT = int(total * SR)
    L = np.zeros(NT); R = np.zeros(NT)

    def add(sig, pan, at=0):
        """equal-power pan, -1 left .. 1 right"""
        a = (pan + 1) * np.pi / 4; b = min(NT, at + len(sig))
        L[at:b] += sig[:b - at] * np.cos(a); R[at:b] += sig[:b - at] * np.sin(a)

    notes = song['notes']
    blocks = song['blocks']
    leads = {int(k): v for k, v in (cast.get('leads') or {}).items()}

    # per block: share of women on that deck (choir mix), default 45 %
    fem = {int(k): v for k, v in (cast.get('femShare') or {}).items()}

    # choir parts: list of (vtype, transpose, part filter, count, gain)
    def part_notes(pred, transpose=0):
        return [(n['e'] * E, n['n'] * E, n['midi'] + transpose, n['w']) for n in notes if pred(n)]

    def harmony_third(m):   # diatonic third below in D dorian (D E F G A B C)
        scale = [62, 64, 65, 67, 69, 71, 72, 74, 76]
        pcs = [p % 12 for p in scale]
        pc = m % 12
        if pc not in pcs: return m - 3
        i = pcs.index(pc); below = scale[(i - 2) % 7] % 12
        d = (pc - below) % 12
        return m - d

    is_all = lambda n: n['part'] == 'all'
    chorus_block = lambda n: n['block'] < len(blocks) and blocks[n['block']]['kind'] == 'chorus'
    seed = 100
    mix_voices = []
    # men on the tune an octave down (baritones + tenors), women on the tune (altos + sopranos), altos a third below in the choruses + tag, basses on roots
    for i in range(9):
        mix_voices.append(('baritone' if i % 2 else 'tenor', -12, is_all, 1.0))
    for i in range(7):
        mix_voices.append(('alto' if i % 3 == 0 else 'soprano', 0, is_all, 0.6))
    for i in range(4):
        mix_voices.append(('alto', 'h3', lambda n: is_all(n) and (chorus_block(n) or n.get('tag')), 0.4))
    for vi, (vt, tr, pred, g) in enumerate(mix_voices):
        if tr == 'h3': ev = [(n['e'] * E, n['n'] * E, harmony_third(n['midi']), n['w']) for n in notes if pred(n)]
        else: ev = part_notes(pred, tr)
        sig = sing(ev, total, vt, seed + vi, gain=g)
        # verses (deck crew) a little softer than choruses (whole ship); fade per block by the deck's mix of voices
        env = np.ones(NT)
        for b in blocks:
            a0 = int(b['e0'] * E * SR); a1 = int(b['e1'] * E * SR)
            w = 0.8 if b['kind'] == 'verse' else 1.0
            fs = fem.get(b['i'], 0.45)
            w *= (fs / 0.45) ** 0.5 if vt in ('alto', 'soprano') else ((1 - fs) / 0.55) ** 0.5
            env[a0:a1] = w
        env = smooth(env, int(0.08 * SR)) if False else env
        sig = sig[:NT] * env[:len(sig)]
        add(sig, rng.uniform(-0.65, 0.65))
        print('voice', vi, vt, flush=True)
    # bass: chord roots on the sung syllables' rhythm
    chords = song['chords']
    def root_at(e):
        for c in chords:
            if c['e'] <= e < c['e'] + c['n']: return CHORD[c['ch']][0] - 12
        return 38
    bass_ev = [(n['e'] * E, n['n'] * E, root_at(n['e']) + (12 if root_at(n['e']) < 40 else 0), n['w']) for n in notes if is_all(n)]
    for i in range(4):
        add(sing(bass_ev, total, 'bass', 300 + i, gain=0.9)[:NT], rng.uniform(-0.4, 0.4))
        print('bass', i, flush=True)
    # leads (verse line 1 of each verse block): one singer, register from the lead's voice profile
    for b in blocks:
        if b['kind'] != 'verse': continue
        ld = leads.get(b['i'], {})
        vt = ld.get('vtype', 'baritone'); tr = 0 if vt in ('alto', 'soprano') else -12
        ev = [(n['e'] * E, n['n'] * E, n['midi'] + tr, n['w']) for n in notes if n['block'] == b['i'] and n['part'] == 'lead']
        add(sing(ev, total, vt, 500 + b['i'], gain=3.4, vib_depth=0.45, solo=True)[:NT], 0.0)
        print('lead', b['i'], vt, flush=True)

    # squeezebox: chords on every beat (oom-pah: root on the beat, triad on the off-beat), the tune in the intro
    rb = np.random.default_rng(7)
    sq = np.zeros(NT)
    for c in chords:
        notes3 = CHORD[c['ch']]
        for beat in range(c['n'] // 2):
            t0 = (c['e'] + beat * 2) * E
            if t0 > song['dur'] - 2: continue
            n0, s = reed(t0, E * 0.9, notes3[0] - 12, NT, rb, 1.1)
            sq[n0:n0 + len(s)] += s
            for m in notes3:
                n0, s = reed(t0 + E, E * 0.8, m, NT, rb, 0.55)
                sq[n0:n0 + len(s)] += s
    # intro tune (the chorus melody) on the squeezebox, an octave down, and the final held chord
    intro_tune = [(0, 4, 69), (4, 2, 69), (6, 1, 69), (7, 1, 69), (8, 2, 62), (10, 2, 65), (12, 4, 69), (16, 4, 67), (20, 2, 67), (22, 1, 67), (23, 1, 67), (24, 2, 60), (26, 2, 64), (28, 4, 67)]
    for (e0, n, m) in intro_tune:
        n0, s = reed(e0 * E, n * E * 0.95, m, NT, rb, 2.2); sq[n0:n0 + len(s)] += s
    tagE = song['tagE']
    for m in CHORD['Dm'] + [62]:
        n0, s = reed((tagE + 8) * E, (song['endE'] - tagE - 8) * E, m, NT, rb, 0.8); sq[n0:n0 + len(s)] += s
    add(sq, -0.35)
    print('squeezebox', flush=True)

    # percussion: stomps on 1 and 3, claps on 2 and 4 (the lead's call has stomps only), a big stomp to finish
    rp = np.random.default_rng(11)
    perc = np.zeros(NT)
    lead_spans = [(l['e0'], l['e0'] + 16) for l in song['lines'] if l['part'] == 'lead']
    for e in range(0, int(tagE) + 8, 2):
        beat = (e // 2) % 4; t0 = e * E
        if e >= tagE: break
        solo = any(a <= e < b for a, b in lead_spans)
        if beat in (0, 2):
            for k in range(6 if not solo else 3):
                s = stomp(int(0.35 * SR), rp); at = max(0, int((t0 + rp.normal(0, 0.012)) * SR))
                b = min(NT, at + len(s)); perc[at:b] += s[:b - at] * (0.32 if beat == 0 else 0.26)
        elif not solo and e >= 8:
            for k in range(9):
                s = clap(int(0.18 * SR), rp); at = max(0, int((t0 + rp.normal(0, 0.01)) * SR))
                b = min(NT, at + len(s)); pan = rp.uniform(-0.7, 0.7)
                a = (pan + 1) * np.pi / 4
                L[at:b] += s[:b - at] * 0.22 * np.cos(a); R[at:b] += s[:b - at] * 0.22 * np.sin(a)
    for k in range(10):   # final stomp on the downbeat after the held note
        s = stomp(int(0.6 * SR), rp); at = int(((song['endE'] - 4) * E + rp.normal(0, 0.015)) * SR)
        b = min(NT, at + len(s)); perc[at:b] += s[:b - at] * 0.4
    add(perc, 0.0)
    print('percussion', flush=True)

    # room: ~1.2 s convolution reverb, 22 % wet
    ir = room_ir(np.random.default_rng(3))
    wetL = fftconv(L, ir[:, 0]); wetR = fftconv(R, ir[:, 1])
    dry = np.stack([L, R], 1); wet = np.stack([wetL, wetR], 1)
    mix = dry + 0.22 * wet * (np.sqrt((dry ** 2).mean()) / (np.sqrt((wet ** 2).mean()) + 1e-9))
    # gentle fade-in / out, peak normalise to -1 dBFS (loudnorm runs at mux time)
    fi = int(0.03 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    fo = int(1.2 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    mix /= np.abs(mix).max() / 10 ** (-1 / 20)
    pcm = (mix * 32767).astype(np.int16)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'shanty.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('wrote', path, f'{len(pcm) / SR:.2f} s')

if __name__ == '__main__':
    main()
