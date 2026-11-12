// Speaking: one entry point, speak(person, text), three output modes (setting `fb_voicemode`, default Babble):
//   'babble' - procedural WebAudio formant-syllable voice driven by person.voice (works with no OS voices, sounds the same everywhere)
//   'synth'  - the browser's speechSynthesis; OS voice picked by voice.hash + a gender hint from person.body (falls back to Babble when there are none)
//   'subs'   - subtitles only
// A subtitle line `Name: "line"` in the speaker's division colour is always shown. Everything is guarded: it never throws in headless/no-audio contexts.
import { DIVISION, DEPT } from './crew.js';
import { habitCue } from './voice.js';

export const MODES = [['babble', 'Babble (procedural)'], ['synth', 'System voices'], ['subs', 'Subtitles only']];
export const NEUTRAL_VOICE = { pitch: 1.0, rate: 1.0, volume: 0.8, formant: 1.0, breath: 0.1, rough: 0.08, vibrato: 0.12, accent: 'flat', size: 0.5, hash: 1 };
let sound = null, mode = null;
export const attach = (s) => { sound = s; };
export function getMode() { if (mode) return mode; try { const m = localStorage.getItem('fb_voicemode'); mode = MODES.some(x => x[0] === m) ? m : 'babble'; } catch (e) { mode = 'babble'; } return mode; }
export function setMode(m) { if (!MODES.some(x => x[0] === m)) return; mode = m; try { localStorage.setItem('fb_voicemode', m); } catch (e) { /* private window */ } if (m !== 'synth') try { speechSynthesis?.cancel(); } catch (e) { /* none */ } }

// ---- text -> syllables ----
const VOW = { a: [800, 1200, 2600], e: [520, 1800, 2500], i: [320, 2250, 3000], o: [500, 900, 2450], u: [360, 820, 2300], y: [330, 2100, 2900] };
const CONS = { p: 'plos', t: 'plos', k: 'plos', b: 'plos', d: 'plos', g: 'plos', c: 'plos', q: 'plos', s: 'fric', f: 'fric', h: 'fric', z: 'fric', v: 'fric', x: 'fric', j: 'fric', m: 'nasal', n: 'nasal' };
export function babblePlan(text, voice = NEUTRAL_VOICE) {
  const out = [], v = voice, base = 0.165 / Math.max(0.5, v.rate); let t = 0, count = 0;
  const words = String(text || '').replace(/…/g, '. ').match(/[A-Za-z0-9'’-]+|[,.!?;:—]/g) || [];
  for (let wi = 0; wi < words.length && count < 80; wi++) {
    const w = words[wi];
    if (/^[,;:—]$/.test(w)) { t += 0.16 / v.rate; continue; }
    if (/^[.!?]$/.test(w)) { t += 0.3 / v.rate; if (out.length) { out[out.length - 1].end = w; } continue; }
    const lw = w.toLowerCase().replace(/[^a-z]/g, 'a'), groups = [...lw.matchAll(/[aeiouy]+/g)];
    const syl = groups.length ? groups.map(m => ({ vow: m[0][0], cons: CONS[lw[m.index - 1]] || (m.index > 0 ? 'liq' : '') })) : [{ vow: 'a', cons: '' }];
    const extra = Math.floor(w.length / 7); for (let k = 0; k < extra && syl.length < 6; k++) syl.push({ vow: lw[(k * 3 + 1) % lw.length].replace(/[^aeiouy]/, 'e'), cons: 'liq' });
    syl.forEach((s, i) => { const last = i === syl.length - 1, d = base * (last ? 1.2 : 1) * (s.cons === 'plos' ? 0.92 : 1); out.push({ at: t, dur: d, vow: s.vow, cons: s.cons, stress: i === 0 || (syl.length > 3 && i === 2), word: wi, last, end: null }); t += d; count++; });
    t += 0.045 / v.rate;
  }
  return { syl: out, total: t + 0.05 };
}
export const estimate = (text, voice) => babblePlan(text, voice || NEUTRAL_VOICE).total;

// ---- Babble ----
function babble(p, text, delay = 0, gainMul = 1) {
  const v = p.voice || NEUTRAL_VOICE, plan = babblePlan(text, v), ctx = sound?.ctx; if (!ctx || !sound.master || ctx.state === 'closed') return plan.total;
  const t0 = ctx.currentTime + 0.05 + delay, f0 = 120 * v.pitch, vol = Math.min(1, v.volume) * 0.34 * gainMul;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f0;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 4.6 + v.vibrato * 2; lfoG.gain.value = f0 * (0.004 + v.vibrato * 0.035); lfo.connect(lfoG); lfoG.connect(osc.frequency);
  const mix = ctx.createGain(), amp = ctx.createGain(); amp.gain.value = 0; mix.gain.value = 1;
  const bands = [0, 1, 2].map(i => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 9, 11][i]; const g = ctx.createGain(); g.gain.value = [1.1, 0.7, 0.35][i]; osc.connect(f); f.connect(g); g.connect(mix); return f; });
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90; mix.connect(hp); hp.connect(amp); amp.connect(sound.master);
  // breath: noise through a band, mixed in under the same envelope. rough: a fast amplitude flutter plus a little noise.
  const nodes = [osc, lfo]; let nz = null;
  if (sound.noiseBuf && (v.breath > 0.03 || v.rough > 0.05)) { nz = ctx.createBufferSource(); nz.buffer = sound.noiseBuf; nz.loop = true; const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 2400 * v.formant; nb.Q.value = 0.7; const ng = ctx.createGain(); ng.gain.value = Math.min(1, v.breath * 0.55 + v.rough * 0.3); nz.connect(nb); nb.connect(ng); ng.connect(amp); nodes.push(nz); }
  if (v.rough > 0.05) { const tr = ctx.createOscillator(), trg = ctx.createGain(); tr.frequency.value = 55 + v.rough * 40; trg.gain.value = v.rough * 0.28 * vol; tr.connect(trg); trg.connect(amp.gain); nodes.push(tr); }
  for (const s of plan.syl) {
    const a = t0 + s.at, e = a + s.dur, F = VOW[s.vow] || VOW.a, ph = s.at / Math.max(0.01, plan.total);
    const sustain = vol * (s.stress ? 1 : 0.8) * (s.cons === 'nasal' ? 0.75 : 1), contour = 1 + (s.stress ? 0.07 : 0) - ph * 0.08 + (s.end === '?' ? 0.18 : s.end ? -0.1 : 0);
    osc.frequency.setTargetAtTime(f0 * contour, a, 0.025);
    bands.forEach((b, i) => b.frequency.setTargetAtTime(F[i] * v.formant * (v.size > 0.8 ? 0.97 : 1), a, 0.02));
    amp.gain.setTargetAtTime(sustain, a, 0.012); amp.gain.setTargetAtTime(0.0001, Math.max(a + 0.02, e - 0.035), 0.012);
    if ((s.cons === 'plos' || s.cons === 'fric') && sound.noiseBuf) {   // consonant: a short burst of noise
      const b = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); b.buffer = sound.noiseBuf; bf.type = s.cons === 'fric' ? 'highpass' : 'bandpass'; bf.frequency.value = s.cons === 'fric' ? 4200 : 1800 * v.formant; bf.Q.value = 1;
      const d = s.cons === 'fric' ? 0.07 : 0.025; bg.gain.setValueAtTime(0, a - 0.01); bg.gain.linearRampToValueAtTime(vol * (s.cons === 'fric' ? 0.5 : 0.8), a); bg.gain.linearRampToValueAtTime(0, a + d); b.connect(bf); bf.connect(bg); bg.connect(sound.master); b.start(a - 0.01, Math.random()); b.stop(a + d + 0.02);
    }
  }
  const end = t0 + plan.total + 0.1; for (const n of nodes) { n.start(t0 - 0.02); n.stop(end); }
  osc.onended = () => { try { amp.disconnect(); mix.disconnect(); } catch (e) { /* already gone */ } };
  return plan.total;
}

