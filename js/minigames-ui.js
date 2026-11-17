// DOM layer + glue for the job mini-games (docs/minigames.md). Pure logic lives in js/minigames.js; this file draws a game on a 2D canvas, runs it as a
// ui-mode layer (js/ui-mode.js: the world pauses through G.menuPause, Esc pops exactly this layer, the pointer lock is released and re-taken by UI),
// shows the one-time instruction card, and hands the result back to main.js through the callbacks in `ctx`.
//   new Minis({ G, CFG, sound, ui: () => UI, blocked: () => string|null, apply(job, res, info) -> { label, cls }, abort(job, res), pin(job) })
//   minis.enabled   off under webdriver unless ?mini=1 (the scripted tests keep the old timed rounds), on in real play
//   minis.available()  true when a job started now would open a game (not during hazards / alerts / talk / another game)
//   minis.offer(job)   open the card + game for a job (kind 'repair' | 'duty' | 'task'); false = nothing opened, the caller does the plain way
//   minis.tick(dt)     per animation frame (the world is paused while a game is up); minis.game / minis.phase for tests
// Accessibility: no flashing or shake at all (calm mode also drops the hint glow); colour-blind palette plus a different SHAPE per wire; sounds are captioned (CFG.caps).
import { GAMES, INFO, STATION, THRESH, makeGame, gameFor, stepsFor, difficulty, skillOf, hashStr, needed } from './minigames.js';

const SEEN_KEY = 'fb_mini_seen';
const PAL = { n: { good: '#4fd18b', bad: '#ff5a4a', warn: '#ffb347', ink: '#e6eef7', dim: '#7e8ea6', wire: ['#ff5a4a', '#4fa3ff', '#ffd23f', '#4fd18b', '#c58bff'] }, cb: { good: '#56b4e9', bad: '#e69f00', warn: '#f0e442', ink: '#f2f6fa', dim: '#8d9bb0', wire: ['#e69f00', '#56b4e9', '#f0e442', '#009e73', '#cc79a7'] } };
const CSS = `#mini{position:fixed;inset:0;z-index:25;display:flex;align-items:center;justify-content:center;background:rgba(3,6,12,.84);font:14px/1.4 'Helvetica Neue',Arial,sans-serif;color:#e6eef7;cursor:default}
#mini .mcard{position:relative;width:min(700px,96vw);border:1px solid rgba(150,180,210,.3);border-top:3px solid var(--lc1,#f2a03d);background:rgba(7,11,19,.97);padding:14px 18px 12px}
#mini h3{margin:0;font:800 20px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:var(--lc4,#ffd9a0)}#mini .sub{opacity:.7;margin:0 0 8px;font-size:12px}
#mini .tbar{height:5px;background:#1b2636;margin:0 0 8px}#mini .tbar i{display:block;height:100%;background:var(--lc1,#f2a03d)}
#mini canvas{display:block;width:100%;background:#050a12;border:1px solid #1f2b3d}
#mini .foot{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:8px;font-size:12px;opacity:.9;flex-wrap:wrap}#mini .msg{min-height:1.2em;color:var(--lc4,#ffd9a0);font-weight:700}
#mini kbd{display:inline-block;min-width:24px;padding:3px 7px;margin:0 3px;border:1px solid var(--lc1,#f2a03d);border-radius:5px;background:rgba(7,11,19,.8);color:var(--lc4,#ffd9a0);font:700 13px var(--f-m,monospace);text-align:center}
#mini .ov{position:absolute;inset:0;background:#05090f;padding:16px 22px;display:none;flex-direction:column;justify-content:center;gap:8px}#mini .ov.on{display:flex}
#mini .ov h4{margin:8px 0 0;font:700 11px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d)}#mini .ov p{margin:0}
#mini button{margin-top:10px;align-self:flex-start;padding:8px 22px;font:800 14px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;background:var(--lc1,#f2a03d);color:#08101a;border:0;cursor:pointer}
#mini .res{font:800 26px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase}#mini .res.good{color:#4fd18b}#mini .res.warn{color:#ffb347}#mini .res.bad{color:#ff5a4a}body.cb #mini .res.good{color:#56b4e9}body.cb #mini .res.bad,body.cb #mini .res.warn{color:#e69f00}`;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const keysHTML = (keys) => keys.map(k => Array.isArray(k) ? k.map(x => `<kbd>${esc(x)}</kbd>`).join(k.length === 2 && /^\d|^[A-Z]$/.test(k[0]) ? '–' : '') : `<span>${esc(k)}</span>`).join(' ');

