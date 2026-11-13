// HUD for the player's billet (Systems Nominal): briefing screen, duty/task board, the J duty menu (do a duty / order / delegate / report),
// and the end-of-run summary. DOM only; injects its own markup + CSS.  Keys: J menu, B toggles the big board; digits choose, Backspace/Esc back.
import { Q_LABEL, QUALITIES } from './duty.js';

const CSS = `
#bd-brief{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.9);font:14px/1.45 'Helvetica Neue',Arial,sans-serif;color:#e6eef7}
#bd-brief.show{display:flex}#bd-brief .card{width:min(720px,94vw);max-height:92vh;overflow:auto;border:1px solid rgba(150,180,210,.3);border-top:3px solid var(--lc1,#f2a03d);padding:22px 26px;background:rgba(8,12,20,.96)}
#bd-brief h2{margin:0 0 2px;font:800 24px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:var(--lc4,#ffd9a0)}#bd-brief .sub{opacity:.65;margin-bottom:12px}
#bd-brief h4{margin:14px 0 4px;font:700 11px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d)}#bd-brief ul{margin:0;padding-left:18px}#bd-brief li{margin:2px 0}
#bd-brief button{margin-top:18px;padding:10px 26px;font:800 15px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;background:var(--lc1,#f2a03d);color:#08101a;border:0;cursor:pointer}
#bd-board{position:fixed;left:14px;top:92px;z-index:5;width:250px;pointer-events:none;font:12px/1.3 'Helvetica Neue',Arial,sans-serif;color:#e6eef7;text-shadow:0 1px 2px #000}
#bd-board .t{font:700 10px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d);margin-bottom:3px}
.bd-row{display:grid;grid-template-columns:8px 1fr auto;gap:6px;padding:2px 6px;margin-bottom:2px;background:rgba(5,8,14,.62);border-left:3px solid #567}
.bd-row.due,.bd-row.active{border-left-color:#ffb347}.bd-row.overdue,.bd-row.missed{border-left-color:#ff5a4a}.bd-row.doing{border-left-color:#8fd8ff}.bd-row.done{border-left-color:#4fd18b;opacity:.6}.bd-row.delegated{border-left-color:#b79cff}
.bd-row i{font-style:normal;font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.08em}.bd-row .bar{grid-column:1/4;height:3px;background:#234;margin-top:2px}.bd-row .bar b{display:block;height:100%;background:#8fd8ff}
#bd-menu{position:fixed;left:50%;bottom:20%;transform:translateX(-50%);z-index:9;display:none;min-width:min(420px,90vw);background:rgba(4,7,13,.94);border:1px solid rgba(150,180,210,.3);border-top:3px solid var(--lc1,#f2a03d);padding:12px 16px;font:13px/1.5 'Helvetica Neue',Arial,sans-serif;color:#e6eef7}
#bd-menu.show{display:block}#bd-menu h3{margin:0 0 6px;font:700 12px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;color:var(--lc4,#ffd9a0)}#bd-menu .o b{display:inline-block;min-width:22px;color:var(--lc1,#f2a03d)}#bd-menu .o.off{opacity:.45}#bd-menu .hint{font-size:11px;opacity:.55;margin-top:6px}
#bd-hint{position:fixed;left:50%;bottom:15%;transform:translateX(-50%);z-index:5;pointer-events:none;font:700 12px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;color:#ffe9a8;background:rgba(5,8,14,.7);padding:4px 12px;display:none}
#bd-end{position:fixed;inset:0;z-index:21;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.92);font:14px/1.45 'Helvetica Neue',Arial,sans-serif;color:#e6eef7}#bd-end.show{display:flex}
#bd-end .card{width:min(720px,94vw);max-height:92vh;overflow:auto;border:1px solid rgba(150,180,210,.3);border-top:3px solid #ff5a4a;padding:22px 26px;background:rgba(8,12,20,.97)}
#bd-end h2{margin:0 0 6px;font:800 24px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:#ff8a7a}#bd-end h4{margin:14px 0 4px;font:700 11px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d)}
#bd-end .c{padding:3px 0 3px 12px;border-left:2px solid #567;margin:2px 0;font-size:13px}#bd-end button{margin:14px 10px 0 0;padding:9px 18px;font:700 13px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;background:#1b2a3c;color:#e6eef7;border:1px solid #567;cursor:pointer}#bd-end button:hover{background:var(--lc1,#f2a03d);color:#08101a}
`;
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class DutyHUD {
  constructor(o = {}) {
    this.o = o; this.duty = null; this.menuStack = []; this.big = false;
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const mk = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
    this.brief = mk('bd-brief'); this.boardEl = mk('bd-board'); this.menuEl = mk('bd-menu'); this.hintEl = mk('bd-hint'); this.endEl = mk('bd-end');
    this.key = (e) => this.onKey(e); addEventListener('keydown', this.key, true);
  }
  destroy() { if (typeof document === 'undefined') return; removeEventListener('keydown', this.key, true); for (const e of [this.brief, this.boardEl, this.menuEl, this.hintEl, this.endEl]) e.remove(); }
  attach(duty) { this.duty = duty; this.menuStack = []; this.closeMenu(); this.endEl.classList.remove('show'); }
  get menuOpen() { return !!this.menuEl && this.menuEl.classList.contains('show'); }
  showBriefing(b, onBegin) {
    this.brief.innerHTML = `<div class="card"><h2>${esc(b.rank)} ${esc(b.name.replace(/^\S+\s/, ''))}</h2><div class="sub">${esc(b.title)} · reports to ${esc(b.boss)}${b.subs ? ` · ${b.subs} under your command` : ''}</div>
      <h4>Mission</h4><div>${esc(b.missionText)}.</div><h4>Your role</h4><div>${esc(b.role)}</div>
      <h4>Your duty rounds</h4><ul>${b.loops.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>Mission tasks</h4><ul>${b.tasks.map(x => `<li>${esc(x)}</li>`).join('') || '<li>None assigned.</li>'}</ul>
      <h4>How you can play it</h4><ul>${b.can.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${b.tempt ? `<h4>Temptation</h4><div>${esc(b.tempt)}</div>` : ''}
      <h4>Keys</h4><div>J duty menu · B big board · H radio · K alerts · L comm log · Tab ship status</div><button id="bd-go">Begin watch</button></div>`;
    this.brief.classList.add('show'); const go = () => { this.brief.classList.remove('show'); onBegin?.(); };
    this.brief.querySelector('#bd-go').onclick = go; this._brGo = go;
  }
  get briefing() { return !!this.brief && this.brief.classList.contains('show'); }
  // ---- menus
  openMenu(title, opts, hint = '') { this.menuStack.push({ title, opts, hint }); this.renderMenu(); }
  closeMenu() { this.menuStack = []; this.menuEl?.classList.remove('show'); document.body.classList.remove('bd-menu-open'); }
  back() { this.menuStack.pop(); this.menuStack.length ? this.renderMenu() : this.closeMenu(); }
  renderMenu() {
    const m = this.menuStack[this.menuStack.length - 1]; if (!m) return;
    this.menuEl.innerHTML = `<h3>${esc(m.title)}</h3>` + m.opts.map((o, i) => `<div class="o${o.off ? ' off' : ''}"><b>${i + 1}</b> ${esc(o.label)}${o.note ? ` <small style="opacity:.6">— ${esc(o.note)}</small>` : ''}</div>`).join('') + `<div class="hint">${esc(m.hint || 'digit to choose · Backspace back · Esc close')}</div>`;
    this.menuEl.classList.add('show'); document.body.classList.add('bd-menu-open');
  }
  onKey(e) {
    if (this.briefing) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); this._brGo?.(); } return; }
    const ph = this.o.getPhase?.(); if (ph !== 'play') { if (this.menuOpen && ph !== 'play') this.closeMenu(); return; }
    if (this.menuOpen) {
      const m = this.menuStack[this.menuStack.length - 1], d = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.closeMenu(); }
      else if (e.code === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); }
      else if (d && m) { e.preventDefault(); e.stopImmediatePropagation(); const o = m.opts[+d[1] - 1]; if (o && !o.off) { if (o.keepOpen) o.run?.(); else { this.closeMenu(); o.run?.(); } } }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyJ') { e.stopImmediatePropagation(); this.o.onMenu?.(); }
    else if (e.code === 'KeyB') { this.big = !this.big; this.renderBoard(); }
  }
  // ---- board + hint (called each frame by main)
  update(dt) {
    if (!this.duty || !this.boardEl) return; this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 0.25; this.renderBoard();
  }
  renderBoard() {
    if (!this.duty) return; const rows = this.duty.board().filter(r => this.big || (r.status !== 'done' && r.status !== 'missed' && (r.kind === 'duty' || r.status === 'active' || r.eta < 100)));
    const lab = { due: 'due', overdue: 'OVERDUE', doing: 'working', idle: '', active: 'by shift end', pending: '', done: 'done', missed: 'missed', delegated: 'delegated', enroute: 'en route', needs: 'needs part' };   // enroute / needs: crew repairs (js/repair.js rows)
    this.boardEl.innerHTML = `<div class="t">Duty board</div>` + rows.slice(0, this.big ? 30 : 7).map(r => `<div class="bd-row ${r.status}"><span></span><span>${esc(r.label.length > 38 ? r.label.slice(0, 36) + '…' : r.label)}${r.status === 'idle' || r.status === 'pending' ? ` <small style="opacity:.55">${r.kind === 'duty' ? 'in ' + r.eta + 's' : 'at ' + Math.floor(r.eta / 60) + 'm'}</small>` : ''}<small style="opacity:.55"> · ${esc(r.room)}</small></span><i>${lab[r.status]}</i>${r.total ? `<div class="bar"><b style="width:${(1 - r.left / r.total) * 100}%"></b></div>` : ''}</div>`).join('');
  }
  setHint(t) { if (!this.hintEl) return; this.hintEl.textContent = t || ''; this.hintEl.style.display = t ? 'block' : 'none'; }
  showEnd(html, actions) {
    this.endEl.innerHTML = `<div class="card">${html}<div class="acts"></div></div>`; const a = this.endEl.querySelector('.acts');
    for (const x of actions) { const b = document.createElement('button'); b.textContent = x.label; b.onclick = () => { this.endEl.classList.remove('show'); x.run(); }; a.appendChild(b); }
    this.endEl.classList.add('show');
  }
  hideEnd() { this.endEl?.classList.remove('show'); }
}
export { QUALITIES, Q_LABEL };
