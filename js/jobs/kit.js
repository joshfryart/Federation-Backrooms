// Job-module helper kit (Systems Nominal, docs/procedures.md). Every job in js/jobs/<billet>__<slug>.js is its OWN mechanic built on this kit:
// a seeded state machine with a fault counter and a clock, plus input helpers, an LCARS canvas toolkit (console jobs) and the in-room site
// helpers (room jobs). Pure logic (no DOM, no three.js): node runs every module headless (tools/check-jobs.mjs).
//   jobKey(billet, label, type) / jobId(...)  stable id of a job: 'j' + 8 hex of FNV-1a('billet|label|type'); type 'loop' or 'task:<mission>'
//   machine(mod, seed, opts)    -> m { state 'play'|'win'|'fail'|'cancel', t, limit, strikes (= faults), maxStrikes, events, why, rnd, calm, cb,
//                                     fault(why), win(), fail(why), cancel(), result(), live(dt) (advance the clock: false when not playing) }
//   room(m, sites)              -> adds m.sites [{ name, prop, prog, done }], m.next, m.cur(inp) (the site being worked or null), m.finish(i)
//   keys: DIG(code) 1..9 | 0, ARROW(code) 'U'|'D'|'L'|'R'|null, SPACE(code), ENTER(code)
//   draw: COL, txt(c, s, x, y, o), box(c, x, y, w, h, fill, stroke, r), bar(c, x, y, w, h, v, o), lamp(c, x, y, r, col, mark), wrapText(s, n)
export const MIN_LIMIT = 12, MAX_LIMIT = 40;

