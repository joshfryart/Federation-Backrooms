// HUD for the player's billet (Systems Nominal): briefing screen, compact duty HUD (clock rings + task pips), the full
// duty board panel (tap J: swim lanes on a watch-long axis, click a block for exactly that block's verbs), the generic
// list menu (#bd-menu: talk / terminal / legacy duty lists, now clickable) and the end-of-run summary.
// DOM only; injects its own markup + CSS. Menus and the board are UI layers (js/ui-mode.js): opening one frees the
// cursor and pauses the world; Esc pops exactly one layer (one menu level), Backspace goes back.
// Keys (routed by js/menus.js): tap J board, hold J duty wheel; B cycles the compact HUD (rings / rings + labels / off).
// Repair-crew rows (js/repair.js via duty.repairRows: status doing / needs / enroute) show as their own lane + HUD pips.
import { Q_LABEL, QUALITIES, SHIP_SEC_PER_MIN } from './duty.js';
import { iconSvg, hasIcon } from './icons.js';
import { UIHUB } from './ui-mode.js';

const CSS = `
#bd-brief{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.9);font:14px/1.45 'Helvetica Neue',Arial,sans-serif;color:#e6eef7}
#bd-brief.show{display:flex}#bd-brief .card{width:min(720px,94vw);max-height:92vh;overflow:auto;border:1px solid rgba(150,180,210,.3);border-top:3px solid var(--lc1,#f2a03d);padding:22px 26px;background:rgba(8,12,20,.96)}
#bd-brief h2{margin:0 0 2px;font:800 24px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:var(--lc4,#ffd9a0)}#bd-brief .sub{opacity:.65;margin-bottom:12px}
#bd-brief h4{margin:14px 0 4px;font:700 11px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d)}#bd-brief ul{margin:0;padding-left:18px}#bd-brief li{margin:2px 0}
#bd-brief button{margin-top:18px;padding:10px 26px;font:800 15px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;background:var(--lc1,#f2a03d);color:#08101a;border:0;cursor:pointer}
#bd-board{position:fixed;left:14px;top:92px;z-index:5;pointer-events:none;font:12px/1.3 'Helvetica Neue',Arial,sans-serif;color:#e6eef7;text-shadow:0 1px 2px #000}
#bd-board.off{display:none}
.dhud{display:inline-flex;flex-direction:column;padding:5px 9px 7px;background:rgba(5,8,14,.62);border-left:3px solid var(--lc1,#f2a03d);clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%)}
.dhud .t{font:700 9px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d);margin-bottom:3px;display:flex;gap:8px}.dhud .t em{font:9px var(--f-m,monospace);font-style:normal;color:#8fa0b6;letter-spacing:0}
.rings{display:flex;gap:6px}.rg{--c:#7e8ea6;position:relative;width:44px;text-align:center}
.rg svg.r{width:40px;height:40px;display:block;margin:0 auto;transform:rotate(-90deg)}.rg .tr{fill:rgba(5,8,14,.7);stroke:#1f2b3d;stroke-width:4}.rg .pg{fill:none;stroke:var(--c);stroke-width:4}
.rg .ic{position:absolute;left:0;right:0;top:10px;display:grid;place-items:center;color:var(--c)}.rg .ic .ico{width:18px;height:18px}
.rg small{display:block;font:700 9px var(--f-m,monospace);color:var(--c);margin-top:1px}.rg .lb{display:block;font:9px var(--f-d,Arial);letter-spacing:.04em;color:#cfe0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56px;margin:0 -6px}
.rg.s-due{--c:#ffb347}.rg.s-overdue{--c:#ff5a4a}.rg.s-doing{--c:#8fd8ff}.rg.s-done{--c:#4fd18b}.rg.s-delegated{--c:#b79cff}.rg.s-pending{--c:#7e8ea6}.rg.s-rushed{--c:#c8d94a}.rg.s-faked{--c:#d38bff}.rg.s-skipped,.rg.s-missed{--c:#6b7586}
.rg.pin{outline:1.5px solid var(--m-route,#8ef3ff);outline-offset:1px;border-radius:6px}.rg.pin.late{outline-color:#ff5a4a}
.rg.s-overdue svg.r{animation:bdpulse 1s ease-in-out infinite}.rg.s-due svg.r{animation:bdpulse 1.8s ease-in-out infinite}
@keyframes bdpulse{50%{filter:drop-shadow(0 0 5px var(--c))}}body.reduce-motion .rg svg.r{animation:none!important}@media (prefers-reduced-motion:reduce){.rg svg.r{animation:none!important}}
.pipsrow{display:flex;gap:4px;align-items:center;margin-top:5px;font:9px var(--f-m,monospace);color:#8fa0b6}
.pipsrow i{width:8px;height:8px;border:1.5px solid #7e8ea6;transform:rotate(45deg);display:inline-block}.pipsrow i.d{background:#4fd18b;border-color:#4fd18b}.pipsrow i.a{border-color:#ffb347;background:#ffb347}.pipsrow i.m{border-color:#ff5a4a;background:#ff5a4a}
.pipsrow .ico{width:12px;height:12px;color:#ffb347}.pipsrow .rp{display:inline-flex;align-items:center;gap:2px;color:#8fd8ff}.pipsrow .rp.needs{color:#ff7a6b}
#bd-menu{position:fixed;left:50%;bottom:20%;transform:translateX(-50%);z-index:9;display:none;min-width:min(420px,90vw);background:rgba(4,7,13,.94);border:1px solid rgba(150,180,210,.3);border-top:3px solid var(--lc1,#f2a03d);padding:12px 16px;font:13px/1.5 'Helvetica Neue',Arial,sans-serif;color:#e6eef7}
#bd-menu.show{display:block}#bd-menu h3{margin:0 0 6px;font:700 12px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;color:var(--lc4,#ffd9a0);display:flex;gap:8px;align-items:center}#bd-menu h3 img{width:28px;height:28px;border:1px solid #345}
#bd-menu .o{cursor:pointer;padding:1px 4px;display:flex;gap:6px;align-items:center}#bd-menu .o:hover{background:rgba(242,160,61,.14)}#bd-menu .o b{display:inline-block;min-width:18px;color:var(--lc1,#f2a03d)}#bd-menu .o.off{opacity:.45}#bd-menu .o img{width:22px;height:22px}#bd-menu .o .ico{width:16px;height:16px;color:#9fd0ee}#bd-menu .hint{font-size:11px;opacity:.55;margin-top:6px}
#bd-hint{position:fixed;left:50%;bottom:15%;transform:translateX(-50%);z-index:5;pointer-events:none;font:700 12px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;color:#ffe9a8;background:rgba(5,8,14,.7);padding:4px 12px;display:none;align-items:center;gap:6px}#bd-hint .ico{width:16px;height:16px}
#bd-end{position:fixed;inset:0;z-index:21;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.92);font:14px/1.45 'Helvetica Neue',Arial,sans-serif;color:#e6eef7}#bd-end.show{display:flex}
#bd-end .card{width:min(720px,94vw);max-height:92vh;overflow:auto;border:1px solid rgba(150,180,210,.3);border-top:3px solid #ff5a4a;padding:22px 26px;background:rgba(8,12,20,.97)}
#bd-end h2{margin:0 0 6px;font:800 24px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:#ff8a7a}#bd-end h4{margin:14px 0 4px;font:700 11px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc1,#f2a03d)}
#bd-end .c{padding:3px 0 3px 12px;border-left:2px solid #567;margin:2px 0;font-size:13px}#bd-end button{margin:14px 10px 0 0;padding:9px 18px;font:700 13px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;background:#1b2a3c;color:#e6eef7;border:1px solid #567;cursor:pointer}#bd-end button:hover{background:var(--lc1,#f2a03d);color:#08101a}
#bd-panel{position:fixed;inset:5% 3% 6% 3%;z-index:10;display:none;flex-direction:column;background:rgba(7,11,19,.985);border:1px solid rgba(150,180,210,.26);border-top:3px solid var(--lc1,#f2a03d);font:12px/1.35 'Helvetica Neue',Arial,sans-serif;color:#e8eef6}
#bd-panel.show{display:flex}#bd-panel .ph{display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid rgba(150,180,210,.26)}#bd-panel .ph h3{margin:0;font:700 13px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:#ffd9a0}
#bd-panel .x{margin-left:auto;background:none;border:1px solid rgba(150,180,210,.26);padding:1px 8px;font:11px var(--f-m,monospace);color:#8fa0b6;cursor:pointer}
#bd-panel .pb{position:relative;overflow:auto;padding:10px 12px;flex:1}#bd-panel .ico{width:1.3em;height:1.3em;vertical-align:-.3em}
.dp-hd{display:flex;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap}.dp-hd img{width:46px;height:46px;border:1px solid rgba(150,180,210,.3)}
.dp-hd b{font:800 15px var(--f-d,Arial);letter-spacing:.1em;text-transform:uppercase;color:#ffd9a0;display:block}.dp-hd small{color:#8fa0b6;font-size:11px}
.dp-sc{margin-left:auto;display:flex;gap:14px;align-items:center}.dp-sc div{text-align:center;font:9px var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;color:#8fa0b6}.dp-sc b{display:block;font:800 18px var(--f-m,monospace);color:#e8eef6;letter-spacing:0}
.lanes{position:relative;display:grid;grid-template-columns:150px 1fr;font-size:11px}
.lanes .lh{padding:3px 6px 3px 0;display:flex;align-items:center;gap:6px;border-top:1px solid rgba(255,255,255,.07);height:34px;overflow:hidden;box-sizing:border-box}
.lanes .lh.grp{height:20px;font:700 9px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;color:var(--lc1,#f2a03d);border-top:1px solid rgba(150,180,210,.26);margin-top:4px}
.lanes .lh>span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.lanes .lh small{overflow:hidden;text-overflow:ellipsis;color:#8fa0b6;display:block;font-size:9px;line-height:1.1;white-space:nowrap}.lanes .lh img{width:24px;height:24px;flex:none;border:1px solid #345}.lanes .lh .ico{flex:none;color:#cfe0f0}
.lanes .ln{position:relative;height:34px;box-sizing:border-box;border-top:1px solid rgba(255,255,255,.07);background:repeating-linear-gradient(90deg,transparent 0 calc(5% - 1px),rgba(255,255,255,.05) calc(5% - 1px) 5%)}
.lanes .ln.grp{height:20px;border-top:1px solid rgba(150,180,210,.26);margin-top:4px;background:none}
.lanes .axis{height:18px;position:relative;font:9px var(--f-m,monospace);color:#8fa0b6}.lanes .axis span{position:absolute;transform:translateX(-50%);top:2px}
.blk{--c:#7e8ea6;position:absolute;top:4px;bottom:4px;display:flex;align-items:center;gap:4px;padding:0 5px;background:color-mix(in srgb,var(--c) 22%,#0a1019);border:1.5px solid var(--c);color:#fff;font:700 10px var(--f-d,Arial);letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-align:left;cursor:pointer;clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,0 100%)}
.blk .ico{width:13px;height:13px;color:var(--c);flex:none}.blk.nar span{display:none}.blk.nar{justify-content:center;padding:0}
.blk:hover,.blk.sel{outline:2px solid #fff;outline-offset:1px;z-index:3}
.blk.s-pending{border-style:dashed}.blk.s-due,.blk.s-active{--c:#ffb347;background:color-mix(in srgb,#ffb347 35%,#0a1019)}.blk.s-overdue,.blk.s-needs{--c:#ff5a4a;background:color-mix(in srgb,#ff5a4a 40%,#0a1019)}
.blk.s-doing,.blk.s-working{--c:#8fd8ff;background:repeating-linear-gradient(135deg,rgba(143,216,255,.3) 0 6px,rgba(143,216,255,.1) 6px 12px)}
.blk.s-done{--c:#4fd18b}.blk.s-rushed{--c:#c8d94a}.blk.s-faked{--c:#d38bff}.blk.s-skipped,.blk.s-missed{--c:#6b7586;border-style:dotted;opacity:.8}.blk.s-delegated{--c:#b79cff}.blk.s-enroute{--c:#8fd8ff;border-style:dashed}
.dp-now{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #ff6b5a;z-index:2;pointer-events:none}.dp-now::before{content:'NOW';position:absolute;top:-1px;left:3px;font:700 8px var(--f-m,monospace);color:#ff6b5a}
.dp-band{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,rgba(255,179,71,.14) 0 6px,rgba(255,179,71,.05) 6px 12px);border-left:1px solid #ffb347;border-right:1px solid #ffb347;pointer-events:none;z-index:1}
.dp-band span{position:absolute;top:1px;left:4px;font:700 8px var(--f-d,Arial);letter-spacing:.14em;color:#ffb347;text-transform:uppercase;display:flex;gap:3px;align-items:center}
.dp-pop{position:absolute;z-index:6;background:#0a111c;border:1px solid var(--lc1,#f2a03d);padding:9px 10px;width:min(340px,92%);box-shadow:0 8px 30px #000a}
.dp-pop h4{margin:0 0 2px;font:700 12px var(--f-d,Arial);letter-spacing:.12em;text-transform:uppercase;color:#ffd9a0}.dp-pop small{color:#8fa0b6;display:block;margin-bottom:6px;font-size:11px}
.dp-pop .row{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}.dp-pop .lbl{font:700 9px var(--f-d,Arial);letter-spacing:.16em;color:var(--lc1,#f2a03d);text-transform:uppercase;margin:4px 0 3px}
.dp-pop .x{float:right;background:none;border:1px solid rgba(150,180,210,.26);font:10px var(--f-m,monospace);padding:0 6px;color:#8fa0b6;cursor:pointer}
.act{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:62px;padding:5px 8px;background:rgba(255,255,255,.05);border:1px solid rgba(150,180,210,.26);color:#e8eef6;font:9px var(--f-d,Arial);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.act .ico{width:22px;height:22px}.act:hover{border-color:var(--lc1,#f2a03d);background:rgba(242,160,61,.14)}.act.off{opacity:.4;pointer-events:none}.act img{width:26px;height:26px}.act em{font-style:normal;opacity:.6;letter-spacing:0;text-transform:none}
.dp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font:9px var(--f-d,Arial);letter-spacing:.08em;text-transform:uppercase;color:#8fa0b6}.dp-legend span{display:flex;align-items:center;gap:5px}.dp-legend i{width:20px;height:10px;border:1.5px solid var(--c);background:color-mix(in srgb,var(--c) 25%,transparent)}
`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (n, o) => iconSvg(n, o);
const SYS_ICON = { hydro: 'arboretum', computer: 'datacore', transport: 'transporter', lifts: 'lift', replicators: 'replicator', alert: 'red' };
/** icon for a duty loop / task: its ship system, else a verb guessed from the label, else its room */
export function loopIcon(l) {
  const s = SYS_ICON[l.sys] || l.sys; if (s && hasIcon(s)) return s;
  const lab = (l.label || l.task || '').toLowerCase();
  for (const [re, n] of [[/log|record|report/, 'log'], [/patrol|walk|round/, 'patrol'], [/scan|survey/, 'scan'], [/calib|align|tune/, 'calib'], [/clean|mop|wash/, 'clean'], [/restock|stock|inventory/, 'restock'], [/deliver|carry|haul/, 'deliver'], [/repair|fix|maint/, 'repair'], [/inspect|check/, 'inspect']]) if (re.test(lab)) return n;
  return hasIcon(l.room) ? l.room : 'duty';
}
const STC = { pending: '#7e8ea6', due: '#ffb347', overdue: '#ff5a4a', doing: '#8fd8ff', done: '#4fd18b', rushed: '#c8d94a', faked: '#d38bff', skipped: '#6b7586', delegated: '#b79cff' };
const Q2ST = { proper: 'done', rushed: 'rushed', faked: 'faked', skipped: 'skipped', missed: 'missed' };
const ST_ICON = { done: 'check', rushed: 'rush', faked: 'fake', skipped: 'skip', missed: 'x', delegated: 'delegate', doing: 'clock', working: 'person', due: 'clock', overdue: 'alert', pending: 'clock', active: 'clock', needs: 'box', enroute: 'patrol' };
const fmtLeft = (s) => s >= 60 ? Math.ceil(s / 60) + 'm' : Math.max(0, Math.ceil(s)) + 's';
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/** display state of a loop right now */
export function loopState(D, l) {
  if (l.state === 'doing') return 'doing'; if (l.state === 'delegated') return 'delegated';
  if (l.state === 'due') return D.status ? D.status(l) : (D.t - l.dueAt > 60 ? 'overdue' : 'due');
  const e = D.entries.length && D.entries[D.entries.length - 1]?.loop === l.id ? D.entries[D.entries.length - 1] : [...D.entries].reverse().find(x => x.loop === l.id);
  if (e && D.t - e.t < 8 && !e.by) return Q2ST[e.q] || 'done';
  return 'pending';
}
/** one clock ring's numbers: { st, frac, txt } */
export function ringFor(D, l) {
  const st = loopState(D, l), per = l.period || 120;
  if (st === 'pending') { const left = l.next - D.t; return { st, frac: Math.max(0, Math.min(1, 1 - left / per)), txt: fmtLeft(left) }; }
  if (st === 'due') { const win = per * 0.9; return { st, frac: Math.max(0, Math.min(1, 1 - (D.t - l.dueAt) / win)), txt: fmtLeft(win - (D.t - l.dueAt)) }; }
  if (st === 'overdue') return { st, frac: 1, txt: '!' };
  if (st === 'doing') { const b = D.busy; return { st, frac: b ? Math.max(0, Math.min(1, 1 - b.left / (b.total || 1))) : 0.5, txt: '…' }; }
  if (st === 'delegated') { const j = D.jobs.find(x => x.delegateOf === l.id); return { st, frac: 0.6, txt: j ? (j.person.family || j.person.short || '').slice(0, 3) : '…' }; }
  return { st, frac: 1, txt: st === 'done' ? '✓' : st === 'missed' ? '✗' : '·' };
}

