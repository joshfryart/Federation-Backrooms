// Job mini-game overlay (Systems Nominal): the instruction card shown the first time a tool / console is used, then the mini-game itself
// (js/jobgames.js), drawn procedurally on a small canvas. A layer on the UI stack (js/ui-mode.js): it frees the pointer lock while open, the
// world holds still (G.menuPause), Esc pops it (= cancel: the job stays due), and the lock comes back when it closes.
//   const J = new JobGameUI({ G, CFG, sound, caption, store })
//   J.start({ tool, seed, label, apply(outcome), cancelled() }) -> true if opened   (apply runs once with js/jobgames.js outcome())
//   J.tick(dt)   real seconds (main.js frame(); tests call __game.jobgame.tick on the test clock)
//   J.key(code, down)   keyboard (the UI layer's key hook + a keyup listener for the hold keys)    J.cancel()   J.active / J.phase / J.game
// Accessibility: every game is keyboard only (buttons too, for a free cursor); colour is never the only cue (the wire leads carry a mark,
// the bands are outlined); colour-blind palette swaps green / red for blue / amber; calm visuals: no shake or flash on a strike and the
// games run slower (createGame opts.calm); sound captions: strikes / wins / the instruction card get a bracketed caption line.
import { createGame, outcome, KINDS } from './jobgames.js';