export function hashStr(s) { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const jobKey = (billet, label, type) => `${billet}|${label}|${type}`;
export const jobId = (billet, label, type) => 'j' + hashStr(jobKey(billet, label, type)).toString(16).padStart(8, '0');
export const slug = (s) => String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
// file name for a job: <billet>__<slug(label)>[__<mission>].js
export const fileFor = (billet, label, type) => `${billet}__${slug(label)}${type === 'loop' ? '' : '__' + type.replace(/^task:/, '')}.js`;

// every module: export default define({ job: { billet, label, type }, title, ... create(seed, opts) { const m = machine(this, seed, opts); ... } })
export function define(mod) { mod.id = jobId(mod.job.billet, mod.job.label, mod.job.type); return mod; }

// ---- seeded randomness
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
export const rf = (rnd, a, b) => a + rnd() * (b - a);
export const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
export const shuffle = (rnd, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// ---- keys (console jobs). Never use J / H / K / L / Q / P / B / Esc / Backspace: the menu router keeps them
export const DIG = (code) => { const m = /^(?:Digit|Numpad)([1-9])$/.exec(code || ''); return m ? +m[1] : 0; };
const ARR = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' };
export const ARROW = (code) => ARR[code] || null;
export const SPACE = (code) => code === 'Space';
export const ENTER = (code) => code === 'Enter' || code === 'NumpadEnter';
export const RESERVED = ['KeyJ', 'KeyH', 'KeyK', 'KeyL', 'KeyQ', 'KeyP', 'KeyB', 'Escape', 'Backspace'];

// ---- the state machine every job shares: clock, faults, end states. mod: the module (limit, maxFaults); opts: { calm, cb, label }
export function machine(mod, seed = 1, opts = {}) {
  const calm = !!opts.calm, m = {
    id: mod.id, state: 'play', t: 0, limit: Math.round(mod.limit * (calm ? 1.5 : 1) * 10) / 10, strikes: 0, maxStrikes: mod.maxFaults ?? 3, events: [], why: null,
    rnd: rng((seed ^ hashStr(mod.id || mod.title || '')) >>> 0), calm, cb: !!opts.cb, label: opts.label || '', held: {},
  };
  m.evn = 0; m.ev = (type, x = {}) => { const e = { type, t: +m.t.toFixed(2), ...x }; m.evn++; m.events.push(e); if (m.events.length > 40) m.events.shift(); return e; };
  m.fault = (why) => { if (m.state !== 'play') return; m.strikes++; m.ev('strike', { why }); if (m.maxStrikes && m.strikes >= m.maxStrikes) m.fail(why); };
  m.win = () => { if (m.state !== 'play') return; m.state = 'win'; m.ev('win'); };
  m.fail = (why) => { if (m.state !== 'play') return; m.state = 'fail'; m.why = why || null; m.ev('fail', { why }); };
  m.cancel = () => { if (m.state === 'play') { m.state = 'cancel'; m.ev('cancel'); } };
  m.result = () => ({ state: m.state, strikes: m.strikes, faults: m.strikes, t: +m.t.toFixed(2), why: m.why });
  m.live = (dt, away = false) => { if (m.state !== 'play') return false; if (!away) m.t += dt; if (m.t >= m.limit) { m.fail('time'); return false; } return true; };
  m.key = () => false; m.tick = (dt) => { m.live(dt); };   // console modules override
  m.hint = () => []; m.bad = () => null; m.view = () => ({}); m.buttons = () => []; m.draw = () => { };
  return m;
}
// ---- in-room jobs: the sites the job is done at (resolved to room props / floor by the host, js/jobs/host.js). Sites are worked in order.
// inp (per frame): { at: site index in reach and faced (-1 none), hold: E held, press: E went down, look: view yaw minus the bearing the site was
// first faced at (rad, + = left), turn: |view turn speed| (rad/s), swing: signed yaw speed (rad/s, + = left), hasItem, away: outside the room }
export function room(m, sites) {
  m.sites = sites.map(s => ({ name: s.name, prop: s.prop || null, prog: 0, done: false }));
  m.next = 0; m.prev = false;
  m.cur = (inp) => { const i = inp?.at ?? -1; if (i < 0 || m.sites[i]?.done) return null; if (i !== m.next) { if (inp.press) m.ev('blocked', { site: i, why: 'order' }); return null; } return m.sites[i]; };
  m.finish = (i) => { const s = m.sites[i]; if (!s || s.done) return; s.done = true; s.prog = 1; m.ev('site', { site: i }); m.next = m.sites.findIndex(x => !x.done); if (m.next < 0) m.win(); };
  m.released = (inp) => { const r = m.prev && !inp.hold; m.prev = !!inp.hold; return r; };   // call once per step: E just let go
  m.panel = () => ({ label: '', value: '' }); m.prompt = () => '';
  return m;
}

// ---- LCARS canvas toolkit (console jobs draw on a 400 x 170 canvas; the UI paints the background grid and corner brackets first)
export const COL = { ink: '#f3eee6', dim: '#a8a6b9', gold: '#f4c25b', orange: '#f0933a', peri: '#7d97e8', lav: '#b99be6', pale: '#f7c9a2', panel: '#1d1a33', dark: '#0a0912', warn: '#ffb347' };
export const MARKS = ['circle', 'triangle', 'square', 'diamond'];
export function txt(c, s, x, y, o = {}) { c.fillStyle = o.col || COL.ink; c.font = `${o.w || 700} ${o.size || 12}px ${o.font || 'sans-serif'}`; c.textAlign = o.align || 'left'; c.fillText(String(s), x, y); }
export function box(c, x, y, w, h, fill, stroke, r = 6) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } }
// a horizontal meter: v 0..1, o.band [a, b] outlined (never colour only), o.col fill, o.mark a white tick at o.mark
export function bar(c, x, y, w, h, v, o = {}) {
  box(c, x, y, w, h, 'rgba(255,255,255,.08)', null, h / 2);
  if (o.band) { c.fillStyle = 'rgba(79,208,106,.22)'; c.fillRect(x + o.band[0] * w, y, (o.band[1] - o.band[0]) * w, h); c.strokeStyle = o.good || '#4fd06a'; c.lineWidth = 2; c.strokeRect(x + o.band[0] * w, y, (o.band[1] - o.band[0]) * w, h); }
  c.fillStyle = o.col || COL.gold; c.fillRect(x, y + 2, clamp(v) * w, h - 4);
  if (o.mark != null) { c.fillStyle = '#fff'; c.fillRect(x + clamp(o.mark) * w - 1, y - 3, 3, h + 6); }
}
// a lamp with a shape mark inside (colour is never the only cue)
export function lamp(c, x, y, r, col, mark = 'circle') {
  c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fillStyle = col; c.fill(); c.strokeStyle = '#05060b'; c.lineWidth = 2; c.beginPath(); const k = r * 0.5;
  if (mark === 'triangle') { c.moveTo(x, y - k); c.lineTo(x + k, y + k * 0.8); c.lineTo(x - k, y + k * 0.8); c.closePath(); } else if (mark === 'square') c.rect(x - k * 0.8, y - k * 0.8, k * 1.6, k * 1.6); else if (mark === 'diamond') { c.moveTo(x, y - k); c.lineTo(x + k, y); c.lineTo(x, y + k); c.lineTo(x - k, y); c.closePath(); } else c.arc(x, y, k * 0.6, 0, 6.283);
  c.stroke();
}
export function wrapText(s, n = 40) { const out = []; let line = ''; for (const w of String(s).split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out; }
// status colours for the palette the UI passes to draw(): P.good / P.bad (colour-blind safe when CFG.cb)
export const STATUS = (P, k) => k === 'good' ? P.good : k === 'bad' ? P.bad : COL.warn;