export class DutyHUD {
  constructor(o = {}) {
    this.o = o; this.duty = null; this.menuStack = []; this.big = false; this.hudMode = 0; this.pop = null;
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const mk = (id, html = '', cls = '') => { document.getElementById(id)?.remove(); const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; d.innerHTML = html; document.body.appendChild(d); return d; };
    this.brief = mk('bd-brief'); this.boardEl = mk('bd-board'); this.menuEl = mk('bd-menu', '', 'ui-layer'); this.hintEl = mk('bd-hint'); this.endEl = mk('bd-end'); this.panelEl = mk('bd-panel', '', 'ui-layer');
    this.panelEl.setAttribute('role', 'dialog'); this.panelEl.setAttribute('aria-label', 'Duty board');
    this.menuEl.addEventListener('mousedown', (e) => { e.stopPropagation(); const r = e.target.closest('.o'); if (r) this.choose(+r.dataset.i); });
    this.panelEl.addEventListener('mousedown', (e) => { e.stopPropagation(); this.panelClick(e); });
    this.key = (e) => this.onKey(e); addEventListener('keydown', this.key, true);
  }
  get ui() { return this.o.ui || UIHUB.ui; }
  get PT() { return this.o.portraits || UIHUB.portraits; }
  destroy() { if (typeof document === 'undefined') return; removeEventListener('keydown', this.key, true); if (this.menuOpen) this.closeMenu(); if (this.boardOpen) this.closeBoard(); for (const e of [this.brief, this.boardEl, this.menuEl, this.hintEl, this.endEl, this.panelEl]) e.remove(); }
  attach(duty) { this.duty = duty; this.closeMenu(); this.closeBoard(); this.endEl?.classList.remove('show'); }
  get menuOpen() { return !!this.menuEl && this.menuEl.classList.contains('show'); }
  get boardOpen() { return !!this.panelEl && this.panelEl.classList.contains('show'); }
  showBriefing(b, onBegin) {
    this.brief.innerHTML = `<div class="card"><h2>${esc(b.rank)} ${esc(b.name.replace(/^\S+\s/, ''))}</h2><div class="sub">${esc(b.title)} · reports to ${esc(b.boss)}${b.subs ? ` · ${b.subs} under your command` : ''}</div>
      <h4>Mission</h4><div>${esc(b.missionText)}.</div><h4>Your role</h4><div>${esc(b.role)}</div>
      <h4>Your duty rounds</h4><ul>${b.loops.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>Mission tasks</h4><ul>${b.tasks.map(x => `<li>${esc(x)}</li>`).join('') || '<li>None assigned.</li>'}</ul>
      <h4>How you can play it</h4><ul>${b.can.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${b.tempt ? `<h4>Temptation</h4><div>${esc(b.tempt)}</div>` : ''}
      <h4>Keys</h4><div>Hold Q quick wheel · J duty board (hold: duty wheel) · H radio (hold: radio wheel) · V tools · 1-9 belt · K alerts · L comm log · P pause</div><button id="bd-go">Begin watch</button></div>`;
    this.brief.classList.add('show'); const go = () => { this.brief.classList.remove('show'); onBegin?.(); };
    this.brief.querySelector('#bd-go').onclick = go; this._brGo = go;
  }
  get briefing() { return !!this.brief && this.brief.classList.contains('show'); }