const CSS = `#jobgame{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:28;display:none;width:min(420px,calc(100vw - 32px));background:rgba(6,9,16,.95);border:2px solid var(--k-orange,#f2a03d);border-radius:14px 4px 14px 4px;padding:12px 14px;color:#e8edf5;font:600 13px/1.4 var(--f-d,Arial,sans-serif);box-shadow:0 0 0 1px rgba(0,0,0,.6),0 10px 40px rgba(0,0,0,.6)}
#jobgame.on{display:block}#jobgame.strike{border-color:#ff5a48}body.cb #jobgame.strike{border-color:#ffb000}#jobgame.shake{animation:jgshake .18s}
@keyframes jgshake{25%{transform:translate(calc(-50% - 4px),-50%)}75%{transform:translate(calc(-50% + 4px),-50%)}}
#jobgame .jg-h{display:flex;justify-content:space-between;gap:8px;align-items:baseline;font:800 12px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;color:var(--k-orange,#f2a03d)}
#jobgame .jg-h b{color:#ffd9a0}#jobgame .jg-tool{font:700 15px var(--f-d,Arial);margin:4px 0 2px;color:#fff}
#jobgame .jg-how{margin:6px 0;color:#c9d6e6}#jobgame kbd{display:inline-block;min-width:1.4em;padding:0 .35em;margin:0 .1em;border:1px solid #9fb3cc;border-bottom-width:2px;border-radius:4px;background:#1a2433;color:#fff;font:700 12px/1.5 monospace;text-align:center}
#jobgame canvas{display:block;width:100%;height:auto;margin:6px 0;background:#03060b;border-radius:6px}
#jobgame .jg-btns{display:flex;gap:6px;flex-wrap:wrap}#jobgame button{flex:1;min-width:44px;min-height:32px;background:#1a2433;color:#fff;border:1px solid #5b6f8a;border-radius:6px;font:700 13px var(--f-d,Arial);cursor:pointer}
#jobgame button:focus-visible{outline:2px solid #ffd9a0}#jobgame .jg-foot{display:flex;justify-content:space-between;margin-top:6px;color:#9fb3cc;font-size:12px}#jobgame .jg-res{font:800 14px var(--f-d,Arial);color:#ffd9a0;text-align:center;margin:4px 0}`;
// palettes: lead colours (always paired with a mark), good band, bad flash. cb: blue / amber / white / magenta, no red-green pair
const PAL = { wires: ['#ff5a48', '#4fd06a', '#4f9dff', '#ffd23f'], good: '#4fd06a', bad: '#ff5a48' };
const PAL_CB = { wires: ['#ffb000', '#4f9dff', '#f2f2f2', '#d45fd4'], good: '#4f9dff', bad: '#ffb000' };
const MARKS = ['circle', 'triangle', 'square', 'diamond'], SYM = ['◆', '▲', '●', '■'];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class JobGameUI {
  constructor({ G, CFG, sound = null, caption = () => { }, store }) {
    Object.assign(this, { G, CFG, sound, caption, store }); this.active = null; this.phase = null; this.game = null; this.hold = 0; this.log = [];
    if (typeof document === 'undefined') return;
    if (!document.getElementById('jobgame-css')) { const st = document.createElement('style'); st.id = 'jobgame-css'; st.textContent = CSS; document.head.appendChild(st); }
    let el = document.getElementById('jobgame'); if (!el) { el = document.createElement('div'); el.id = 'jobgame'; el.className = 'ui-layer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    this.el = el; el.onmousedown = (e) => { e.stopPropagation(); const b = e.target.closest('[data-k]'); if (b) { e.preventDefault(); this.key(b.dataset.k, true); } };
    el.onmouseup = (e) => { const b = e.target.closest('[data-k]'); if (b) this.key(b.dataset.k, false); };
    el.onmouseleave = () => { if (this.game?.held) { this.game.held.L = this.game.held.R = false; } };
    addEventListener('keyup', (e) => { if (this.active && this.phase === 'play') this.key(e.code, false); });
  }
  get palette() { return this.CFG?.cb ? PAL_CB : PAL; }
  // open the card / game for one job. Returns false (and does nothing) if a game is already up.
  start(job) {
    if (this.active) return false; const tool = job.tool; this.active = job; this.game = null; this.hold = 0; this.flashT = 0;
    this.phase = this.store.has(tool.id) ? 'play' : 'intro';
    if (this.phase === 'play') this.begin(); else { this.caption(`How to: ${tool.name}`); this.G.say?.(`New tool: ${tool.name}. ${tool.how}`, 'good'); }
    this.G.ui?.open('jobgame', { close: () => this.cancel(true), key: (e) => { this.key(e.code, true); } });   // the menus router hands the top layer every key but Esc / Backspace / the panel keys (repeats dropped)
    this.el?.classList.add('on'); this.render(); this.note(`start ${tool.id} ${this.phase}`); return true;
  }
  begin() {
    const j = this.active; if (!j) return; if (this.phase === 'intro') this.store.mark(j.tool.id);
    this.phase = 'play'; this.game = createGame(j.tool.kind, j.seed, { calm: !!this.CFG?.calm }); this.render();
  }
  // keyboard: the intro card takes Enter / Space / E to begin; the game takes its own keys (js/jobgames.js KINDS[kind].keys)
  key(code, down = true) {
    if (!this.active) return false;
    if (this.phase === 'intro') { if (down && (code === 'Enter' || code === 'Space' || code === 'KeyE')) { this.begin(); return true; } return false; }
    if (this.phase !== 'play' || !this.game) return false; const g = this.game, s0 = g.strikes, ok = g.key(code, down);
    if (ok && down) { if (g.strikes > s0) this.onStrike(); else if (g.state === 'play') this.sound?.tone?.(1180, 0.05, 'sine', 0.08); this.after(); this.render(); }
    return ok;
  }
  onStrike() {
    const g = this.game, why = g.events[g.events.length - 1]?.why || 'error'; this.sound?.denied?.(); this.caption(why === 'spark' ? 'sparks' : why === 'spike' ? 'pressure spike' : 'error buzz');
    if (!this.CFG?.calm && this.el) { this.flashT = 0.25; this.el.classList.add('strike'); this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake'); }
  }
  after() { const g = this.game; if (g && g.state !== 'play' && this.phase === 'play') { this.phase = 'done'; this.hold = 0.8; this.result = outcome(g); if (g.state === 'win') { this.sound?.chip?.(); this.caption('console chime'); } else { this.sound?.denied?.(); this.caption('fault tone'); } } }
  tick(dt) {
    if (!this.active) return;
    if (this.G.phase && this.G.phase !== 'play') { this.cancel(); return; }   // death / lift / end of shift took over: never leave the layer up
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.el?.classList.remove('strike');
    if (this.phase === 'play' && this.game) { const s0 = this.game.strikes; this.game.tick(dt); if (this.game.strikes > s0) this.onStrike(); this.after(); this.draw(); }
    else if (this.phase === 'done') { this.hold -= dt; if (this.hold <= 0) this.finish(); }
  }
  finish() {
    const j = this.active, res = this.result; this.close(); if (!j) return;
    this.note(`done ${j.tool.id} ${res?.quality}`); try { j.apply?.(res, this.game.result()); } catch (e) { console.warn(e); }
  }
  // Esc (fromUI: the layer stack already dropped us) / phase change: the job is not done and stays due
  cancel(fromUI = false) { const j = this.active; if (!j) return; this.game?.cancel?.(); this.close(fromUI); this.note(`cancel ${j.tool.id}`); try { j.cancelled?.(); } catch (e) { console.warn(e); } }
  close(fromUI = false) { this.active = null; this.phase = null; if (this.el) { this.el.classList.remove('on', 'strike', 'shake'); this.el.innerHTML = ''; } if (!fromUI) this.G.ui?.closed('jobgame'); }
  note(t) { this.log.push(t); if (this.log.length > 20) this.log.shift(); }

  // ---------------------------------------------------------------- drawing (procedural: canvas 2D, no assets)
  render() {
    if (!this.el || !this.active) return; const j = this.active, t = j.tool, K = KINDS[t.kind], kb = (k) => `<kbd>${esc(k)}</kbd>`;
    if (this.phase === 'intro') {
      this.el.innerHTML = `<div class="jg-h"><span>New tool</span><b>${esc(K.title)}</b></div><div class="jg-tool">${esc(t.name)}</div>
        <div class="jg-how">${esc(t.how)}</div><div class="jg-how">${esc(K.rule)}</div><div class="jg-how">Keys: ${t.keys.map(kb).join(' ')} · ${kb('Esc')} cancel (the job stays due)</div>
        <div class="jg-how" style="color:#9fb3cc">A clean job is faster; a fumbled one still gets done, logged as rushed.</div>
        <div class="jg-btns"><button data-k="Enter">Begin ${kb('Enter')}</button><button data-k="Escape">Cancel ${kb('Esc')}</button></div>`;
      this.el.querySelector('[data-k="Escape"]').onmousedown = (e) => { e.stopPropagation(); this.G.ui?.close('jobgame'); if (this.active) this.cancel(); };
      return;
    }
    const btns = t.kind === 'sequence' ? [1, 2, 3, 4].map(d => `<button data-k="Digit${d}">${SYM[d - 1]} ${d}</button>`).join('')
      : t.kind === 'wires' ? `<button data-k="ArrowUp">↑</button><button data-k="ArrowDown">↓</button>` + [1, 2, 3, 4].map(d => `<button data-k="Digit${d}">${d}</button>`).join('')
        : t.kind === 'dial' ? `<button data-k="Space">Bleed ${kb('Space')}</button>` : `<button data-k="ArrowLeft">◀ hold</button><button data-k="ArrowRight">hold ▶</button>`;
    this.el.innerHTML = `<div class="jg-h"><span>${esc(j.label || t.name)}</span><b>${esc(K.title)}</b></div><canvas width="400" height="170"></canvas>
      ${this.phase === 'done' ? `<div class="jg-res">${esc(this.result?.label || '')}</div>` : `<div class="jg-btns">${btns}</div>`}
      <div class="jg-foot"><span class="jg-st"></span><span>${kb('Esc')} cancel</span></div>`;
    this.cv = this.el.querySelector('canvas'); this.draw();
  }
  draw() {
    const cv = this.cv, g = this.game; if (!cv || !g || !cv.getContext) return; const c = cv.getContext('2d'); if (!c) return; const W = cv.width, H = cv.height, P = this.palette;
    c.fillStyle = '#03060b'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,150,190,.12)'; c.lineWidth = 1; for (let x = 0; x < W; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }   // panel grid
    const st = this.el.querySelector('.jg-st'); if (st) st.textContent = `${g.maxStrikes ? `faults ${g.strikes}/${g.maxStrikes} · ` : ''}${Math.max(0, Math.ceil(g.limit - g.t))} s`;
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, H - 6, W, 6); c.fillStyle = g.t > g.limit * 0.75 ? P.bad : '#f2a03d'; c.fillRect(0, H - 6, W * Math.max(0, 1 - g.t / g.limit), 6);   // time left
    if (g.kind === 'sequence') this.drawSeq(c, W, H, g, P); else if (g.kind === 'wires') this.drawWires(c, W, H, g, P); else if (g.kind === 'dial') this.drawDial(c, W, H, g, P); else this.drawCal(c, W, H, g, P);
  }
  mark(c, kind, x, y, r) { c.beginPath(); if (kind === 'circle') c.arc(x, y, r, 0, 6.283); else if (kind === 'triangle') { c.moveTo(x, y - r); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); c.closePath(); } else if (kind === 'square') c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); else { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); } }
  drawSeq(c, W, H, g, P) {   // LCARS-ish code strip: five cells, the next one lit; four keypad pads below
    const n = g.code.length, cw = 56, x0 = (W - n * cw) / 2;
    for (let i = 0; i < n; i++) { const x = x0 + i * cw, done = i < g.pos, cur = i === g.pos; c.fillStyle = done ? P.good : cur ? '#f2a03d' : '#1a2433'; c.beginPath(); c.roundRect?.(x + 4, 18, cw - 8, 44, 10); if (!c.roundRect) c.rect(x + 4, 18, cw - 8, 44); c.fill();
      c.fillStyle = done || cur ? '#0a0f18' : '#9fb3cc'; c.font = '700 22px sans-serif'; c.textAlign = 'center'; c.fillText(SYM[g.code[i] - 1], x + cw / 2, 48); c.font = '700 11px sans-serif'; c.fillText(String(g.code[i]), x + cw / 2, 60); }
    for (let d = 0; d < 4; d++) { const x = W / 2 - 150 + d * 75; c.fillStyle = '#26354a'; c.fillRect(x + 6, 84, 63, 60); c.fillStyle = '#e8edf5'; c.font = '700 26px sans-serif'; c.textAlign = 'center'; c.fillText(SYM[d], x + 37, 120); c.font = '700 12px sans-serif'; c.fillText(String(d + 1), x + 37, 138); }
  }
  drawWires(c, W, H, g, P) {   // left: loose leads (colour + mark); right: numbered terminals (colour + mark); done pairs drawn as a cable
    const y = (i) => 22 + i * 36;
    for (let i = 0; i < 4; i++) {
      const col = P.wires[i], k = g.right.indexOf(i);
      c.fillStyle = col; this.mark(c, MARKS[i], 40, y(i), 9); c.fill(); if (g.sel === i && !g.done[i]) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(22, y(i) - 15, 36, 30); }
      const tcol = P.wires[g.right[i]]; c.fillStyle = tcol; this.mark(c, MARKS[g.right[i]], W - 60, y(i), 9); c.fill(); c.fillStyle = '#e8edf5'; c.font = '700 14px sans-serif'; c.textAlign = 'left'; c.fillText(String(i + 1), W - 40, y(i) + 5);
      c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); c.moveTo(52, y(i));
      if (g.done[i]) c.bezierCurveTo(W / 2, y(i), W / 2, y(k), W - 72, y(k)); else c.quadraticCurveTo(100, y(i) + 18, 120 + (i % 2) * 10, y(i) + 6 - (g.sel === i ? 4 : 0));
      c.stroke();
    }
  }
  drawDial(c, W, H, g, P) {   // a half-round pressure gauge: band outlined (not colour only), the needle sweeps; hits as lit pips
    const cx = W / 2, cy = 140, r = 110, a = (x) => Math.PI + x * Math.PI;
    c.lineWidth = 14; c.strokeStyle = '#1a2433'; c.beginPath(); c.arc(cx, cy, r, Math.PI, 2 * Math.PI); c.stroke();
    c.strokeStyle = P.good; c.beginPath(); c.arc(cx, cy, r, a(g.band[0]), a(g.band[1])); c.stroke(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r + 9, a(g.band[0]), a(g.band[1])); c.stroke(); c.beginPath(); c.arc(cx, cy, r - 9, a(g.band[0]), a(g.band[1])); c.stroke();
    c.strokeStyle = g.inBand() ? '#fff' : '#ffd9a0'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a(g.x)) * (r - 4), cy + Math.sin(a(g.x)) * (r - 4)); c.stroke(); c.fillStyle = '#9fb3cc'; c.beginPath(); c.arc(cx, cy, 7, 0, 6.283); c.fill();
    for (let i = 0; i < g.need; i++) { c.fillStyle = i < g.hits ? P.good : '#26354a'; c.beginPath(); c.arc(cx - 20 + i * 20, cy - 30, 6, 0, 6.283); c.fill(); }
  }
  drawCal(c, W, H, g, P) {   // a horizontal trace: the drifting reading (outlined window), the marker the player steers, the fill meter
    const x = (v) => 20 + v * (W - 40), y = 70;
    c.strokeStyle = 'rgba(159,179,204,.5)'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= 60; i++) { const xx = 20 + i / 60 * (W - 40); c.lineTo(xx, y + Math.sin(i * 0.7 + g.t * 6) * 4); } c.stroke();
    c.fillStyle = g.inBand() ? P.good : 'rgba(79,157,255,.35)'; c.globalAlpha = 0.35; c.fillRect(x(g.target - g.tw), 30, x(g.target + g.tw) - x(g.target - g.tw), 80); c.globalAlpha = 1; c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(x(g.target - g.tw), 30, x(g.target + g.tw) - x(g.target - g.tw), 80);
    c.fillStyle = '#f2a03d'; c.beginPath(); c.moveTo(x(g.m), 26); c.lineTo(x(g.m) - 9, 12); c.lineTo(x(g.m) + 9, 12); c.closePath(); c.fill(); c.fillRect(x(g.m) - 1.5, 26, 3, 88);
    c.fillStyle = '#1a2433'; c.fillRect(20, 128, W - 40, 14); c.fillStyle = P.good; c.fillRect(20, 128, (W - 40) * Math.min(1, g.fill / g.need), 14); c.strokeStyle = '#9fb3cc'; c.lineWidth = 1; c.strokeRect(20, 128, W - 40, 14);
  }
}