// ---- speechSynthesis ----
const FEM = /female|woman|zira|samantha|susan|hazel|karen|moira|fiona|victoria|tessa|allison|ava\b|serena|catherine|kate|libby|sonia|jenny|aria/i, MALE = /\bmale\b|david|mark\b|daniel|alex\b|fred|george|james|tom\b|oliver|rishi|aaron|guy\b|ryan|thomas|arthur/i;
let voicesCache = null;
function osVoices() { try { const l = speechSynthesis.getVoices(); if (l?.length) voicesCache = l; } catch (e) { /* none */ } return voicesCache || []; }
export function pickOsVoice(p, list = osVoices()) {
  if (!list.length) return null; const en = list.filter(x => /^en/i.test(x.lang)), pool = en.length ? en : list, fem = p.body === 'crew_f' || p.body === 'crew_f2';
  const g = pool.filter(x => (fem ? FEM : MALE).test(x.name)), g2 = g.length ? g : pool.filter(x => !(fem ? MALE : FEM).test(x.name)), use = g2.length ? g2 : pool;
  return use[(p.voice?.hash ?? 1) % use.length];
}
function synth(p, text) {
  try {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return null; const list = osVoices(); if (!list.length) return null;
    const v = p.voice || NEUTRAL_VOICE, u = new SpeechSynthesisUtterance(String(text).replace(/…/g, '...')), ov = pickOsVoice(p, list); if (ov) { u.voice = ov; u.lang = ov.lang; }
    u.pitch = Math.min(2, Math.max(0, v.pitch)); u.rate = Math.min(2, Math.max(0.5, v.rate)); u.volume = Math.min(1, Math.max(0, v.volume)); speechSynthesis.speak(u);
    return String(text).split(/\s+/).length * 0.4 / v.rate + 0.4;
  } catch (e) { return null; }
}