export class Minis {
  constructor(c) {
    this.c = c; this.G = c.G; this.enabled = true; this.run = null; this.phase = 'none'; this.game = null; this.played = {}; this.seen = new Set(); this.hold = null; this.log = [];
    try { for (const k of JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')) this.seen.add(k); } catch (e) { /* private window */ }
  }
  reset() { this.played = {}; this.holdFor = null; }   // a new run: the first job of each type teaches again (the instruction cards are remembered across runs)
  saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch (e) { /* private window */ } }
  unseen(job) { const g = gameFor(job); return !!g && (!this.seen.has('g:' + g) || !this.seen.has('s:' + (job.kind === 'repair' ? 'repair' : job.spot || 'any'))); }
  available() { return !!(this.enabled && !this.run && this.G.phase === 'play' && !this.c.blocked()); }
  /** open the card (first time) and the game for a job. false = nothing opened */
  offer(job) {
    const gid = gameFor(job); if (!gid || !this.available() || !this.c.ui()) return false;
    const first = !this.played[gid], skill = skillOf(this.G.player, job.dept), d = difficulty({ skill, severity: job.severity ?? 0.3, first });
    const n = (this.played[gid + '#n'] = (this.played[gid + '#n'] || 0) + 1), seed = hashStr(`${this.G.runSeed}:${job.kind}:${job.id}:${n}`);
    const game = makeGame(gid, { seed, d, first, steps: gid === 'sequence' ? stepsFor(job) : null, timeMul: job.timeMul || 1 });
    this.run = { job, game, gid, first, skill, d, card: this.unseen(job) }; this.game = game; this.phase = this.run.card ? 'intro' : 'play'; this.resT = 0; this.mark = 0;
    this.build(); this.c.ui().open('mini', { close: () => this.onClose(), back: () => this.back(), key: (e) => this.key(e) }); this.G.menus?.sync?.(); this.show(); this.log.push('open ' + gid);
    return true;
  }
  /** the first time a handheld is used: a short, non-blocking instruction line with the keys (same glowing keycaps as the nav tour); remembered across runs */
  toolTip(id, h) {
    if (!this.enabled || this.seen.has('h:' + id)) return; this.seen.add('h:' + id); this.saveSeen();
    const verbs = (h?.job?.verbs || []).join(' / '), kh = typeof document !== 'undefined' ? document.getElementById('keyhint') : null;
    this.G.say(`${h?.name || id}: ${h?.real ? h.real + '. ' : ''}[X] ${verbs || 'uses it'}. [V] swaps tools. In hand it speeds repairs.`, 'good');
    if (kh) { kh.innerHTML = ['X', 'V'].map(k => `<kbd>${k}</kbd>`).join(''); kh.style.opacity = 1; setTimeout(() => { kh.style.opacity = 0; }, 7000); }
  }
  // ---------------------------------------------------------------- layer plumbing
  back() {   // Esc / Backspace: the card -> the game; the game -> rush it; the result -> close
    if (!this.run) return false;
    if (this.phase === 'intro') { this.begin(); return true; }
    if (this.phase === 'play') { this.abort(); return false; }
    this.teardown(); return false;
  }
  onClose() { if (this.run && this.phase === 'play') this.abort(); else if (this.run) this.teardown(); }   // closed from outside (closeAll on a phase change): never leaves a half-open run
  abort() { const r = this.run; if (!r) return; const res = r.game.result(); this.log.push('abort ' + r.gid); this.teardown(); try { this.c.abort(r.job, res); } catch (e) { console.warn(e); } }
  teardown() { if (this.el) { this.el.remove(); this.el = null; } removeEventListener('keyup', this.kup); this.run = null; this.phase = 'none'; this.G.menus?.sync?.(); }
  closeResult() { if (!this.run) return; const ui = this.c.ui(); this.teardown(); ui.closed('mini'); this.G.menus?.sync?.(); }
  begin() { const r = this.run; if (!r || this.phase !== 'intro') return; this.phase = 'play'; this.seen.add('g:' + r.gid); this.seen.add('s:' + (r.job.kind === 'repair' ? 'repair' : r.job.spot || 'any')); this.saveSeen(); this.show(); this.c.clearPin?.(r.job); }
  finish() {
    const r = this.run, res = r.game.result(); this.played[r.gid] = (this.played[r.gid] || 0) + 1; this.phase = 'result'; this.resT = 2.6;
    let v = { label: 'Done', cls: 'good' }; try { v = this.c.apply(r.job, res, { first: r.first, need: needed(r.first) }) || v; } catch (e) { console.warn(e); }
    this.verdict = v; this.log.push(`done ${r.gid} ${res.quality}`); this.show();
  }
  // ---------------------------------------------------------------- input
  key(e) {
    const r = this.run, c = e.code; if (!r) return true;
    if (this.phase === 'intro') { if (c === 'Enter' || c === 'Space') this.begin(); return true; }
    if (this.phase === 'result') { if (c === 'Enter' || c === 'Space') this.closeResult(); return true; }
    const g = r.game, dig = /^(?:Digit|Numpad)([1-9])$/.exec(c), n = dig ? +dig[1] - 1 : -1, hd = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' }[c];
    if (g.id === 'wires') { const j = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'].indexOf(c); if (n >= 0) g.input({ k: 'selL', i: n }); else if (j >= 0) g.input({ k: 'selR', i: j }); }
    else if (g.id === 'dials') { if (n >= 0) g.input({ k: 'sel', i: n }); else if (c === 'ArrowUp' || c === 'KeyW') g.input({ k: 'sel', i: (g.sel + g.m - 1) % g.m }); else if (c === 'ArrowDown' || c === 'KeyS') g.input({ k: 'sel', i: (g.sel + 1) % g.m }); else if (hd) g.hold[hd] = true; }
    else if (g.id === 'tune') { if (c === 'Space' || c === 'Enter') g.input({ k: 'lock' }); else if (hd) g.hold[hd] = true; }
    else if (g.id === 'sequence') { if (n >= 0) g.input({ k: 'pick', i: n }); }
    else if (g.id === 'crates') { if (c === 'ArrowLeft' || c === 'KeyA') g.input({ k: 'put', side: 'L' }); else if (c === 'ArrowRight' || c === 'KeyD') g.input({ k: 'put', side: 'R' }); }
    else if (g.id === 'dose') { if (c === 'Space' || c === 'Enter') g.input({ k: 'toggle' }); }
    this.after(); return true;
  }
  keyup(e) { const g = this.run?.game; if (!g) return; const hd = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' }[e.code]; if (hd) g.hold[hd] = false; }
  after() { const g = this.run?.game; if (!g) return; if (g.sfx && g.sfx !== 'done') this.sfx(g.sfx); g.sfx = g.sfx === 'done' ? 'done' : null; if (g.done && this.phase === 'play') { this.sfx('done'); g.sfx = null; this.finish(); } }
  sfx(k) {
    const s = this.c.sound; try { if (k === 'ok') s?.tone?.(880, 0.06, 'sine', 0.05); else if (k === 'bad') s?.tone?.(150, 0.16, 'square', 0.05); else if (k === 'done') s?.ding?.(); } catch (e) { /* audio locked */ }
    if (this.c.CFG?.caps) this.G.caption?.(k === 'ok' ? 'click' : k === 'bad' ? 'buzz' : 'chime');
  }
  hit(x, y) { for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h; } return null; }
  pos(e) { const cv = this.cv, b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * cv.width, (e.clientY - b.top) / b.height * cv.height]; }
  // ---------------------------------------------------------------- DOM
  build() {
    if (typeof document === 'undefined') return; if (!document.getElementById('mini-css')) { const st = document.createElement('style'); st.id = 'mini-css'; st.textContent = CSS; document.head.appendChild(st); }
    const r = this.run, inf = INFO[r.gid], el = this.el = document.createElement('div'); el.id = 'mini'; el.className = 'ui-layer';
    el.innerHTML = `<div class="mcard"><h3>${esc(inf.title)}</h3><p class="sub">${esc(r.job.label || '')}</p><div class="tbar"><i></i></div><canvas width="640" height="320"></canvas>
      <div class="foot"><span class="keys">${keysHTML(inf.keys)}</span><span class="msg"></span><span><kbd>Esc</kbd> ${r.job.kind === 'repair' ? 'step away' : 'rush it'}</span></div>
      <div class="ov intro"></div><div class="ov resv"></div></div>`;
    document.body.appendChild(el); this.cv = el.querySelector('canvas'); this.g2 = this.cv.getContext('2d'); this.hits = [];
    this.kup = (e) => this.keyup(e); addEventListener('keyup', this.kup);
    el.addEventListener('mousedown', (e) => { e.stopPropagation(); if (this.phase !== 'play') return; if (e.target !== this.cv) return; const [x, y] = this.pos(e), h = this.hit(x, y); if (h) { r.game.input(h.ev); this.after(); } });
    el.addEventListener('mousemove', (e) => { if (this.phase === 'play' && e.target === this.cv && r.gid === 'tune') { const [x, y] = this.pos(e), p = this.plot; if (p && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) r.game.input({ k: 'aim', x: (x - p.x) / p.w, y: (y - p.y) / p.h }); } });
    el.addEventListener('wheel', (e) => { if (this.phase === 'play' && r.gid === 'dials') { e.preventDefault(); r.game.input({ k: 'trim', i: r.game.sel, v: e.deltaY < 0 ? 0.03 : -0.03 }); } }, { passive: false });
    this.btnIntro = () => { const b = el.querySelector('.intro button'); if (b) b.onclick = () => this.begin(); };
  }
  show() {
    const el = this.el; if (!el) return; const r = this.run, inf = INFO[r.gid], st = STATION[r.job.kind === 'repair' ? 'repair' : r.job.spot] || '';
    const intro = el.querySelector('.intro'), resv = el.querySelector('.resv');
    intro.classList.toggle('on', this.phase === 'intro'); resv.classList.toggle('on', this.phase === 'result');
    if (this.phase === 'intro') {
      intro.innerHTML = `<h3>${esc(inf.title)}</h3><p class="sub">${esc(st)}</p><h4>What it is</h4><p>${esc(inf.what)}</p><h4>What the job needs</h4><p>${esc(inf.needs)}</p><h4>Keys</h4><p>${keysHTML(inf.keys)}</p><p class="sub">${esc(inf.tip)}</p><h4>Proper looks like</h4><p>${esc(inf.proper)}</p>
        <p class="sub">${r.first ? 'First one of these: it is forgiving. ' : ''}<kbd>Esc</kbd> ${r.job.kind === 'repair' ? 'steps away (hold E for the slow patch)' : 'rushes the job'}.</p><button type="button">Begin <kbd>Enter</kbd></button>`; this.btnIntro();
    } else if (this.phase === 'result') {
      const v = this.verdict || { label: 'Done', cls: 'good' }, res = r.game.result();
      resv.innerHTML = `<p class="res ${v.cls}">${esc(v.label)}</p><p>${Math.round(res.quality * 100)}% · ${res.secs} s · ${res.mistakes} mistake${res.mistakes === 1 ? '' : 's'}${res.timedOut ? ' · time ran out' : ''}</p><p class="sub">${esc(v.note || '')}</p><button type="button">Done <kbd>Enter</kbd></button>`;
      resv.querySelector('button').onclick = () => this.closeResult();
    }
    this.draw();
  }
  tick(dt) {
    const r = this.run; if (!r) return;
    if (this.phase === 'play') { r.game.step(dt); this.after(); }
    else if (this.phase === 'result') { this.resT -= dt; if (this.resT <= 0) { this.closeResult(); return; } }
    if (this.el) this.draw();
  }
  // ---------------------------------------------------------------- drawing
  draw() {
    const r = this.run, g2 = this.g2; if (!r || !g2) return; const g = r.game, W = 640, H = 320, P = document.body.classList.contains('cb') ? PAL.cb : PAL.n;
    g2.clearRect(0, 0, W, H); g2.fillStyle = '#050a12'; g2.fillRect(0, 0, W, H); this.hits = []; this.pal = P; g2.textBaseline = 'middle';
    this.el.querySelector('.tbar i').style.width = (g.timeLeft / g.limit * 100) + '%'; this.el.querySelector('.msg').textContent = g.msgT > 0 ? g.msg : '';
    ({ wires: dWires, dials: dDials, tune: dTune, sequence: dSeq, crates: dCrates, dose: dDose })[g.id].call(this, g2, g, W, H, P);
  }
}

const txt = (g2, s, x, y, col, size = 15, al = 'left') => { g2.fillStyle = col; g2.font = `700 ${size}px Arial`; g2.textAlign = al; g2.fillText(s, x, y); };
const shape = (g2, k, x, y, r, col) => {   // a different SHAPE per wire as well as a colour (colour-blind safe)
  g2.fillStyle = col; g2.beginPath();
  if (k === 0) g2.arc(x, y, r, 0, 7); else if (k === 1) g2.rect(x - r, y - r, r * 2, r * 2);
  else if (k === 2) { g2.moveTo(x, y - r * 1.15); g2.lineTo(x + r * 1.1, y + r * 0.9); g2.lineTo(x - r * 1.1, y + r * 0.9); g2.closePath(); }
  else if (k === 3) { g2.moveTo(x, y - r * 1.2); g2.lineTo(x + r * 1.2, y); g2.lineTo(x, y + r * 1.2); g2.lineTo(x - r * 1.2, y); g2.closePath(); }
  else for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.55 : r * 1.25; g2[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g2.fill();
};
function dWires(g2, g, W, H, P) {
  const top = 40, gap = (H - 110) / (g.n - 1 || 1), lx = 150, rx = W - 150, LET = 'ASDFG';
  for (let i = 0; i < g.n; i++) { const y = top + i * gap, li = g.left[i], ri = g.right[i], jl = g.joined.has(li), jr = g.joined.has(ri), sl = g.sel === i;
    if (jl) { const j = g.right.indexOf(li), y2 = top + j * gap; g2.strokeStyle = P.wire[li]; g2.lineWidth = 6; g2.beginPath(); g2.moveTo(lx, y); g2.bezierCurveTo(W / 2, y, W / 2, y2, rx, y2); g2.stroke(); }
    g2.globalAlpha = jl ? 0.45 : 1; shape(g2, li, lx, y, 14, P.wire[li]); g2.globalAlpha = 1; if (sl) { g2.strokeStyle = P.ink; g2.lineWidth = 3; g2.strokeRect(lx - 24, y - 22, 48, 44); } txt(g2, String(i + 1), lx - 52, y, P.ink, 18, 'center');
    g2.globalAlpha = jr ? 0.45 : 1; shape(g2, ri, rx, y, 14, P.wire[ri]); g2.globalAlpha = 1; txt(g2, LET[i], rx + 52, y, P.ink, 18, 'center');
    this.hits.push({ x: lx - 70, y: y - 22, w: 100, h: 44, ev: { k: 'selL', i } }, { x: rx - 30, y: y - 22, w: 100, h: 44, ev: { k: 'selR', i } }); }
  txt(g2, `${g.joined.size} / ${g.n} joined · ${g.mistakes} wrong`, W / 2, H - 16, P.dim, 13, 'center');
}
function dDials(g2, g, W, H, P) {
  const w = 120, gap = (W - g.m * w) / (g.m + 1), top = 40, h = H - 90;
  for (let i = 0; i < g.m; i++) {
    const x = gap + i * (w + gap), y = (v) => top + (1 - v) * h, c = g.c[i];
    g2.fillStyle = '#0c1522'; g2.fillRect(x, top, w, h); g2.fillStyle = P.bad; g2.globalAlpha = 0.18; g2.fillRect(x, top, w, h); g2.globalAlpha = 1;
    g2.fillStyle = P.good; g2.globalAlpha = 0.3; g2.fillRect(x, y(Math.min(1, c + g.hw)), w, h * Math.min(1, 2 * g.hw)); g2.globalAlpha = 1; g2.strokeStyle = P.good; g2.lineWidth = 2; g2.strokeRect(x, y(Math.min(1, c + g.hw)), w, h * Math.min(1, 2 * g.hw));
    g2.strokeStyle = g.inBand[i] ? P.good : P.ink; g2.lineWidth = 5; g2.beginPath(); g2.moveTo(x - 8, y(g.v[i])); g2.lineTo(x + w + 8, y(g.v[i])); g2.stroke();
    if (g.sel === i) { g2.strokeStyle = P.warn; g2.lineWidth = 3; g2.strokeRect(x - 5, top - 5, w + 10, h + 10); }
    txt(g2, String(i + 1), x + w / 2, top + h + 22, P.ink, 18, 'center'); txt(g2, g.inBand[i] ? 'IN BAND' : g.red[i] ? 'RED' : 'drifting', x + w / 2, top - 16, g.inBand[i] ? P.good : g.red[i] ? P.bad : P.dim, 12, 'center');
    this.hits.push({ x, y: top, w, h, ev: { k: 'sel', i } });
  }
  txt(g2, `time in band ${Math.round(g.ok / (g.run * 0.85) * 100)}% · red ${g.mistakes}`, W / 2, H - 14, P.dim, 13, 'center');
}
function dTune(g2, g, W, H, P) {
  const p = this.plot = { x: 30, y: 30, w: 380, h: 250 }; g2.strokeStyle = '#1f2b3d'; g2.lineWidth = 1; g2.strokeRect(p.x, p.y, p.w, p.h);
  for (let i = 1; i < 8; i++) { g2.beginPath(); g2.moveTo(p.x + p.w * i / 8, p.y); g2.lineTo(p.x + p.w * i / 8, p.y + p.h); g2.moveTo(p.x, p.y + p.h * i / 8); g2.lineTo(p.x + p.w, p.y + p.h * i / 8); g2.stroke(); }
  const cx = p.x + g.x * p.w, cy = p.y + g.y * p.h; g2.strokeStyle = P.warn; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(cx, p.y); g2.lineTo(cx, p.y + p.h); g2.moveTo(p.x, cy); g2.lineTo(p.x + p.w, cy); g2.stroke(); g2.beginPath(); g2.arc(cx, cy, 9, 0, 7); g2.stroke();
  txt(g2, 'frequency →', p.x + p.w / 2, p.y + p.h + 18, P.dim, 12, 'center'); g2.save(); g2.translate(14, p.y + p.h / 2); g2.rotate(-Math.PI / 2); txt(g2, 'gain →', 0, 0, P.dim, 12, 'center'); g2.restore();
  const s = g.strength(), mx = 470, mh = 230, my = 40; g2.fillStyle = '#0c1522'; g2.fillRect(mx, my, 44, mh); g2.fillStyle = s >= 0.7 ? P.good : s >= 0.4 ? P.warn : P.bad; g2.fillRect(mx, my + mh * (1 - s), 44, mh * s);
  g2.strokeStyle = P.ink; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(mx - 6, my + mh * 0.3); g2.lineTo(mx + 50, my + mh * 0.3); g2.stroke(); txt(g2, 'lock above this line', mx - 6, my - 14, P.dim, 11);
  txt(g2, Math.round(s * 100) + '%', mx + 22, my + mh + 14, P.ink, 16, 'center'); this.hits.push({ x: 440, y: 20, w: 190, h: 280, ev: { k: 'lock' } }); txt(g2, 'click here or Space: LOCK', 535, 310, P.warn, 12, 'center');
}
function dSeq(g2, g, W, H, P) {
  const h = Math.min(52, (H - 50) / g.n - 6);
  g.show.forEach((it, k) => { const y = 24 + k * (h + 6), done = g.picked.has(it.i); g2.fillStyle = done ? '#10261c' : '#0c1522'; g2.fillRect(60, y, W - 120, h); g2.strokeStyle = done ? P.good : '#2a3a52'; g2.lineWidth = 2; g2.strokeRect(60, y, W - 120, h);
    txt(g2, String(k + 1), 84, y + h / 2, P.warn, 20, 'center'); txt(g2, it.s, 116, y + h / 2, done ? P.dim : P.ink, 17); if (done) txt(g2, `✓ step ${it.i + 1}`, W - 80, y + h / 2, P.good, 14, 'right');
    this.hits.push({ x: 60, y, w: W - 120, h, ev: { k: 'pick', i: k } }); });
  txt(g2, `${g.next} / ${g.n} in order · ${g.mistakes} wrong`, W / 2, H - 14, P.dim, 13, 'center');
}
function dCrates(g2, g, W, H, P) {
  const tilt = (g.R - g.L) / Math.max(1, g.total) * 0.7, cx = W / 2, by = 215; g2.save(); g2.translate(cx, by); g2.rotate(tilt); g2.fillStyle = '#2a3a52'; g2.fillRect(-250, 0, 500, 10); g2.restore(); g2.fillStyle = '#2a3a52'; g2.fillRect(cx - 6, by, 12, 70);
  const stack = (x0, ws, dir) => { let y = by - 4 - dir * 0; for (const w of ws) { const h = 12 + w * 8; y -= h; g2.fillStyle = '#7d5a2f'; g2.fillRect(x0, y, 90, h - 2); g2.strokeStyle = '#d6a860'; g2.lineWidth = 1; g2.strokeRect(x0, y, 90, h - 2); txt(g2, String(w), x0 + 45, y + h / 2, '#f2e0c0', 14, 'center'); } };
  stack(cx - 190, g.placedL, 0); stack(cx + 100, g.placedR, 0);
  txt(g2, `left ${g.L}`, cx - 145, by + 28, P.ink, 15, 'center'); txt(g2, `right ${g.R}`, cx + 145, by + 28, P.ink, 15, 'center');
  const nxt = g.w.slice(g.i, g.i + g.look + 1); nxt.forEach((w, k) => { const s = k === 0 ? 1 : 0.7, x = cx - 40 * s + k * 90, y = 20; g2.globalAlpha = k === 0 ? 1 : 0.55; g2.fillStyle = '#7d5a2f'; g2.fillRect(x, y, 80 * s, 60 * s); g2.strokeStyle = '#d6a860'; g2.strokeRect(x, y, 80 * s, 60 * s); txt(g2, String(w), x + 40 * s, y + 30 * s, '#f2e0c0', 22 * s, 'center'); }); g2.globalAlpha = 1;
  txt(g2, k0(g), cx, 100, P.dim, 12, 'center'); this.hits.push({ x: 0, y: 0, w: W / 2, h: H, ev: { k: 'put', side: 'L' } }, { x: W / 2, y: 0, w: W / 2, h: H, ev: { k: 'put', side: 'R' } });
  txt(g2, '← put left', 90, H - 14, P.warn, 14, 'center'); txt(g2, 'put right →', W - 90, H - 14, P.warn, 14, 'center');
}
const k0 = (g) => `crate ${Math.min(g.i + 1, g.n)} of ${g.n}`;
function dDose(g2, g, W, H, P) {
  const tx = 230, ty = 30, th = 220, tw = 70, c = g.c[Math.min(g.r, g.rounds - 1)]; g2.fillStyle = '#0c1522'; g2.fillRect(tx, ty, tw, th);
  g2.fillStyle = P.good; g2.globalAlpha = 0.3; g2.fillRect(tx, ty + th * (1 - Math.min(1, c + g.hw)), tw, th * 2 * g.hw); g2.globalAlpha = 1; g2.strokeStyle = P.good; g2.lineWidth = 2; g2.strokeRect(tx, ty + th * (1 - Math.min(1, c + g.hw)), tw, th * 2 * g.hw);
  g2.fillStyle = Math.abs(g.level - c) <= g.hw ? P.good : P.warn; g2.fillRect(tx + 6, ty + th * (1 - g.level), tw - 12, th * g.level); g2.strokeStyle = P.ink; g2.lineWidth = 2; g2.strokeRect(tx, ty, tw, th);
  txt(g2, `patient ${Math.min(g.r + 1, g.rounds)} of ${g.rounds}`, 400, 50, P.ink, 18); for (let i = 0; i < g.rounds; i++) { g2.fillStyle = i < g.scores.length ? (g.scores[i] >= 1 ? P.good : P.warn) : '#2a3a52'; g2.beginPath(); g2.arc(406 + i * 26, 84, 9, 0, 7); g2.fill(); }
  g2.fillStyle = g.on ? P.bad : P.good; g2.fillRect(380, 130, 200, 56); txt(g2, g.on ? 'STOP' : 'START infusion', 480, 158, '#06101a', 18, 'center'); this.hits.push({ x: 380, y: 130, w: 200, h: 56, ev: { k: 'toggle' } });
  txt(g2, g.on ? 'running — stop it inside the green band' : 'press Space to start', 480, 214, P.dim, 13, 'center');
}
export { GAMES, THRESH };