  // ---- generic list menu (talk / terminal / legacy duty lists): one UI layer; Esc / Backspace pop one level
  openMenu(title, opts, hint = '', o = {}) {
    const first = !this.menuStack.length; this.menuStack.push({ title, opts, hint, person: o.person || null }); this.renderMenu();
    if (first) this.ui?.open('menu', { close: () => this.closeMenu(true), back: () => { this.back(true); return this.menuOpen; }, key: (e) => this.menuKey(e) });
  }
  closeMenu(fromUI = false) { const was = this.menuOpen || this.menuStack.length; this.menuStack = []; this.menuEl?.classList.remove('show'); if (typeof document !== 'undefined') document.body.classList.remove('bd-menu-open'); if (was && !fromUI) this.ui?.closed('menu'); }
  back(fromUI = false) { this.menuStack.pop(); if (this.menuStack.length) this.renderMenu(); else this.closeMenu(fromUI); }
  renderMenu() {
    const m = this.menuStack[this.menuStack.length - 1]; if (!m || !this.menuEl) return;
    const face = m.person && this.PT ? this.PT.img(m.person, 28, 'mp') : '';
    this.menuEl.innerHTML = `<h3>${face}${esc(m.title)}</h3>` + m.opts.map((o, i) => `<div class="o${o.off ? ' off' : ''}" data-i="${i}"><b>${i + 1}</b>${o.person && this.PT ? this.PT.img(o.person, 22, 'op') : o.icon ? ico(o.icon) : ''}<span>${esc(o.label)}${o.note ? ` <small style="opacity:.6">— ${esc(o.note)}</small>` : ''}</span></div>`).join('') + `<div class="hint">${esc(m.hint || 'digit or click · Backspace back · Esc closes')}</div>`;
    this.menuEl.classList.add('show'); document.body.classList.add('bd-menu-open');
  }
  choose(i) { const m = this.menuStack[this.menuStack.length - 1], o = m?.opts[i]; if (!o || o.off) return false; if (o.keepOpen) o.run?.(); else { this.closeMenu(); o.run?.(); } return true; }
  menuKey(e) { const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code); if (d) { this.choose(+d[1] - 1); return true; } return false; }
  onKey(e) {
    if (this.briefing) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); this._brGo?.(); } return; }
    const ph = this.o.getPhase?.(); if (ph !== 'play') { if (ph !== 'paused') { if (this.menuOpen) this.closeMenu(); if (this.boardOpen) this.closeBoard(); } return; }
    if (this.ui) return;   // js/menus.js routes keys to the UI layers (J / B / digits / Esc / Backspace)
    if (this.menuOpen) {   // fallback without the UI router: the old behaviour
      if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); }
      else if (this.menuKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyJ') { e.stopImmediatePropagation(); this.o.onMenu?.(); } else if (e.code === 'KeyB') this.cycleHud();
  }
  cycleHud() { this.hudMode = (this.hudMode + 1) % 3; this.big = this.hudMode === 1; this.renderBoard(); }

  // ---- compact HUD (called each frame by main; also refreshed while the world is paused)
  update(dt) {
    if (!this.duty || !this.boardEl) return; this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 0.25; this.renderBoard();
    if (this.boardOpen && !this.pop && (this._pt = (this._pt || 0) - 0.25) <= 0) { this._pt = 1; this.renderPanel(); }
  }
  repairs() { try { return this.duty?.repairRows?.() || []; } catch { return []; } }
  renderBoard() {
    const D = this.duty; if (!D || !this.boardEl) return;
    this.boardEl.classList.toggle('off', this.hudMode === 2); if (this.hudMode === 2) return;
    const C = 2 * Math.PI * 16, rings = D.loops.map(l => { const r = ringFor(D, l), ni = UIHUB.nav?.ringInfo?.(l.id) || {}, na = ni.notch != null ? 2 * Math.PI * ni.notch : null;
      const notch = na != null ? `<line x1="${(20 + Math.cos(na) * 12).toFixed(1)}" y1="${(20 + Math.sin(na) * 12).toFixed(1)}" x2="${(20 + Math.cos(na) * 20).toFixed(1)}" y2="${(20 + Math.sin(na) * 20).toFixed(1)}" stroke="${ni.late ? '#ff5a4a' : '#fff'}" stroke-width="2.4"/>` : '';
      return `<div class="rg s-${r.st}${ni.pinned ? ' pin' : ''}${ni.late ? ' late' : ''}" title="${esc(l.label)} · ${r.st}${ni.pinned ? ' · guided' + (ni.late ? ' (ETA past the window)' : '') : ''}"><svg class="r" viewBox="0 0 40 40"><circle class="tr" cx="20" cy="20" r="16"/><circle class="pg" cx="20" cy="20" r="16" stroke-dasharray="${(C * r.frac).toFixed(1)} ${C.toFixed(1)}"/>${notch}</svg><span class="ic">${ico(loopIcon(l))}</span><small>${esc(r.txt)}</small>${this.big ? `<span class="lb">${esc(l.label)}</span>` : ''}</div>`; }).join('');
    const pips = D.tasks.map(t => `<i class="${t.state === 'done' ? 'd' : t.state === 'missed' ? 'm' : t.state === 'active' ? 'a' : ''}" title="${esc(t.task)}"></i>`).join('');
    const rep = this.repairs().map(r => `<span class="rp ${r.status}" title="${esc(r.label)} · ${r.status}">${ico(r.status === 'needs' ? 'box' : 'repair')}</span>`).join('');
    const alert = UIHUB.menus?.alertTop?.();
    this.boardEl.innerHTML = `<div class="dhud"><div class="t">Duty <em>${mmss(D.t)}${D.shiftLen ? ' / ' + mmss(D.shiftLen) : ''}</em></div><div class="rings">${rings}</div><div class="pipsrow">${pips}${D.tasks.length ? `<span>&nbsp;${D.tasks.filter(t => t.state === 'done').length}/${D.tasks.length}</span>` : ''}${rep}${alert ? `<span style="color:${alert.colour || '#ffb347'}">${ico('alert')}</span>` : ''}</div></div>`;
  }
  setHint(t, icon = null) { if (!this.hintEl) return; this.hintEl.innerHTML = t ? (icon ? ico(icon) : '') + `<span>${esc(t)}</span>` : ''; this.hintEl.style.display = t ? 'flex' : 'none'; }

  // ---- full board panel (tap J): swim lanes
  openBoard() { if (!this.duty || !this.panelEl) return; this.pop = null; this.panelEl.classList.add('show'); this.renderPanel(); this.ui?.open('board', { close: () => this.closeBoard(true), back: () => { if (this.pop) { this.pop = null; this.renderPanel(); return true; } this.closeBoard(true); return false; }, key: (e) => this.boardKey(e), toggle: 'KeyJ' }); }
  closeBoard(fromUI = false) { if (!this.panelEl) return; const was = this.boardOpen; this.panelEl.classList.remove('show'); this.pop = null; if (was && !fromUI) this.ui?.closed('board'); }
  toggleBoard() { if (this.boardOpen) this.closeBoard(); else this.openBoard(); }
  boardKey(e) { if (this.pop && /^(?:Digit|Numpad)(\d)$/.test(e.code)) { const b = this.panelEl.querySelectorAll('.dp-pop .act:not(.off)')[+e.code.slice(-1) - 1]; if (b) { this.act(b.dataset.do, b.dataset.k); return true; } } return false; }
  /** model of the swim lanes (tests read it): { t0, t1, now, lanes:[{ kind, id, label, icon, sub, person, blocks:[{ k, a, b, st, label, ref }] }], band } */
  timeline() {
    const D = this.duty, now = D.t, end = D.shiftLen || 1200, t1 = Math.max(end, Math.ceil((now + 120) / 300) * 300), t0 = 0, lanes = [];
    const dur = (l) => Math.max(8, (l.dur || 2) * SHIP_SEC_PER_MIN * 1.2 * (D.pace?.performMul ?? 1));
    for (const l of D.loops) {
      const blocks = [], st = loopState(D, l), per = l.period || 120;
      D.entries.forEach((e, i) => { if (e.loop === l.id) blocks.push({ k: `${l.id}#e${i}`, a: e.t - dur(l), b: e.t, st: e.by ? 'delegated' : Q2ST[e.q] || 'done', label: e.by ? e.by : l.label, ref: { loop: l.id, entry: i, q: e.q } }); });
      if (st === 'due' || st === 'overdue') blocks.push({ k: `${l.id}#now`, a: l.dueAt, b: Math.max(now + 4, l.dueAt + dur(l)), st, label: l.label, ref: { loop: l.id, live: true } });
      else if (st === 'doing') blocks.push({ k: `${l.id}#now`, a: now - (D.busy ? D.busy.total - D.busy.left : 0), b: now + (D.busy?.left || 5), st, label: l.label, ref: { loop: l.id, live: true } });
      else if (st === 'delegated') { const j = D.jobs.find(x => x.delegateOf === l.id); blocks.push({ k: `${l.id}#now`, a: now, b: now + (j?.left || 20), st, label: j ? j.person.short : l.label, ref: { loop: l.id, live: true } }); }
      for (let t = l.state === 'idle' ? l.next : now + per, n = 0; t < t1 && n < 12; t += per, n++) blocks.push({ k: `${l.id}#f${n}`, a: t, b: t + dur(l), st: 'pending', label: l.label, ref: { loop: l.id, future: n, live: n === 0 && l.state === 'idle' } });
      lanes.push({ kind: 'loop', id: l.id, label: l.label, icon: loopIcon(l), sub: `${l.room} · every ${fmtLeft(per)}`, blocks });
    }
    if (D.tasks.length) lanes.push({ kind: 'tasks', id: 'tasks', label: 'Tasks', icon: 'mission', sub: `${D.tasks.filter(t => t.state === 'done').length}/${D.tasks.length} · by shift end`, blocks: D.tasks.map(t => ({ k: `task#${t.id}`, a: t.at_s, b: Math.max(t.at_s + 30, end), st: t.state === 'pending' ? 'pending' : t.state === 'active' ? (end - now < 120 ? 'overdue' : 'active') : t.state === 'done' ? Q2ST[t.by] || 'done' : 'missed', label: t.task, ref: { task: t.id } })) });
    const reps = this.repairs(); if (reps.length) lanes.push({ kind: 'repair', id: 'repairs', label: 'Repairs', icon: 'repair', sub: `${reps.length} crew job${reps.length > 1 ? 's' : ''}`, blocks: reps.map((r, i) => ({ k: `rep#${r.id || i}`, a: now - 6, b: now + Math.max(20, r.left || 40), st: r.status === 'doing' ? 'working' : r.status, label: r.label, ref: { repair: r.id, person: r.who } })) });
    for (const p of D.subs().slice(0, 4)) {
      const blocks = D.jobs.filter(j => j.person === p).map((j, i) => ({ k: `p${p.id}#j${i}`, a: now - 4, b: now + j.left, st: j.delegateOf ? 'delegated' : 'working', label: j.loop.label, ref: { person: p.id } }));
      D.entries.forEach((e, i) => { if (e.by === p.short) blocks.push({ k: `p${p.id}#e${i}`, a: e.t - 20, b: e.t, st: Q2ST[e.q] || 'done', label: e.label, ref: { person: p.id } }); });
      lanes.push({ kind: 'crew', id: 'p' + p.id, label: p.short, person: p, sub: p.title, blocks });
    }
    const al = UIHUB.menus?.alertTop?.(); const band = al ? { a: Math.max(0, now - (al.elapsed || 0)), b: now, label: al.label, colour: al.colour } : null;
    return { t0, t1, now, lanes, band, end };
  }
  renderPanel() {
    const D = this.duty; if (!D || !this.panelEl) return;
    const TL = this.timeline(), span = TL.t1 - TL.t0, pct = (t) => ((t - TL.t0) / span * 100), me = D.player, PT = this.PT, sm = D.summary();
    const boss = me.reportsTo != null ? D.roster.people[me.reportsTo] : null;
    const ax = Array.from({ length: Math.floor(span / 120) + 1 }, (_, k) => `<span style="left:${pct(k * 120)}%">${k * 2}m</span>`).join('');
    const band = (h) => TL.band ? `<div class="dp-band" style="left:${pct(TL.band.a)}%;width:${Math.max(0.4, pct(TL.band.b) - pct(TL.band.a))}%;border-color:${TL.band.colour || '#ffb347'}">${h ? `<span>${ico('alert')}${esc(TL.band.label)}</span>` : ''}</div>` : '';
    const blk = (b) => { const a = Math.max(TL.t0, b.a), w = pct(Math.min(TL.t1, b.b)) - pct(a), l = pct(a); return `<button class="blk s-${b.st}${w < 6 ? ' nar' : ''}${this.pop === b.k ? ' sel' : ''}" data-k="${esc(b.k)}" style="left:${l.toFixed(2)}%;width:${Math.max(w, 2.4).toFixed(2)}%" title="${esc(b.label + ' · ' + b.st)}">${ico(ST_ICON[b.st] || 'clock')}<span>${esc(b.label)}</span></button>`; };
    const GRP = { loop: 'Your rounds', tasks: 'Mission tasks', repair: 'Ship repairs', crew: 'Your crew' }, rows = []; let grp = '';
    for (const L of TL.lanes) {
      const g = GRP[L.kind]; if (g !== grp) { grp = g; rows.push(`<div class="lh grp">${g}</div><div class="ln grp">${L.kind === 'loop' ? band(1) : ''}</div>`); }
      const head = L.person && PT ? PT.img(L.person, 24, 'lp') : ico(L.icon);
      rows.push(`<div class="lh">${head}<span>${esc(L.label)}<small>${esc(L.sub || '')}</small></span></div><div class="ln">${band(0)}${L.blocks.filter(b => b.b > TL.t0 && b.a < TL.t1).map(blk).join('')}</div>`);
    }
    const legend = Object.entries({ pending: 'Later', due: 'Due now', overdue: 'Overdue', doing: 'Working', done: 'Done properly', rushed: 'Rushed', faked: 'Log faked', skipped: 'Skipped', delegated: 'Delegated' }).map(([s, t]) => `<span style="--c:${STC[s]}"><i></i>${ico(ST_ICON[s])}${t}</span>`).join('');
    this.panelEl.innerHTML = `<div class="ph">${ico('duty')}<h3>Duty board</h3><button class="x" data-x>J / Esc</button></div><div class="pb">
      <div class="dp-hd">${PT ? PT.img(me, 46, 'mep') : ''}<div><b>${esc(me.short)} · ${esc(me.title)}</b><small>reports to ${esc(boss?.short || 'the captain')} · ${D.subs().length} under your command</small></div>
      <div class="dp-sc"><div><b>${sm.score}%</b>duty</div><div><b>${Math.round(sm.trust * 100)}%</b>crew trust</div><div><b>${mmss(D.t)}</b>of ${mmss(TL.end)}</div></div></div>
      <div class="lanes"><div></div><div class="axis">${ax}</div>${rows.join('')}<div class="dp-area" style="position:absolute;left:150px;right:0;top:18px;bottom:0;pointer-events:none"><div class="dp-now" style="left:${pct(TL.now)}%"></div><div class="dp-now" style="left:${pct(TL.end)}%;border-color:#8fa0b6;opacity:.6"></div></div></div>
      <div class="dp-legend">${legend}</div><div class="dp-popwrap"></div></div>`;
    this._tl = TL; if (this.pop) this.showPop(this.pop);
  }
  findBlock(k) { if (!this._tl && this.duty) this._tl = this.timeline(); for (const L of this._tl?.lanes || []) for (const b of L.blocks) if (b.k === k) return { L, b }; return null; }
  showPop(k) {
    const f = this.findBlock(k), wrap = this.panelEl.querySelector('.dp-popwrap'), el = [...this.panelEl.querySelectorAll('.blk')].find(x => x.dataset.k === k); if (!f || !wrap) { this.pop = null; return; }
    const D = this.duty, { b } = f, PT = this.PT, room = D.place.room;
    const q = (id, icon, t, sub, off = false) => `<button class="act${off ? ' off' : ''}" data-do="${id}" data-k="${esc(k)}">${ico(icon)}${t}<em>${esc(sub)}</em></button>`;
    let title = b.label, small = b.st, body = '';
    if (b.ref.loop) {
      const l = D.loop(b.ref.loop); title = l.label; small = `${l.room} · ${b.st}`;
      const st = b.st, here = l.room === room || l.room === 'any', secs = (qq) => Math.max(2.5, l.dur * SHIP_SEC_PER_MIN * (l.q?.[qq]?.[0] ?? 1) * 1.2 * (D.pace?.performMul ?? 1));
      if (['done', 'rushed', 'faked', 'skipped', 'missed'].includes(st) && b.ref.entry != null) body = `<div class="lbl">Report to the bridge</div><div class="row">${q('rep1', 'report', 'Honest', 'trust +')}${st !== 'done' ? q('rep0', 'fake', '"All fine"', 'risky') : ''}</div>`;
      else if (st === 'delegated') { const j = D.jobs.find(x => x.delegateOf === l.id); body = `<div class="lbl">${j ? esc(j.person.short) + ' has this' : 'Delegated'}</div><div class="row">${q('hail', 'hail', 'Check in', j ? j.person.short : '')}</div>`; }
      else if (b.ref.live || st === 'due' || st === 'overdue' || st === 'doing') {
        body = `<div class="lbl">How will you do it?${here ? '' : ` <span style="color:#ff7a6b">· go to ${esc(l.room)}</span>`}</div><div class="row">${l.room && l.room !== 'any' ? q('pin', 'pin', 'Guide me', l.room) : ''}${QUALITIES.map(qq => q('q:' + qq, { proper: 'proper', rushed: 'rush', faked: 'fake', skipped: 'skip' }[qq], { proper: 'Properly', rushed: 'Rush', faked: 'Fake log', skipped: 'Skip' }[qq], qq === 'skipped' ? '0 s' : qq === 'faked' ? 'risk' : Math.round(secs(qq)) + ' s', !here || st === 'doing')).join('')}</div>`;
        const subs = D.subs().slice(0, 6); if (subs.length && st !== 'doing') body += `<div class="lbl">Or delegate to</div><div class="row">${subs.map(p => `<button class="act" data-do="deleg:${p.id}" data-k="${esc(k)}">${PT ? PT.img(p, 26, 'ap') : ico('person')}${esc(p.family || p.short)}<em>${Math.round(D.trust(p) * 100)}%</em></button>`).join('')}</div>`;
      } else body = `<div class="lbl">Later · in ${fmtLeft(b.a - D.t)}</div><div class="row">${q('pin', 'pin', 'Where', l.room)}</div>`;
    } else if (b.ref.task) {
      const t = D.tasks.find(x => x.id === b.ref.task); title = t.task; small = `${t.room} · ${b.st}`;
      if (t.state === 'active') body = `<div class="lbl">Do the task${t.room === room ? '' : ` <span style="color:#ff7a6b">· go to ${esc(t.room)}</span>`}</div><div class="row">${t.room ? q('pin', 'pin', 'Guide me', t.room) : ''}${['proper', 'rushed', 'faked'].map(qq => q('t:' + qq, { proper: 'proper', rushed: 'rush', faked: 'fake' }[qq], { proper: 'Properly', rushed: 'Rush', faked: 'Fake' }[qq], '', t.room !== room)).join('')}</div>`;
      else body = `<div class="lbl">${t.state === 'pending' ? 'Opens in ' + fmtLeft(t.at_s - D.t) : t.state}</div>`;
    } else if (b.ref.person != null) { const p = D.roster.people.find(x => x.id === b.ref.person); title = b.ref.repair ? b.label : p?.short || title; body = `<div class="row">${b.ref.repair ? '' : q('order:' + b.ref.person, 'order', 'Order duty', '')}${q('hailp:' + b.ref.person, 'hail', 'Hail', p?.short || '')}</div>`; }
    const pop = document.createElement('div'); pop.className = 'dp-pop'; pop.innerHTML = `<h4>${esc(title)}</h4><small>${esc(small)} <button class="x" data-popx>close</button></small>${body}`;
    wrap.innerHTML = ''; wrap.appendChild(pop);
    const pb = this.panelEl.querySelector('.pb'), rr = pb.getBoundingClientRect(), br = el ? el.getBoundingClientRect() : rr, pw = Math.min(340, rr.width * 0.92);
    const left = Math.max(6, Math.min(rr.width - pw - 6, br.left - rr.left + br.width / 2 - pw / 2)); let top = br.top - rr.top + pb.scrollTop + br.height + 6;
    if (top + 190 > rr.height + pb.scrollTop) top = Math.max(4, br.top - rr.top + pb.scrollTop - 196);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  panelClick(e) {
    if (e.target.closest('[data-x]')) { this.closeBoard(); return; }
    if (e.target.closest('[data-popx]')) { this.pop = null; this.renderPanel(); return; }
    const a = e.target.closest('[data-do]'); if (a) { this.act(a.dataset.do, a.dataset.k); return; }
    const b = e.target.closest('.blk'); if (b) { this.pop = this.pop === b.dataset.k ? null : b.dataset.k; this.renderPanel(); }
  }
  /** run one popover verb; public so the wheel / tests can drive it */
  act(d, k) {
    const D = this.duty, f = this.findBlock(k), say = (t, c = 'warn') => UIHUB.menus?.say?.(t, c); if (!D) return;
    const lid = f?.b.ref.loop, tid = f?.b.ref.task, who = (id) => D.roster.people.find(x => x.id === id);
    if (d.startsWith('q:') && lid) { const r = D.perform(lid, d.slice(2)); if (!r.ok) say(r.why); else { this.closeBoard(); return; } }
    else if (d.startsWith('t:') && tid) { const r = D.doTask(tid, d.slice(2)); if (!r.ok) say(r.why); else say(`Task ${d.slice(2)}: ${D.tasks.find(t => t.id === tid)?.task}`, 'good'); }
    else if (d.startsWith('deleg:') && lid) { const p = who(+d.slice(6)); const r = p ? D.delegate(p, lid) : { ok: false, why: 'no one' }; if (!r.ok && !r.refused) say(r.why); }
    else if ((d === 'rep1' || d === 'rep0') && lid) D.report(lid, d === 'rep1');
    else if (d.startsWith('order:')) { const p = who(+d.slice(6)); const r = p ? D.order(p, null) : null; if (r && !r.ok && !r.refused) say(r.why); }
    else if (d.startsWith('hailp:') || d === 'hail') { const p = who(d.startsWith('hailp:') ? +d.slice(6) : D.jobs.find(x => x.delegateOf === lid)?.person.id); if (p) UIHUB.menus?.hail?.(p); }
    else if (d === 'pin' && (lid || tid)) { if (!UIHUB.nav?.pinItem(lid ? 'duty' : 'task', lid || tid)) say(`Do this in the ${lid ? D.loop(lid).room : D.tasks.find(t => t.id === tid)?.room}.`, 'comp'); else this.closeBoard(); }
    this.pop = null; this._tl = null; if (this.boardOpen) this.renderPanel();
  }
  showEnd(html, actions) {
    if (this.menuOpen) this.closeMenu(); if (this.boardOpen) this.closeBoard();
    this.endEl.innerHTML = `<div class="card">${html}<div class="acts"></div></div>`; const a = this.endEl.querySelector('.acts');
    for (const x of actions) { const b = document.createElement('button'); b.textContent = x.label; b.onclick = () => { this.endEl.classList.remove('show'); x.run(); }; a.appendChild(b); }
    this.endEl.classList.add('show');
  }
  hideEnd() { this.endEl?.classList.remove('show'); }
}
export { QUALITIES, Q_LABEL };