// ---- subtitles ----
const SUBS = [];
export function subtitle(p, text, dur, delay = 0) {
  if (typeof document === 'undefined') return; const show = () => {
    let box = document.getElementById('subs'); if (!box) { box = document.createElement('div'); box.id = 'subs'; box.className = 'hud'; document.body.appendChild(box); }
    const d = DEPT[p.dept], col = d ? '#' + DIVISION[d.division].color.toString(16).padStart(6, '0') : '#dfe9f5', el = document.createElement('div'); el.className = 'sub';
    const nm = document.createElement('b'), tx = document.createElement('span'); nm.style.color = col; nm.textContent = (p.short || p.name || 'Crew') + ': '; tx.textContent = '“' + text + '”'; el.append(nm, tx); box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove(); SUBS.push(el);
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => { el.remove(); }, 600); }, (dur + 1.4) * 1000);
  };
  delay > 0 ? setTimeout(show, delay * 1000) : show();
}

// speak(person, text, { delay (s), gain, silent }) -> { dur, mode, text }; person.voice missing = neutral voice. Never throws.
export const LAST = { text: '', person: null, mode: '', dur: 0, n: 0 };
export function speak(person, text, opts = {}) {
  const p = person || { voice: NEUTRAL_VOICE, short: 'Crew' }; let m = getMode(), dur = estimate(text, p.voice);
  try {
    if (!text) return { dur: 0, mode: m, text: '' };
    if (!opts.silent && m === 'synth') { const d = synth(p, text); if (d === null) m = 'babble'; else dur = d; }   // no OS voices: fall back to Babble
    if (!opts.silent && m === 'babble') { if (sound && !sound.ctx) sound.init?.(); dur = babble(p, text, opts.delay || 0, opts.gain ?? 1); }
    subtitle(p, text, dur, opts.delay || 0);
  } catch (e) { /* a broken audio stack must never break the game */ }
  Object.assign(LAST, { text, person: p, mode: m, dur, n: LAST.n + 1 });
  return { dur, mode: m, text };
}
// non-verbal cues (hum, whistle, sigh, clear throat, mutter, knuckles, clicks) from a tag's habit; person.voice colours them
export function cue(person, kind, delay = 0) {
  const ctx = sound?.ctx; if (!ctx || !sound.master || getMode() === 'subs') return; const p = person || { voice: NEUTRAL_VOICE }, v = p.voice || NEUTRAL_VOICE, t = ctx.currentTime + 0.05 + delay;
  try {
    const env = (g, a, d, peak) => { g.gain.setValueAtTime(0.0001, t + a); g.gain.linearRampToValueAtTime(peak, t + a + 0.05); g.gain.linearRampToValueAtTime(0.0001, t + a + d); };
    if (kind === 'hum' || kind === 'whistle') {
      const o = ctx.createOscillator(), g = ctx.createGain(), n = [0, 2, 4, 2, 5, 4, 2], f = (kind === 'hum' ? 100 : 700) * v.pitch; o.type = kind === 'hum' ? 'sawtooth' : 'sine';
      n.forEach((s, i) => o.frequency.setValueAtTime(f * Math.pow(2, s / 12), t + i * 0.28)); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'hum' ? 420 : 3000; o.connect(lp); lp.connect(g); g.connect(sound.master); env(g, 0, 2, kind === 'hum' ? 0.07 : 0.035); o.start(t); o.stop(t + 2.1);
    } else if (kind === 'mutter') babble({ ...p, voice: { ...v, volume: 0.35 } }, 'mm hmm mm', delay, 1);
    else if (sound.noiseBuf) {   // sigh / clear / crack / smack / click2: shaped noise
      const clicks = kind === 'click2' ? [0, 0.14] : kind === 'crack' ? [0, 0.1, 0.19] : kind === 'smack' ? [0, 0.3] : [0], sigh = kind === 'sigh', clear = kind === 'clear';
      for (const c of clicks) { const b = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); b.buffer = sound.noiseBuf; f.type = sigh ? 'lowpass' : 'bandpass'; f.frequency.value = sigh ? 1200 : clear ? 500 : 2400; f.Q.value = 1; const d = sigh ? 0.9 : clear ? 0.25 : 0.03; g.gain.setValueAtTime(0, t + c); g.gain.linearRampToValueAtTime(sigh ? 0.07 : 0.1, t + c + 0.01); g.gain.linearRampToValueAtTime(0, t + c + d); b.connect(f); f.connect(g); g.connect(sound.master); b.start(t + c, Math.random()); b.stop(t + c + d + 0.05); }
    }
  } catch (e) { /* silent */ }
}
export { habitCue };
