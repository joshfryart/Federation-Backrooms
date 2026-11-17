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

const CSS = `#jobgame{--kc:#f0933a;--kc2:var(--k-lav,#b99be6);--kc3:var(--k-peri,#7d97e8);--kc4:var(--k-gold,#f4c25b);--ink:var(--k-ink,#f3eee6);--dim:var(--k-dim,#a8a6b9);
  position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:28;display:none;width:min(640px,calc(100vw - 24px));background:rgba(5,6,11,.96);color:var(--ink);
  font:600 13px/1.4 var(--f-d,"Arial Narrow",Arial,sans-serif);border-radius:30px 6px 6px 30px;box-shadow:0 0 0 1px rgba(0,0,0,.7),0 14px 50px rgba(0,0,0,.7),0 0 34px color-mix(in srgb,var(--kc) 22%,transparent);padding:0}
#jobgame.on{display:block}#jobgame.strike{--kc:var(--m-alert,#ff5a4a)}body.cb #jobgame.strike{--kc:#ffb000}#jobgame.shake{animation:jgshake .18s}
@keyframes jgshake{25%{transform:translate(calc(-50% - 4px),-50%)}75%{transform:translate(calc(-50% + 4px),-50%)}}
#jobgame .jg-fr{display:grid;grid-template-columns:100px 1fr;grid-template-rows:auto 1fr auto}
#jobgame .jg-el{position:relative;background:var(--kc);color:#120a05;font:800 9px/1 var(--f-d,Arial);letter-spacing:.1em;white-space:nowrap;overflow:hidden;text-transform:uppercase;display:flex;justify-content:flex-end;padding:7px 9px;transition:background .2s}
#jobgame .jg-el.t{border-radius:30px 0 0 0;min-height:52px;align-items:flex-end}#jobgame .jg-el.b{background:var(--kc2);border-radius:0 0 0 30px;min-height:40px;align-items:flex-start}
#jobgame .jg-el.t::after,#jobgame .jg-el.b::after{content:'';position:absolute;left:100%;width:16px;height:16px}
#jobgame .jg-el.t::after{top:12px;background:radial-gradient(circle at 100% 100%,transparent 15.5px,var(--kc) 16px)}#jobgame .jg-el.b::after{bottom:12px;background:radial-gradient(circle at 100% 0,transparent 15.5px,var(--kc2) 16px)}
#jobgame .jg-top,#jobgame .jg-bot{display:flex;flex-direction:column;min-width:0}#jobgame .jg-bot{flex-direction:column-reverse}
#jobgame .jg-bars{display:flex;gap:4px;height:12px}#jobgame .jg-bars b{flex:1;background:var(--kc);transition:background .2s}#jobgame .jg-bars i{width:46px;background:var(--kc4)}#jobgame .jg-bars i.l{width:22px;background:var(--kc2)}#jobgame .jg-bars i.p{width:64px;background:var(--kc3);border-radius:0 6px 6px 0}
#jobgame .jg-bot .jg-bars b{background:var(--kc2)}#jobgame .jg-bot .jg-bars i{background:var(--kc3)}#jobgame .jg-bot .jg-bars i.p{background:var(--kc)}
#jobgame .jg-hd{display:flex;align-items:center;gap:8px;padding:7px 10px 4px 22px;min-width:0}
#jobgame .pill{display:inline-flex;align-items:center;border-radius:99px;padding:2px 10px;background:var(--kc);color:#120a05;font:800 11px/1.3 var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
#jobgame .jg-ttl{flex:1;min-width:0;font:800 14px/1.2 var(--f-d,Arial);letter-spacing:.12em;text-transform:uppercase;color:var(--kc4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#jobgame .jg-sd{font:700 11px var(--f-m,monospace);letter-spacing:.08em;color:var(--kc3);white-space:nowrap}
#jobgame .jg-rail{display:flex;flex-direction:column;gap:4px;padding:4px 0}#jobgame .jg-r{background:var(--c,var(--kc3));color:#120a05;padding:5px 9px 4px;text-align:right;font:800 9px/1.15 var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;min-height:34px;display:flex;flex-direction:column;justify-content:flex-end}
#jobgame .jg-r b{font:800 15px/1.1 var(--f-d,Arial);letter-spacing:.04em}#jobgame .jg-r.grow{flex:1}#jobgame .jg-r.warn{--c:var(--m-warn,#ffb347)}
#jobgame .jg-main{padding:6px 10px 6px 22px;min-width:0}
#jobgame .jg-lbl{font:700 11px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#jobgame canvas{display:block;width:100%;height:auto;background:#05060b;border-radius:4px 14px 4px 4px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--kc3) 45%,transparent),0 0 14px color-mix(in srgb,var(--kc3) 18%,transparent)}
#jobgame .jg-seg{position:relative;height:10px;border-radius:5px;margin:7px 0 2px;background:linear-gradient(90deg,var(--sc,var(--kc4)) calc(var(--v,100) * 1%),rgba(255,255,255,.1) 0);overflow:hidden}
#jobgame .jg-seg::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(4% - 3px),#05060b calc(4% - 3px) 4%)}#jobgame .jg-seg.low{--sc:var(--m-alert,#ff5a4a)}body.cb #jobgame .jg-seg.low{--sc:#ffb000}
#jobgame .jg-tool{font:800 20px/1.15 var(--f-d,Arial);letter-spacing:.06em;text-transform:uppercase;color:#fff;margin:2px 0 6px}
#jobgame .jg-how{margin:5px 0;color:#ddd6e8;font-weight:600}#jobgame .jg-how.k{color:var(--kc4)}#jobgame .jg-how.d{color:var(--dim)}
#jobgame kbd{display:inline-grid;place-items:center;min-width:1.5em;height:1.45em;padding:0 .35em;margin:0 .1em;border-radius:.45em;background:var(--ink);color:#0b0a10;font:800 11px var(--f-m,monospace)}
#jobgame .jg-btns{display:flex;gap:5px;flex-wrap:wrap;padding:6px 10px 6px 22px}
#jobgame button{flex:1;min-width:52px;min-height:30px;border:0;border-radius:99px;padding:3px 12px;background:var(--b,var(--kc3));color:#120a05;font:800 12px var(--f-d,Arial);letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:filter .1s,transform .06s}
#jobgame button:nth-child(4n+2){--b:var(--kc2)}#jobgame button:nth-child(4n+3){--b:var(--kc4)}#jobgame button:nth-child(4n+4){--b:#f7c9a2}#jobgame button:hover{filter:brightness(1.18)}#jobgame button:active{transform:scale(.97);filter:brightness(1.35)}
#jobgame button kbd{background:rgba(0,0,0,.72);color:#fff}#jobgame .jg-btns.tight button{min-width:30px;padding:0 6px}#jobgame button:focus-visible{outline:2px solid #fff;outline-offset:2px}
#jobgame button.go{--b:var(--kc)}#jobgame button.no{--b:#55507e;color:#fff}
#jobgame .jg-res{font:800 15px var(--f-d,Arial);letter-spacing:.12em;text-transform:uppercase;color:var(--kc4);text-align:center;padding:8px 10px 8px 22px}
#jobgame.calm,#jobgame.calm *{transition:none!important}#jobgame.calm{box-shadow:0 0 0 1px rgba(0,0,0,.7),0 14px 50px rgba(0,0,0,.7)}`;
// palettes: lead colours (always paired with a mark), good band, bad flash. cb: blue / amber / white / magenta, no red-green pair
const PAL = { wires: ['#ff5a48', '#4fd06a', '#4f9dff', '#ffd23f'], good: '#4fd06a', bad: '#ff5a48' };
const PAL_CB = { wires: ['#ffb000', '#4f9dff', '#f2f2f2', '#d45fd4'], good: '#4f9dff', bad: '#ffb000' };
// sound captions for a strike, by the game's reason
const CAPS = { spark: 'sparks', spike: 'pressure spike', overdose: 'patient monitor alarm', underdose: 'patient monitor alarm', 'wrong bed': 'monitor alarm', burnt: 'pan sizzles, smoke', raw: 'chef tuts', static: 'static hiss', 'breaker trip': 'breaker clunk', 'bad mix': 'pump gurgles', list: 'deck groans', hazard: 'proximity alarm', 'they close up': 'awkward silence', 'let the wrong person in': 'door alarm', 'turned away crew who belong': 'grumbling', 'passed a bad part': 'rig buzzer', 'rejected a good part': 'rig buzzer', 'that slot is fine': 'tray buzzer', 'count off': 'count mismatch beep', misclassified: 'sensor chirp', 'that entry is fine': 'log beep', 'still in date': 'scanner beep', 'wrong crate': 'scanner buzz', misread: 'decoder buzz' };
const DEPT_COL = { medical: '#3fd6a0', engineering: '#e8892b', science: '#c58be0', security: '#ff7a6b', galley: '#c6d25e', cargo: '#d6c85a', bridge: '#6ea8ff' };   // css/hud-skin.css --m-* (department meaning colours)
const DEPT_NAME = { medical: 'Medical', engineering: 'Engineering', science: 'Sciences', security: 'Security', galley: 'Services', cargo: 'Operations', bridge: 'Command' };
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
    this.phase = 'play'; this.game = createGame(j.tool.kind, j.seed, { calm: !!this.CFG?.calm, theme: j.tool.theme }); this.render();
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
    const g = this.game, why = g.events[g.events.length - 1]?.why || 'error'; this.sound?.denied?.(); this.caption(CAPS[why] || 'error buzz');
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
    if (!this.el || !this.active) return; const j = this.active, t = j.tool, K = KINDS[t.kind], kb = (k) => `<kbd>${esc(k)}</kbd>`, intro = this.phase === 'intro';
    const dept = t.dept || K.dept || '', col = DEPT_COL[dept] || '#f0933a', time = this.G.comms?.clock?.format?.();
    this.el.style.setProperty('--kc', col); this.el.dataset.dept = dept || 'ops'; this.el.classList.toggle('calm', !!this.CFG?.calm);
    const rail = (rows) => rows.map(([k, v, cls = '', c = '']) => `<div class="jg-r ${cls}"${c ? ` style="--c:${c}"` : ''}${cls.includes('dyn') ? ` data-r="${k.toLowerCase()}"` : ''}><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const top = `<div class="jg-el t">${esc(DEPT_NAME[dept] || 'Ops')}</div><div class="jg-top"><div class="jg-bars"><b></b><i></i><i class="l"></i><i class="p"></i></div>
      <div class="jg-hd"><span class="pill">${esc(j.station || t.name)}</span><span class="jg-ttl">${esc(intro ? 'New tool · ' + K.title : K.title)}</span>${time ? `<span class="jg-sd">SHIP TIME ${esc(time)}</span>` : ''}</div></div>`;
    const bot = (inner) => `<div class="jg-el b">${intro ? 'Brief' : 'Input'}</div><div class="jg-bot"><div class="jg-bars"><b></b><i></i><i class="p"></i></div>${inner}</div>`;
    if (intro) {
      this.el.innerHTML = `<div class="jg-fr">${top}<div class="jg-rail">${rail([['Tool', 'New', '', 'var(--k-gold,#f4c25b)'], ['Keys', String(t.keys.length), '', 'var(--k-lav,#b99be6)'], ['Faults', K.strikes ? `${K.strikes} max` : 'none'], ['Time', `${Math.round(K.limit * (this.CFG?.calm ? 1.5 : 1))} s`, 'grow', '#f7c9a2']])}</div>
        <div class="jg-main"><div class="jg-lbl">${esc(j.label || t.name)}</div><div class="jg-tool">${esc(t.name)}</div>
        <div class="jg-how">${esc(t.how)}</div><div class="jg-how">${esc(K.rule)}</div><div class="jg-how k">Keys: ${t.keys.map(kb).join(' ')} · ${kb('Esc')} cancel (the job stays due)</div>
        <div class="jg-how d">A clean job is faster; a fumbled one still gets done, logged as rushed.</div></div>
        ${bot(`<div class="jg-btns"><button class="go" data-k="Enter">Begin ${kb('Enter')}</button><button class="no" data-k="Escape">Cancel ${kb('Esc')}</button></div>`)}</div>`;
      this.el.querySelector('[data-k="Escape"]').onmousedown = (e) => { e.stopPropagation(); this.G.ui?.close('jobgame'); if (this.active) this.cancel(); };
      return;
    }
    const btns = this.buttons(t.kind, kb), g = this.game;
    this.el.innerHTML = `<div class="jg-fr">${top}<div class="jg-rail">${rail([[g?.rounds ? 'Round' : 'Step', '–', 'dyn', 'var(--k-gold,#f4c25b)'], ['Faults', '0', 'dyn', 'var(--k-lav,#b99be6)'], ['Time', '–', 'dyn'], ['Status', 'Online', 'grow dyn', '#f7c9a2']])}</div>
      <div class="jg-main"><div class="jg-lbl">${esc(j.label || t.name)}</div><canvas width="400" height="170"></canvas><div class="jg-seg"></div></div>
      ${bot(this.phase === 'done' ? `<div class="jg-res">${esc(this.result?.label || '')}</div>` : `<div class="jg-btns${(btns.match(/<button/g) || []).length > 6 ? ' tight' : ''}">${btns}<button class="no" data-k="Escape">Esc</button></div>`)}</div>`;
    const ex = this.el.querySelector('.jg-btns [data-k="Escape"]'); if (ex) ex.onmousedown = (e) => { e.stopPropagation(); this.G.ui?.close('jobgame'); if (this.active) this.cancel(); };
    this.cv = this.el.querySelector('canvas'); this.draw();
  }
  // on-screen buttons (a free cursor can play too): data-k is the key code each one sends (down on press, up on release)
  buttons(kind, kb) {
    const B = (k, l) => `<button data-k="${k}">${l}</button>`, D = (n, lab = (d) => String(d)) => Array.from({ length: n }, (_, i) => B('Digit' + (i + 1), lab(i + 1))).join(''), g = this.game;
    const arrows = B('ArrowUp', '▲') + B('ArrowDown', '▼') + B('ArrowLeft', '◀') + B('ArrowRight', '▶');
    switch (kind) {
      case 'sequence': return [1, 2, 3, 4].map(d => B('Digit' + d, `${SYM[d - 1]} ${d}`)).join('');
      case 'wires': return B('ArrowUp', '↑') + B('ArrowDown', '↓') + D(4);
      case 'dial': return B('Space', `Bleed ${kb('Space')}`);
      case 'calibrate': return B('ArrowLeft', '◀ hold') + B('ArrowRight', 'hold ▶');
      case 'vitals': return D(4, d => `Bed ${d}`);
      case 'hypo': return B('ArrowDown', '−5') + B('ArrowLeft', '−1') + B('ArrowRight', '+1') + B('ArrowUp', '+5') + B('Space', `Give ${kb('Space')}`);
      case 'tray': case 'doorlog': return D(6);
      case 'meds': return D(9);
      case 'counsel': return D(3);
      case 'fresh': return D(5);
      case 'manifest': return D(4);
      case 'classify': return D(4, d => `${d} ${esc(g?.legend?.[d - 1]?.name || '')}`);
      case 'decode': return D(4);
      case 'cook': return D(3, d => `Pan ${d}`);
      case 'badge': return B('Digit1', '1 Admit') + B('Digit2', '2 Deny');
      case 'bench': return B('Digit1', g?.theme === 'coil' ? '1 Keep' : '1 Pass') + B('Digit2', g?.theme === 'coil' ? '2 Swap' : '2 Reject');
      case 'power': case 'nutrient': return arrows + B('Enter', `${kind === 'power' ? 'Route' : 'Mix'} ${kb('Enter')}`);
      case 'tune': return B('ArrowLeft', '◀ hold') + B('ArrowRight', 'hold ▶') + B('Space', `Lock ${kb('Space')}`);
      case 'loadbal': return B('ArrowLeft', '◀ Port') + B('ArrowRight', 'Starboard ▶');
      case 'course': return arrows;
      default: return '';
    }
  }
  draw() {
    const cv = this.cv, g = this.game; if (!cv || !g || !cv.getContext) return; const c = cv.getContext('2d'); if (!c) return; const W = cv.width, H = cv.height, P = this.palette;
    c.fillStyle = '#05060b'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(125,151,232,.10)'; c.lineWidth = 1; for (let x = 10; x < W; x += 20) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); } for (let y = 10; y < H; y += 20) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }   // thin panel grid
    c.strokeStyle = 'rgba(185,155,230,.55)'; c.lineWidth = 2; for (const [x, y, sx, sy] of [[3, 3, 1, 1], [W - 3, 3, -1, 1], [3, H - 3, 1, -1], [W - 3, H - 3, -1, -1]]) { c.beginPath(); c.moveTo(x, y + sy * 12); c.lineTo(x, y); c.lineTo(x + sx * 12, y); c.stroke(); }   // corner brackets
    const left = Math.max(0, 1 - g.t / g.limit), rr = (k, v, warn) => { const e = this.el.querySelector(`[data-r="${k}"] b`); if (e && e.textContent !== v) e.textContent = v; e?.parentElement.classList.toggle('warn', !!warn); };
    rr(g.rounds ? 'round' : 'step', g.rounds ? `${Math.min(g.round + 1, g.rounds)}/${g.rounds}` : g.need ? `${Math.min((g.hits || 0) + 1, g.need)}/${g.need}` : g.code ? `${Math.min(g.pos + 1, g.code.length)}/${g.code.length}` : '1/1');
    rr('faults', g.maxStrikes ? `${g.strikes}/${g.maxStrikes}` : '—', g.strikes > 0); rr('time', `${Math.max(0, Math.ceil(g.limit - g.t))} s`, left < 0.25); rr('status', g.state === 'play' ? (g.strikes ? 'Fault' : 'Online') : g.state === 'win' ? 'Done' : 'Logged', g.strikes > 0 && g.state === 'play');
    const seg = this.el.querySelector('.jg-seg'); if (seg) { seg.style.setProperty('--v', Math.round(left * 100)); seg.classList.toggle('low', left < 0.25); }
    const fn = DRAW[g.kind]; c.save(); c.textBaseline = 'alphabetic'; if (fn) fn.call(this, c, W, H, g, P); else if (g.kind === 'sequence') this.drawSeq(c, W, H, g, P); else if (g.kind === 'wires') this.drawWires(c, W, H, g, P); else if (g.kind === 'dial') this.drawDial(c, W, H, g, P); else this.drawCal(c, W, H, g, P); c.restore();
  }
  mark(c, kind, x, y, r) { c.beginPath(); if (kind === 'circle') c.arc(x, y, r, 0, 6.283); else if (kind === 'triangle') { c.moveTo(x, y - r); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); c.closePath(); } else if (kind === 'square') c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); else { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); } }
  drawSeq(c, W, H, g, P) {   // LCARS-ish code strip: five cells, the next one lit; four keypad pads below
    const n = g.code.length, cw = 56, x0 = (W - n * cw) / 2;
    for (let i = 0; i < n; i++) { const x = x0 + i * cw, done = i < g.pos, cur = i === g.pos; c.fillStyle = done ? P.good : cur ? '#f0933a' : '#1d1a33'; c.beginPath(); c.roundRect?.(x + 4, 18, cw - 8, 44, 10); if (!c.roundRect) c.rect(x + 4, 18, cw - 8, 44); c.fill();
      c.fillStyle = done || cur ? '#0a0912' : '#a8a6b9'; c.font = '700 22px sans-serif'; c.textAlign = 'center'; c.fillText(SYM[g.code[i] - 1], x + cw / 2, 48); c.font = '700 11px sans-serif'; c.fillText(String(g.code[i]), x + cw / 2, 60); }
    for (let d = 0; d < 4; d++) { const x = W / 2 - 150 + d * 75; c.fillStyle = '#2a2748'; c.fillRect(x + 6, 84, 63, 60); c.fillStyle = '#f3eee6'; c.font = '700 26px sans-serif'; c.textAlign = 'center'; c.fillText(SYM[d], x + 37, 120); c.font = '700 12px sans-serif'; c.fillText(String(d + 1), x + 37, 138); }
  }
  drawWires(c, W, H, g, P) {   // left: loose leads (colour + mark); right: numbered terminals (colour + mark); done pairs drawn as a cable
    const y = (i) => 22 + i * 36;
    for (let i = 0; i < 4; i++) {
      const col = P.wires[i], k = g.right.indexOf(i);
      c.fillStyle = col; this.mark(c, MARKS[i], 40, y(i), 9); c.fill(); if (g.sel === i && !g.done[i]) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(22, y(i) - 15, 36, 30); }
      const tcol = P.wires[g.right[i]]; c.fillStyle = tcol; this.mark(c, MARKS[g.right[i]], W - 60, y(i), 9); c.fill(); c.fillStyle = '#f3eee6'; c.font = '700 14px sans-serif'; c.textAlign = 'left'; c.fillText(String(i + 1), W - 40, y(i) + 5);
      c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); c.moveTo(52, y(i));
      if (g.done[i]) c.bezierCurveTo(W / 2, y(i), W / 2, y(k), W - 72, y(k)); else c.quadraticCurveTo(100, y(i) + 18, 120 + (i % 2) * 10, y(i) + 6 - (g.sel === i ? 4 : 0));
      c.stroke();
    }
  }
  drawDial(c, W, H, g, P) {   // a half-round pressure gauge: band outlined (not colour only), the needle sweeps; hits as lit pips
    const cx = W / 2, cy = 140, r = 110, a = (x) => Math.PI + x * Math.PI;
    c.lineWidth = 14; c.strokeStyle = '#1d1a33'; c.beginPath(); c.arc(cx, cy, r, Math.PI, 2 * Math.PI); c.stroke();
    c.strokeStyle = P.good; c.beginPath(); c.arc(cx, cy, r, a(g.band[0]), a(g.band[1])); c.stroke(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r + 9, a(g.band[0]), a(g.band[1])); c.stroke(); c.beginPath(); c.arc(cx, cy, r - 9, a(g.band[0]), a(g.band[1])); c.stroke();
    c.strokeStyle = g.inBand() ? '#fff' : '#f7c9a2'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a(g.x)) * (r - 4), cy + Math.sin(a(g.x)) * (r - 4)); c.stroke(); c.fillStyle = '#a8a6b9'; c.beginPath(); c.arc(cx, cy, 7, 0, 6.283); c.fill();
    for (let i = 0; i < g.need; i++) { c.fillStyle = i < g.hits ? P.good : '#2a2748'; c.beginPath(); c.arc(cx - 20 + i * 20, cy - 30, 6, 0, 6.283); c.fill(); }
  }
  drawCal(c, W, H, g, P) {   // a horizontal trace: the drifting reading (outlined window), the marker the player steers, the fill meter
    const x = (v) => 20 + v * (W - 40), y = 70;
    c.strokeStyle = 'rgba(159,179,204,.5)'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= 60; i++) { const xx = 20 + i / 60 * (W - 40); c.lineTo(xx, y + Math.sin(i * 0.7 + g.t * 6) * 4); } c.stroke();
    c.fillStyle = g.inBand() ? P.good : 'rgba(125,151,232,.35)'; c.globalAlpha = 0.35; c.fillRect(x(g.target - g.tw), 30, x(g.target + g.tw) - x(g.target - g.tw), 80); c.globalAlpha = 1; c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(x(g.target - g.tw), 30, x(g.target + g.tw) - x(g.target - g.tw), 80);
    c.fillStyle = '#f0933a'; c.beginPath(); c.moveTo(x(g.m), 26); c.lineTo(x(g.m) - 9, 12); c.lineTo(x(g.m) + 9, 12); c.closePath(); c.fill(); c.fillRect(x(g.m) - 1.5, 26, 3, 88);
    c.fillStyle = '#1d1a33'; c.fillRect(20, 128, W - 40, 14); c.fillStyle = P.good; c.fillRect(20, 128, (W - 40) * Math.min(1, g.fill / g.need), 14); c.strokeStyle = '#a8a6b9'; c.lineWidth = 1; c.strokeRect(20, 128, W - 40, 14);
  }
}

// ---------------------------------------------------------------- the themed games' drawings (canvas 2D, 400 x 170, procedural only)
// helpers: text, wrapped text, a rounded box, round pips. Every cue is text or shape first; colour only adds to it (colour-blind palette: P).
function T(c, s, x, y, size = 12, col = '#f3eee6', align = 'left', w = 700) { c.font = `${w} ${size}px "Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif`; c.fillStyle = col; c.textAlign = align; c.fillText(String(s), x, y); }
function wrap(c, s, x, y, maxW, lh, size = 12, col = '#f3eee6', w = 600) { c.font = `${w} ${size}px "Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif`; c.fillStyle = col; c.textAlign = 'left'; let line = '', yy = y; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); yy += lh; line = word; } else line = t; } if (line) c.fillText(line, x, yy); return yy + lh; }
function box(c, x, y, w, h, fill, stroke, r = 6) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); } }
function pips(c, n, done, x, y, P) { for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + i * 14, y, 5, 0, 6.283); c.fillStyle = i < done ? P.good : '#2a2748'; c.fill(); c.strokeStyle = '#a8a6b9'; c.lineWidth = 1; c.stroke(); } }
const fmtV = (k, v) => k === 'Temp' ? v.toFixed(1) : String(v);
// procedural instrument silhouettes (tray check)
function instrument(c, kind, x, y, col, outline = false) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = outline ? 2 : 3; c.setLineDash(outline ? [4, 2] : []); c.beginPath();
  if (kind === 'scalpel') { c.moveTo(-14, 8); c.lineTo(6, -4); c.moveTo(6, -4); c.lineTo(14, -10); c.lineTo(10, -3); c.closePath(); }
  else if (kind === 'forceps') { c.moveTo(-14, 10); c.lineTo(12, -6); c.moveTo(-14, 10); c.lineTo(14, 0); }
  else if (kind === 'clamp') { c.moveTo(-12, -10); c.lineTo(12, 10); c.moveTo(-12, 10); c.lineTo(12, -10); c.moveTo(-6, -10); c.arc(-12, -10, 4, 0, 6.283); c.moveTo(-6, 10); c.arc(-12, 10, 4, 0, 6.283); }
  else if (kind === 'probe') { c.moveTo(-14, 0); c.lineTo(10, 0); c.moveTo(16, 0); c.arc(13, 0, 3.5, 0, 6.283); }
  else if (kind === 'hypo') { c.rect(-12, -5, 16, 10); c.moveTo(4, 0); c.lineTo(14, 0); c.moveTo(-12, -8); c.lineTo(-12, 8); }
  else { c.arc(0, 2, 10, Math.PI * 1.05, Math.PI * 1.95); c.moveTo(10, 0); c.lineTo(14, -4); }
  c.stroke(); c.restore();
}
const TRAITS = { contact: ['size', 'emission', 'motion'], bio: ['culture', 'glow', 'growth'] };
const DRAW = {
  vitals(c, W, H, g, P) {
    const r = g.cur; T(c, 'Normal: HR 60–100 · SpO₂ 95–100 · Temp 36.1–37.5 · BP 100–140', W / 2, 14, 11, '#a8a6b9', 'center', 600);
    r.beds.forEach((b, i) => {
      const x = 6 + i * 98, y = 22; box(c, x, y, 92, 132, '#0c0b1a', r.missedAt === i ? P.bad : '#55507e'); T(c, `BED ${i + 1}`, x + 6, y + 14, 12, '#f7c9a2'); T(c, b.name, x + 6, y + 27, 9, '#a8a6b9', 'left', 600);
      c.strokeStyle = P.good; c.lineWidth = 1.5; c.beginPath(); const per = 60 / b.v.HR; for (let k = 0; k <= 80; k++) { const tt = (g.t + k / 80 * 1.6) % per / per, yy = y + 46 - (tt > 0.1 && tt < 0.16 ? 12 : tt > 0.16 && tt < 0.2 ? -6 : 0); k ? c.lineTo(x + 6 + k, yy) : c.moveTo(x + 6, yy); } c.stroke();
      ['HR', 'SpO2', 'Temp', 'BP'].forEach((k, j) => { T(c, k === 'SpO2' ? 'SpO₂' : k, x + 6, y + 72 + j * 16, 10, '#a8a6b9', 'left', 600); T(c, fmtV(k, b.v[k]), x + 86, y + 72 + j * 16, 13, '#fff', 'right'); });
    });
  },
  hypo(c, W, H, g, P) {
    T(c, `Patient: ${g.patient}`, 12, 20, 12, '#a8a6b9', 'left', 600); T(c, `Rx: ${g.drug} ${g.dose} mg`, 12, 40, 16, '#f7c9a2');
    const x0 = 20, x1 = W - 20, y = 96, X = (v) => x0 + (x1 - x0) * v / g.max; c.fillStyle = '#1d1a33'; c.fillRect(x0, y - 8, x1 - x0, 16);
    c.fillStyle = 'rgba(125,151,232,.5)'; c.fillRect(x0, y - 8, X(g.v) - x0, 16); c.strokeStyle = '#a8a6b9'; c.lineWidth = 1; c.strokeRect(x0, y - 8, x1 - x0, 16);
    for (let v = 0; v <= g.max; v += 5) { c.fillStyle = '#a8a6b9'; c.fillRect(X(v) - 0.5, y + 10, 1, 6); T(c, v, X(v), y + 28, 10, '#a8a6b9', 'center', 600); }
    c.fillStyle = '#f0933a'; c.beginPath(); c.moveTo(X(g.v), y - 10); c.lineTo(X(g.v) - 7, y - 22); c.lineTo(X(g.v) + 7, y - 22); c.closePath(); c.fill();
    T(c, `${g.v} mg`, W - 14, 40, 22, '#fff', 'right'); pips(c, g.need, g.hits, W / 2 - 14, 150, P);
  },
  tray(c, W, H, g, P) {
    const r = g.cur, cw = 62, x0 = (W - cw * 6) / 2; T(c, 'Layout card', 8, 14, 11, '#a8a6b9', 'left', 600); T(c, 'Tray', 8, 92, 11, '#a8a6b9', 'left', 600);
    for (let i = 0; i < 6; i++) {
      const x = x0 + i * cw + cw / 2; box(c, x - 28, 20, 56, 52, '#0c0b1a', '#55507e'); instrument(c, r.layout[i], x, 40, '#c8c2dc', true); T(c, r.layout[i], x, 66, 9, '#a8a6b9', 'center', 600);
      box(c, x - 28, 98, 56, 50, '#17142a', '#6b68a0'); if (r.tray[i]) instrument(c, r.tray[i], x, 122, '#f3eee6'); else T(c, 'empty', x, 126, 9, '#6b68a0', 'center', 600); T(c, i + 1, x - 22, 112, 11, '#f7c9a2', 'left');
    }
  },
  meds(c, W, H, g, P) {
    const r = g.cur; T(c, `Count: ${r.drug.toUpperCase()}`, 12, 18, 14, '#f7c9a2'); T(c, `manifest says ${r.manifest}`, W - 12, 18, 11, '#a8a6b9', 'right', 600);
    box(c, 10, 26, W - 20, 124, '#0c0b1a', '#55507e');
    for (const v of r.vials) { const col = v.s % 8, row = Math.floor(v.s / 8), x = 34 + col * 47, y = 48 + row * 38; c.save(); c.translate(x, y); c.rotate(v.rot);
      if (v.drug === 0) { box(c, -7, -14, 14, 28, P.good, '#fff', 7); T(c, r.drug[0], 0, 4, 10, '#0a0912', 'center'); }
      else { c.beginPath(); c.arc(0, 2, 11, 0, 6.283); c.fillStyle = '#7a6bd0'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke(); c.fillRect(-4, -14, 8, 6); T(c, r.other[0], 0, 6, 10, '#fff', 'center'); }
      c.restore(); }
    T(c, `capsules marked ${r.drug[0]} are ${r.drug}; round bottles are ${r.other}`, W / 2, 162, 9, '#a8a6b9', 'center', 600);
  },
  counsel(c, W, H, g, P) {
    const r = g.cur; T(c, r.who, 10, 15, 11, '#a8a6b9', 'left', 600); let y = wrap(c, `“${r.prompt}”`, 10, 33, W - 20, 15, 13, '#fff', 700) + 2;
    r.replies.forEach((s, i) => { box(c, 8, y - 12, W - 16, 34, '#0c0b1a', '#55507e', 4); T(c, i + 1, 16, y + 3, 13, '#f7c9a2'); wrap(c, s, 32, y + 2, W - 50, 13, 11, '#f3eee6'); y += 38; });
  },
  power(c, W, H, g, P) { DRAW.alloc.call(this, c, W, H, g, P, 'load', 'Reserve'); },
  nutrient(c, W, H, g, P) { T(c, g.bed, W - 12, 16, 12, '#f7c9a2', 'right'); DRAW.alloc.call(this, c, W, H, g, P, 'ml', 'Stock'); },
  alloc(c, W, H, g, P, unit, resName) {
    const n = g.cur.length, cw = 64, x0 = 16, uh = 16, base = 128;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (cw + 10), sel = i === g.sel; box(c, x, base - g.cap * uh - 4, cw, g.cap * uh + 8, sel ? '#17142a' : '#0c0b1a', sel ? '#f7c9a2' : '#55507e');
      for (let u = 0; u < g.cur[i]; u++) { c.fillStyle = g.cur[i] === g.target[i] ? P.good : '#7d97e8'; c.fillRect(x + 8, base - (u + 1) * uh + 2, cw - 16, uh - 4); }
      const ty = base - g.target[i] * uh; c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([5, 3]); c.beginPath(); c.moveTo(x + 2, ty); c.lineTo(x + cw - 2, ty); c.stroke(); c.setLineDash([]);
      T(c, `${g.cur[i]}/${g.target[i]}`, x + cw / 2, base + 16, 12, g.cur[i] === g.target[i] ? '#fff' : '#f7c9a2', 'center'); T(c, g.names[i], x + cw / 2, base + 29, 9, '#a8a6b9', 'center', 600);
      if (sel) T(c, '▼', x + cw / 2, base - g.cap * uh - 8, 11, '#f7c9a2', 'center');
    }
    const rx = W - 52; box(c, rx, 30, 40, 98, '#0c0b1a', '#6b68a0'); for (let u = 0; u < g.reserve; u++) { c.fillStyle = '#f0933a'; c.fillRect(rx + 6, 124 - (u + 1) * 9, 28, 7); } T(c, resName, rx + 20, 26, 10, '#a8a6b9', 'center', 600); T(c, g.reserve, rx + 20, 144, 13, '#fff', 'center');
    T(c, '- - demand', W - 12, 162, 9, '#a8a6b9', 'right', 600);
  },
  bench(c, W, H, g, P) {
    const r = g.cur, rng = Math.max(r.hi - r.lo, 1); T(c, `${r.name}`, 12, 22, 15, '#fff'); T(c, `serial ${r.serial}`, 12, 38, 10, '#a8a6b9', 'left', 600);
    T(c, `${r.v} ${r.unit}`, W - 14, 30, 22, '#f7c9a2', 'right'); T(c, `spec ${r.lo} – ${r.hi} ${r.unit}`, W - 14, 46, 11, '#a8a6b9', 'right', 600);
    const lo = r.lo - rng * 0.8, hi = r.hi + rng * 0.8, X = (v) => 20 + (W - 40) * clamp01((v - lo) / (hi - lo)), y = 86;
    c.fillStyle = '#1d1a33'; c.fillRect(20, y - 10, W - 40, 20); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(X(r.lo), y - 10, X(r.hi) - X(r.lo), 20); c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(X(r.lo), y - 10, X(r.hi) - X(r.lo), 20);
    T(c, 'IN SPEC', (X(r.lo) + X(r.hi)) / 2, y + 26, 9, '#a8a6b9', 'center', 600); c.fillStyle = '#f0933a'; c.beginPath(); c.moveTo(X(r.v), y + 12); c.lineTo(X(r.v) - 7, y + 24); c.lineTo(X(r.v) + 7, y + 24); c.closePath(); c.fill(); c.fillRect(X(r.v) - 1.5, y - 14, 3, 26);
    pips(c, g.rounds, g.round, W / 2 - 28, 146, P);
  },
  tune(c, W, H, g, P) {
    const x0 = 16, w = W - 70, y0 = 20, h = 100, X = (v) => x0 + v * w; box(c, x0, y0, w, h, '#0c0b1a', '#55507e', 3); c.strokeStyle = 'rgba(159,179,204,.7)'; c.lineWidth = 1.5; c.beginPath();
    for (let i = 0; i < 64; i++) { const v = i / 63, n = g.noise[(i + Math.floor(g.t * 9)) % 64], bump = Math.exp(-Math.pow((v - g.peak) / 0.06, 2)) * 0.28, yy = y0 + h - 8 - (n * 0.45 + bump) * (h - 20); i ? c.lineTo(X(v), yy) : c.moveTo(X(v), yy); } c.stroke();
    c.strokeStyle = '#f0933a'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(g.x), y0); c.lineTo(X(g.x), y0 + h); c.stroke(); T(c, `${(100 + g.x * 400).toFixed(1)} MHz`, X(g.x), y0 + h + 14, 11, '#f7c9a2', 'center');
    const s = g.strength(), mx = W - 44, thr = Math.exp(-Math.pow(g.tol / 0.09, 2)); box(c, mx, y0, 26, h, '#0c0b1a', '#6b68a0', 3); c.fillStyle = g.locked() ? P.good : '#7d97e8'; c.fillRect(mx + 4, y0 + h - 4 - s * (h - 8), 18, s * (h - 8));
    const ty = y0 + h - 4 - thr * (h - 8); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(mx - 4, ty); c.lineTo(mx + 30, ty); c.stroke(); T(c, 'LOCK', mx + 13, y0 - 4, 9, '#fff', 'center'); T(c, g.locked() ? 'LOCKED' : '', mx + 13, y0 + h + 14, 9, '#fff', 'center');
    pips(c, g.need, g.hits, 20, 150, P);
  },
  classify(c, W, H, g, P) {
    const r = g.cur, tr = TRAITS[g.theme === 'bio' ? 'bio' : 'contact'], keys = ['size', 'em', 'mo'];
    g.legend.forEach((L, i) => { const y = 12 + i * 32; box(c, 6, y, 196, 28, '#0c0b1a', '#55507e', 4); T(c, `${i + 1} ${L.name}`, 12, y + 12, 12, '#f7c9a2'); T(c, keys.map(k => L[k]).join(' · '), 12, y + 24, 10, '#d8d2e6', 'left', 600); });
    const cx = 300, cy = 70, R = 54, L = r.c; c.strokeStyle = 'rgba(125,151,232,.4)'; c.lineWidth = 1; for (const rr of [R, R * 0.6]) { c.beginPath(); c.arc(cx, cy, rr, 0, 6.283); c.stroke(); }
    const size = /large|cloudy/.test(L.size) ? 12 : 6, moving = /tumbling|dividing/.test(L.mo), powered = /powered/.test(L.mo), glow = L.em !== 'none';
    c.save(); c.translate(cx, cy); if (powered) { c.strokeStyle = 'rgba(255,217,160,.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-36, 18); c.lineTo(-size, size / 2); c.stroke(); }
    if (glow) { const pulse = /pulsing|glowing/.test(L.em) ? (Math.sin(g.t * 6) + 1) / 2 : 1; c.strokeStyle = `rgba(255,255,255,${0.3 + 0.6 * pulse})`; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, size + 6 + pulse * 6, 0, 6.283); c.stroke(); }
    c.rotate(moving ? g.t * 2.5 : 0); c.fillStyle = '#f3eee6'; c.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283, rr = size * (0.75 + ((k * 37) % 5) / 10); k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.restore();
    T(c, `${tr[0]} ${L.size} · ${tr[1]} ${L.em}`, cx, cy + R + 14, 10, '#fff', 'center', 700); T(c, `${tr[2]} ${L.mo}`, cx, cy + R + 27, 10, '#fff', 'center', 700); T(c, `contact ${Math.min(g.round + 1, g.rounds)}/${g.rounds}`, cx, 12, 10, '#a8a6b9', 'center', 600);
  },
  badge(c, W, H, g, P) {
    const r = g.cur, R = g.rule; T(c, `${R.door.toUpperCase()}: ${R.depts.join(', ')} · clearance ${R.min}+ · in date`, W / 2, 14, 11, '#f7c9a2', 'center');
    const x = 70, y = 24; box(c, x, y, 260, 124, '#f3eee6', '#fff', 10); const dcol = { Command: '#c8a040', Science: '#7d97e8', Medical: '#4fc0c0', Engineering: '#f0933a', Security: '#c05050', Operations: '#9a7ad0' }[r.dept] || '#888';
    c.fillStyle = dcol; c.fillRect(x, y + 10, 260, 16); T(c, r.dept.toUpperCase(), x + 130, y + 22, 11, '#0a0912', 'center');
    c.fillStyle = '#2a2748'; c.fillRect(x + 12, y + 34, 60, 72); const f = r.face; c.fillStyle = ['#c69c7a', '#8d5a3b', '#e8c4a0', '#5a3a28'][f % 4]; c.beginPath(); c.arc(x + 42, y + 64, 18, 0, 6.283); c.fill(); c.fillStyle = ['#1a1a1a', '#6b4423', '#d4b06a', '#aaa'][(f >> 2) % 4]; c.beginPath(); c.arc(x + 42, y + 58, 18, Math.PI, 2 * Math.PI); c.fill(); c.fillRect(x + 24, y + 86, 36, 20);
    T(c, r.name, x + 84, y + 50, 14, '#0a0912'); T(c, 'CLEARANCE', x + 84, y + 72, 9, '#55507e', 'left', 600); T(c, r.clear, x + 84, y + 96, 26, '#0a0912');
    T(c, r.expired ? 'EXPIRED' : 'VALID', x + 248, y + 96, 13, r.expired ? '#a03020' : '#205a30', 'right'); if (r.expired) { c.strokeStyle = '#a03020'; c.lineWidth = 2; c.strokeRect(x + 178, y + 80, 74, 22); }
    pips(c, g.rounds, g.round, W / 2 - 28, 160, P);
  },
  doorlog(c, W, H, g, P) {
    const r = g.cur; T(c, `Restricted: ${r.restricted.toUpperCase()} — authorised: ${r.ok.join(', ')}`, 8, 14, 11, '#f7c9a2');
    r.lines.forEach((L, i) => { const y = 24 + i * 21; box(c, 6, y, W - 12, 18, i % 2 ? '#0c0b1a' : '#100e20', null, 2); c.font = '700 12px monospace'; c.textAlign = 'left'; c.fillStyle = '#f7c9a2'; c.fillText(String(i + 1), 12, y + 13); c.fillStyle = '#f3eee6'; c.fillText(`${L.hm}  ${L.who.padEnd(10)} ${L.door === r.restricted ? '▶ ' : '  '}${L.door}`, 32, y + 13); });
    T(c, `log ${Math.min(g.round + 1, g.rounds)}/${g.rounds}`, W - 10, 162, 10, '#a8a6b9', 'right', 600);
  },
  cook(c, W, H, g, P) {
    g.pans.forEach((pan, i) => {
      const x = 20 + i * 128, by = 24, bh = 100; T(c, `${i + 1}  ${g.dishes[i]}`, x, 16, 11, '#f7c9a2'); c.fillStyle = '#2a2748'; c.beginPath(); c.arc(x + 40, by + 56, 32, 0, 6.283); c.fill(); c.fillStyle = '#55507e'; c.fillRect(x + 70, by + 52, 26, 8);
      const p = clamp01(pan.p); if (!pan.done && p > 0.5) for (let k = 0; k < 3; k++) { c.strokeStyle = `rgba(230,230,230,${(p - 0.5)})`; c.lineWidth = 2; c.beginPath(); const sx = x + 28 + k * 12; c.moveTo(sx, by + 30); c.quadraticCurveTo(sx + 6 * Math.sin(g.t * 3 + k), by + 18, sx, by + 6); c.stroke(); }
      c.fillStyle = pan.done ? '#a8a6b9' : `rgb(${150 + p * 90},${120 - p * 40},${60 - p * 40})`; c.beginPath(); c.arc(x + 40, by + 56, 22, 0, 6.283); c.fill();
      const bx = x + 100, X = (v) => by + bh - v * bh; c.fillStyle = '#1d1a33'; c.fillRect(bx, by, 14, bh); c.fillStyle = g.inWin(i) ? P.good : '#f0933a'; c.fillRect(bx, X(p), 14, p * bh);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(bx - 2, X(g.win[1]), 18, (g.win[1] - g.win[0]) * bh); T(c, 'DONE', bx + 7, X(g.win[1]) - 3, 8, '#fff', 'center');
      T(c, pan.done ? 'SERVED ✓' : g.inWin(i) ? 'NOW' : pan.p < g.win[0] ? 'cooking' : '', x + 40, by + bh + 22, 11, pan.done ? '#a8a6b9' : '#fff', 'center');
    });
  },
  fresh(c, W, H, g, P) {
    const r = g.cur; T(c, `Today: day ${r.today}`, 10, 16, 14, '#f7c9a2'); T(c, `shelf ${Math.min(g.round + 1, g.rounds)}/${g.rounds}`, W - 10, 16, 10, '#a8a6b9', 'right', 600); c.fillStyle = '#55507e'; c.fillRect(6, 132, W - 12, 6);
    r.items.forEach((it, i) => { const x = 8 + i * 78; box(c, x, 30, 72, 100, '#17142a', '#6b68a0', 4); T(c, i + 1, x + 6, 44, 12, '#f7c9a2'); wrap(c, it.name, x + 6, 62, 62, 12, 10, '#f3eee6', 700); T(c, `${it.qty} × ${it.unit}`, x + 6, 98, 9, '#a8a6b9', 'left', 600); T(c, 'use by', x + 6, 112, 9, '#a8a6b9', 'left', 600); T(c, `day ${it.day}`, x + 6, 125, 12, '#fff'); });
  },
  manifest(c, W, H, g, P) {
    const r = g.cur; box(c, 8, 8, W - 16, 26, '#f3eee6', null, 3); c.font = '700 14px monospace'; c.fillStyle = '#0a0912'; c.textAlign = 'left'; c.fillText(`MANIFEST  ${r.want}  →  ${r.dest}`, 16, 26);
    r.crates.forEach((code, i) => { const x = 12 + i * 96, y = 50; box(c, x, y, 84, 84, '#6b5536', '#3a2a18', 3); c.strokeStyle = '#3a2a18'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 84, y + 84); c.moveTo(x + 84, y); c.lineTo(x, y + 84); c.stroke();
      box(c, x + 6, y + 30, 72, 24, '#e8e2d0', null, 2); c.font = '700 13px monospace'; c.fillStyle = '#0a0912'; c.textAlign = 'center'; c.fillText(code, x + 42, y + 47); T(c, i + 1, x + 42, y + 100, 13, '#f7c9a2', 'center'); });
    T(c, `line ${Math.min(g.round + 1, g.rounds)}/${g.rounds}`, W - 12, 162, 10, '#a8a6b9', 'right', 600);
  },
  loadbal(c, W, H, g, P) {
    T(c, 'Next:', 10, 18, 11, '#a8a6b9', 'left', 600); g.queue.forEach((w, i) => { const x = 50 + i * 42, cur = i === g.i, done = i < g.i; box(c, x, 6, 34, 18, done ? '#2a2748' : cur ? '#f0933a' : '#6b5536', cur ? '#fff' : null, 3); T(c, `${w} t`, x + 17, 19, 11, done ? '#6b68a0' : '#0a0912', 'center'); });
    const cx = W / 2, cy = 96; c.strokeStyle = '#a8a6b9'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 150, cy - 50); c.lineTo(cx + 150, cy - 50); c.lineTo(cx + 150, cy + 40); c.lineTo(cx - 150, cy + 40); c.closePath(); c.stroke();
    T(c, 'PORT', cx - 100, cy - 36, 11, '#a8a6b9', 'center', 600); T(c, 'STARBOARD', cx + 100, cy - 36, 11, '#a8a6b9', 'center', 600); T(c, `${g.L} t`, cx - 100, cy + 6, 22, '#fff', 'center'); T(c, `${g.R} t`, cx + 100, cy + 6, 22, '#fff', 'center');
    const d = g.R - g.L, ang = clamp01((d + 6) / 12) * Math.PI - Math.PI / 2; c.strokeStyle = '#55507e'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy + 34, 34, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    const lim = g.lim / 6 * (Math.PI / 2); c.strokeStyle = P.good; c.beginPath(); c.arc(cx, cy + 34, 34, -Math.PI / 2 - lim, -Math.PI / 2 + lim); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy + 42, 34, -Math.PI / 2 - lim, -Math.PI / 2 + lim); c.stroke();
    c.strokeStyle = Math.abs(d) <= g.lim ? '#fff' : P.bad; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy + 34); c.lineTo(cx + Math.sin(ang) * 30, cy + 34 - Math.cos(ang) * 30); c.stroke(); T(c, `trim limit ±${g.lim} t`, cx, cy + 56, 9, '#a8a6b9', 'center', 600);
  },
  course(c, W, H, g, P) {
    const s = 17, gw = g.W * s * 2, x0 = (W - gw) / 2, y0 = 8, cs = s * 2 - 2, cell = (x, y) => [x0 + x * s * 2, y0 + y * s * 2 * 0.92];
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) { const [px, py] = cell(x, y); c.strokeStyle = 'rgba(125,151,232,.25)'; c.lineWidth = 1; c.strokeRect(px, py, cs, cs * 0.92);
      if (g.isHaz(x, y)) { c.fillStyle = '#6b5a4a'; c.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283, rr = 11 * (0.7 + (((x * 7 + y * 13 + k * 5) % 6) / 15)); k ? c.lineTo(px + cs / 2 + Math.cos(a) * rr, py + cs * 0.46 + Math.sin(a) * rr) : c.moveTo(px + cs / 2 + Math.cos(a) * rr, py + cs * 0.46 + Math.sin(a) * rr); } c.closePath(); c.fill(); c.strokeStyle = '#ffb000'; c.lineWidth = 1.5; c.stroke(); } }
    const [gx, gy] = cell(...g.goal); c.strokeStyle = P.good; c.lineWidth = 3; c.beginPath(); c.arc(gx + cs / 2, gy + cs * 0.46, 11, 0, 6.283); c.stroke(); T(c, `WP${g.hits + 1}`, gx + cs / 2, gy + cs * 0.46 + 4, 9, '#fff', 'center');
    const [sx, sy] = cell(...g.pos), dir = g.goal[0] > g.pos[0] ? 1 : -1; c.fillStyle = '#f7c9a2'; c.beginPath(); c.moveTo(sx + cs / 2 + 12 * dir, sy + cs * 0.46); c.lineTo(sx + cs / 2 - 9 * dir, sy + cs * 0.46 - 8); c.lineTo(sx + cs / 2 - 9 * dir, sy + cs * 0.46 + 8); c.closePath(); c.fill();
  },
  decode(c, W, H, g, P) {
    const r = g.cur, bits = (v) => Array.from({ length: 8 }, (_, i) => (v >> (7 - i)) & 1);
    const trace = (v, x, y, w, h, col, noisy) => { c.strokeStyle = col; c.lineWidth = noisy ? 2.5 : 2; c.beginPath(); bits(v).forEach((b, i) => { const xx = x + i * w / 8, jit = noisy ? Math.sin(g.t * 13 + i * 7) * 2 : 0, yy = y + (b ? 0 : h) + jit; if (i === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy); c.lineTo(xx + w / 8, yy); }); c.stroke(); };
    T(c, 'RECEIVED', 10, 16, 10, '#a8a6b9', 'left', 600); box(c, 80, 4, 220, 32, '#0c0b1a', '#55507e', 3); trace(r.rx, 90, 10, 200, 20, '#f7c9a2', true); T(c, bits(r.rx).join(''), 360, 26, 13, '#f7c9a2', 'center', 700);
    r.codes.forEach((code, i) => { const y = 46 + i * 28; box(c, 6, y, W - 12, 24, '#0c0b1a', '#55507e', 3); T(c, `${i + 1}  ${r.names[i]}`, 14, y + 16, 11, '#f3eee6'); trace(code, 150, y + 5, 150, 14, '#7d97e8', false); T(c, bits(code).join(''), 360, y + 16, 11, '#d8d2e6', 'center', 600); });
  },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
