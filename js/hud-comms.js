// HUD for ship-wide alerts and bridge comms. DOM only (no three.js); it injects its own markup and CSS, so index.html needs no changes.
//   top-centre: alert banner (stacked, highest severity first) / condition badge when green; PA subtitle line
//   bottom-left: comm traffic stack; K: alert details + legend; L: comm log; H: radio menu (digits choose, Backspace goes back)
//   F4 (debug): raise the next alert type; Shift+F4 clears them all
import { ALERTS, ALERT_ORDER, SEVERITY_NAME, fmtElapsed } from './alerts.js';

const CSS = `
#ac-banner{position:fixed;top:10px;left:50%;transform:translateX(-50%);width:min(560px,92vw);z-index:5;pointer-events:none;display:flex;flex-direction:column;gap:5px;font-family:var(--f-d,Arial,sans-serif);text-transform:none;letter-spacing:.02em}
.ac-card{--c:#ff3b30;--p:1.2s;background:rgba(6,9,16,.82);border:2px solid var(--c);border-left-width:6px;padding:6px 12px 7px;color:#fff;box-shadow:0 0 14px color-mix(in srgb,var(--c) 55%,transparent);animation:ac-pulse var(--p) ease-in-out infinite;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)}
.ac-card.sub{padding:3px 10px;font-size:12px;opacity:.9;animation:none}
.ac-card .h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ac-card .n{color:var(--c);font-weight:800;font-size:19px;letter-spacing:.14em;text-transform:uppercase}
.ac-card.sub .n{font-size:13px}.ac-card .sc{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#cfe}.ac-card .el{margin-left:auto;font-family:var(--f-m,monospace);font-size:12px;color:#ffe9a8}
.ac-card .m{font-size:13px;line-height:1.3;margin-top:2px;color:#eef3fa}.ac-card .w{font-size:11px;opacity:.72;margin-top:2px}
.ac-card .k{font-size:10px;opacity:.6;letter-spacing:.1em;text-transform:uppercase;margin-top:2px}
@keyframes ac-pulse{0%,100%{box-shadow:0 0 6px color-mix(in srgb,var(--c) 35%,transparent);border-color:color-mix(in srgb,var(--c) 45%,#000)}50%{box-shadow:0 0 22px var(--c);border-color:var(--c)}}
@media (prefers-reduced-motion:reduce){.ac-card{animation:none!important}}
body.reduce-motion .ac-card{animation:none!important}
#ac-badge{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:5;pointer-events:none;font:700 11px/1 var(--f-d,Arial,sans-serif);letter-spacing:.2em;text-transform:uppercase;color:#4fd18b;background:rgba(6,12,10,.55);border:1px solid rgba(79,209,139,.45);padding:5px 12px;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);white-space:nowrap}
#ac-badge i{font-style:normal;opacity:.7;margin-left:6px;letter-spacing:.06em;text-transform:none;font-weight:400}
#ac-pa{position:fixed;left:50%;bottom:8%;transform:translateX(-50%);z-index:5;pointer-events:none;max-width:min(720px,90vw);text-align:center;font:600 15px/1.35 'Helvetica Neue',Arial,sans-serif;color:#fff;background:rgba(0,0,0,.6);padding:5px 14px;border-bottom:2px solid #8fd8ff;opacity:0;transition:opacity .35s}
#ac-pa.on{opacity:1}#ac-pa b{color:#8fd8ff;font-size:11px;letter-spacing:.2em;margin-right:8px}
#cm-stack{position:fixed;left:16px;bottom:100px;width:min(360px,70vw);z-index:5;pointer-events:none;display:flex;flex-direction:column;gap:3px;font-family:'Helvetica Neue',Arial,sans-serif;text-transform:none;letter-spacing:0}
.cm-line{--c:#8fd8ff;background:rgba(5,8,14,.7);border-left:3px solid var(--c);padding:3px 8px;font-size:12px;line-height:1.3;color:#eaf1f8;transition:opacity .8s}
.cm-line.p-urgent{--c:#ffb347}.cm-line.p-emergency{--c:#ff5a4a;background:rgba(40,6,6,.72)}
.cm-line .w{display:block;font-size:10px;letter-spacing:.06em;color:var(--c);text-transform:uppercase;opacity:.95}
.cm-line.pa{border-left-width:6px;background:rgba(10,14,28,.78);font-style:italic}.cm-line.pa .w::before{content:'PA ';background:var(--c);color:#06090f;padding:0 4px;margin-right:4px;font-style:normal;font-weight:700}
.cm-line.fade{opacity:0}
.ac-panel{position:fixed;z-index:8;pointer-events:none;background:rgba(4,7,13,.93);border:1px solid rgba(150,180,210,.3);border-top:3px solid var(--lc1,#f2a03d);padding:14px 18px;overflow:hidden;font:12.5px/1.4 'Helvetica Neue',Arial,sans-serif;text-transform:none;letter-spacing:0;color:#e8eef6;display:none}
.ac-panel.show{display:block}.ac-panel h3{margin:0 0 8px;font:700 14px var(--f-d,Arial);letter-spacing:.2em;text-transform:uppercase;color:var(--lc4,#ffd9a0)}.ac-panel h4{margin:12px 0 5px;font:700 11px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;color:var(--lc2,#58c9b9)}
.ac-panel .hint{opacity:.55;font-size:11px;margin-top:8px}
#ac-details{top:178px;left:50%;transform:translateX(-50%);width:min(760px,94vw);max-height:calc(100vh - 200px)}
.ad{border-left:5px solid var(--c);padding:6px 10px;margin:0 0 7px;background:rgba(255,255,255,.04)}.ad b{color:var(--c);letter-spacing:.12em;text-transform:uppercase}.ad p{margin:3px 0}.ad .do{color:#cdeccf}.ad small{opacity:.65}
.lg{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 12px}.lg div{display:grid;grid-template-columns:12px 1fr auto;gap:6px;align-items:center;font-size:11.5px}.lg i{width:12px;height:12px;background:var(--c)}.lg em{opacity:.55;font-style:normal;font-size:10px}
#cm-log{top:56px;right:14px;width:min(620px,94vw);bottom:20px}
#cm-log .rows{max-height:calc(100% - 56px);overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
.lr{display:grid;grid-template-columns:42px 38px 1fr;gap:6px;padding:2px 0;border-top:1px solid rgba(255,255,255,.06);font-size:12px}.lr time{font-family:var(--f-m,monospace);opacity:.55;font-size:11px}.lr .ch{font-size:10px;letter-spacing:.08em;opacity:.8;color:#8fd8ff}
.lr .w{color:#9fd0ee;font-size:11px}.lr.p-urgent .w{color:#ffb347}.lr.p-emergency .w{color:#ff7a6a}.lr.pa{background:rgba(143,216,255,.07);font-style:italic}.lr.pa .ch{color:#06090f;background:#8fd8ff;text-align:center;font-style:normal;font-weight:700}
#cm-radio{left:16px;bottom:100px;width:min(340px,80vw)}#cm-radio .opt{padding:3px 0;font-size:13px}#cm-radio .opt b{display:inline-block;min-width:22px;color:var(--lc1,#f2a03d)}
#cm-radio.show~#cm-stack,body.radio-open #cm-stack{display:none}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = (h) => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + String(mm).padStart(2, '0'); };
const who = (p) => !p ? '' : p.system ? esc(p.short) : p.group ? esc(p.short) : `${esc(p.short)} <span style="opacity:.6">· ${esc(p.title)}</span>`;
const PULSE = (sev) => [2, 1.8, 1.4, 1.0, 0.7, 0.5][Math.min(5, sev)] + 's';   // seconds per pulse: faster = more severe
const VISIBLE_PHASES = new Set(['play', 'ride', 'select', 'paused', 'perk']);

export class CommsHUD {
  // opts: { alerts, bus, sim, clock, sound, G, onLighting(on), life: stack line lifetime (s) }
  constructor(o) {
    Object.assign(this, { alerts: o.alerts, bus: o.bus, sim: o.sim, clock: o.clock, sound: o.sound, G: o.G, onLighting: o.onLighting || (() => { }) });
    this.t = 0; this.lines = []; this.paT = 0; this.sig = ''; this.elT = 0; this.menu = null; this.panel = null; this.dbg = -1; this.reps = new Map();
    if (!document.getElementById('ac-style')) { const st = document.createElement('style'); st.id = 'ac-style'; st.textContent = CSS; document.head.appendChild(st); }
    const mk = (tag, id, cls = '') => { document.getElementById(id)?.remove(); const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
    this.elBanner = mk('div', 'ac-banner'); this.elBadge = mk('div', 'ac-badge'); this.elPa = mk('div', 'ac-pa'); this.elStack = mk('div', 'cm-stack');
    this.elDetails = mk('div', 'ac-details', 'ac-panel'); this.elLog = mk('div', 'cm-log', 'ac-panel'); this.elRadio = mk('div', 'cm-radio', 'ac-panel');
    for (const e of [this.elBanner, this.elBadge, this.elPa, this.elStack]) e.setAttribute('aria-live', 'polite');
    this.offs = [this.alerts.on('raise', (a) => this.onRaise(a)), this.alerts.on('clear', (a) => this.onClear(a)), this.bus.on('msg', (m) => this.onMsg(m))];
    this._key = (e) => this.onKey(e); addEventListener('keydown', this._key, true);
    this.renderBanner(); this.syncLighting();
  }
  destroy() { removeEventListener('keydown', this._key, true); for (const f of this.offs) f(); for (const e of [this.elBanner, this.elBadge, this.elPa, this.elStack, this.elDetails, this.elLog, this.elRadio]) e.remove(); document.body.classList.remove('radio-open'); this.onLighting(false); }

  // ---- alert events
  onRaise(a) {
    this.renderBanner(); this.syncLighting(); this.tone(a.def.klaxon); this.reps.set(a.id, a.def.severity >= 3 ? 2 : 0);
    this.alertTimer = this.alertTimer || {}; this.alertTimer[a.id] = 7;
    if (this.panel === 'details') this.renderDetails();
  }
  onClear(a) { this.reps.delete(a.id); this.renderBanner(); this.syncLighting(); this.tone('clear'); if (this.panel === 'details') this.renderDetails(); }
  tone(p) { try { this.sound?.alertTone?.(p); } catch { } }
  syncLighting() { this.onLighting(this.alerts.active().some(a => a.def.severity >= 3)); }

  // ---- banner / badge
  renderBanner() {
    const act = this.alerts.active(); this.sig = act.map(a => a.id).join(',');
    this.elBadge.style.display = act.length ? 'none' : '';
    this.elBadge.innerHTML = `Condition green<i>— ${esc(ALERTS.nominal.short)}</i>`;
    this.elBanner.innerHTML = act.slice(0, 3).map((a, i) => {
      const d = a.def, scope = a.scope === 'deck' && a.deck != null ? `Deck ${a.deck + 1}` : a.scope === 'deck' ? 'This deck' : 'Ship-wide', by = a.byPerson ? `Ordered by ${a.byPerson.short}${a.byPerson.title ? ', ' + a.byPerson.title : ''}` : a.source === 'auto' ? 'Automatic: ' + (a.reason || 'ship sensors') : a.source === 'debug' ? 'Debug trigger' : 'Ordered by the bridge';
      return i === 0
        ? `<div class="ac-card" data-id="${a.id}" style="--c:${d.colour};--p:${PULSE(d.severity)}" role="alert"><div class="h"><span class="n">${esc(d.label)}</span><span class="sc">${scope}</span><span class="el" data-el="${a.id}">${fmtElapsed(this.alerts.elapsed(a))}</span></div><div class="m">${esc(d.meaning)}</div><div class="w">${esc(by)}${a.reason && a.source !== 'auto' ? ' · ' + esc(a.reason) : ''}</div><div class="k">[K] what to do · severity ${d.severity} ${SEVERITY_NAME[d.severity]}</div></div>`
        : `<div class="ac-card sub" data-id="${a.id}" style="--c:${d.colour}"><div class="h"><span class="n">${esc(d.label)}</span><span class="sc">${scope}</span><span class="el" data-el="${a.id}">${fmtElapsed(this.alerts.elapsed(a))}</span></div></div>`;
    }).join('') + (act.length > 3 ? `<div class="ac-card sub" style="--c:#999"><div class="h"><span class="n">+${act.length - 3} more</span><span class="sc">[K] details</span></div></div>` : '');
  }
  renderDetails() {
    const act = this.alerts.active(), cond = this.alerts.condition();
    const rows = act.length ? act.map(a => { const d = a.def; return `<div class="ad" style="--c:${d.colour}"><b>${esc(d.label)}</b> <small>${a.scope === 'deck' && a.deck != null ? 'Deck ' + (a.deck + 1) : a.scope === 'deck' ? 'This deck' : 'Ship-wide'} · ${fmtElapsed(this.alerts.elapsed(a))} · ${a.byPerson ? 'ordered by ' + esc(a.byPerson.short) : a.source === 'auto' ? 'automatic: ' + esc(a.reason) : a.source}${a.reason && a.source !== 'auto' ? ' · ' + esc(a.reason) : ''}</small><p>${esc(d.meaning)}</p><p class="do"><b style="color:#9fe3a8">What you should do:</b> ${esc(d.doThis)}</p></div>`; }).join('')
      : `<div class="ad" style="--c:${cond.colour}"><b>${esc(cond.label)}</b><p>${esc(cond.meaning)}</p><p class="do">${esc(cond.doThis)}</p></div>`;
    const legend = ALERT_ORDER.map(id => { const d = ALERTS[id]; return `<div style="--c:${d.colour}" title="${esc(d.meaning)}"><i></i><span>${esc(d.label)} <em>${esc(d.short)}</em></span><em>${d.severity}</em></div>`; }).join('');
    this.elDetails.innerHTML = `<h3>Ship condition: ${esc(cond.label)}</h3>${rows}<h4>All alert types (severity 0-5)</h4><div class="lg">${legend}</div><div class="hint">K or Esc closes · L comm log · H radio</div>`;
  }
  // ---- PA + comm lines
  onMsg(m) {
    if (m.channel === 'pa') { this.elPa.innerHTML = `<b>SHIP PA</b>${esc(m.text)}`; this.elPa.classList.add('on'); this.paT = 3.5 + m.text.length * 0.045; }
    const d = document.createElement('div'); d.className = `cm-line p-${m.priority}${m.channel === 'pa' ? ' pa' : ''}`;
    d.innerHTML = `<span class="w">${who(m.from)}${m.to && !m.to.group && m.channel !== 'pa' ? ` → ${esc(m.to.short)}` : ''}</span>${esc(m.text)}`;
    this.elStack.appendChild(d); this.lines.push({ el: d, age: 0, life: m.priority === 'emergency' ? 14 : m.priority === 'urgent' ? 11 : 8 });
    while (this.lines.length > 6) { this.lines.shift().el.remove(); }
    if (this.panel === 'log') this.renderLog();
  }
  renderLog() {
    const rows = this.bus.log.slice(-60).map(m => `<div class="lr p-${m.priority}${m.channel === 'pa' ? ' pa' : ''}"><time>${hhmm(m.hour)}</time><span class="ch">${m.channel === 'pa' ? 'PA' : m.channel === 'intercom' ? 'INT' : 'COMM'}</span><div><span class="w">${who(m.from)}${m.to && !m.to.group && m.channel !== 'pa' ? ` → ${esc(m.to.short)}` : ''}</span><br>${esc(m.text)}</div></div>`).join('');
    this.elLog.innerHTML = `<h3>Comm log · ship time ${hhmm(this.clock.hour)}</h3><div class="rows">${rows || '<div class="hint">No traffic yet.</div>'}</div><div class="hint">L closes · H radio · K alerts</div>`;
  }
  // ---- radio menu
  renderRadio() {
    const opts = this.sim.playerOptions(this.menu === 'dept' ? 'dept' : 'top');
    this.elRadio.innerHTML = `<h3>Comm badge${this.menu === 'dept' ? ' · department heads' : ''}</h3>${opts.map(o => `<div class="opt"><b>${o.key}</b>${esc(o.label)}</div>`).join('')}<div class="hint">${this.menu === 'dept' ? 'Backspace: back · ' : ''}H or Esc closes</div>`;
  }
  openPanel(name) {
    if (this.panel === name) name = null;
    this.panel = name; this.menu = name === 'radio' ? 'top' : null;
    this.elDetails.classList.toggle('show', name === 'details'); this.elLog.classList.toggle('show', name === 'log'); this.elRadio.classList.toggle('show', name === 'radio');
    document.body.classList.toggle('radio-open', name === 'radio');
    if (name === 'details') this.renderDetails(); if (name === 'log') this.renderLog(); if (name === 'radio') this.renderRadio();
  }
  choose(key) {
    const opt = this.sim.playerOptions(this.menu === 'dept' ? 'dept' : 'top').find(o => o.key === key); if (!opt) return false;
    if (opt.id === 'dept_menu') { this.menu = 'dept'; this.renderRadio(); return true; }
    this.sim.playerChoose(opt.id, opt.arg); this.openPanel(null); return true;
  }
  // debug: raise the next alert type (clears the previous one so each can be seen)
  debugCycle(clear = false) {
    if (clear) { this.alerts.clearAll(); this.dbg = -1; return null; }
    const ids = ALERT_ORDER.slice(1); if (this.dbg >= 0) this.alerts.clear(ids[this.dbg]);
    this.dbg = (this.dbg + 1) % ids.length; return this.alerts.raise(ids[this.dbg], { source: 'debug', reason: 'F4 debug cycle', deck: this.G?.shipDeck ?? 0 });
  }
  onKey(e) {
    if (e.code === 'F4') { e.preventDefault(); if (!e.repeat) this.debugCycle(e.shiftKey); return; }
    if (this.G && this.G.phase !== 'play' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.panel === 'radio' && /^(Digit|Numpad)\d$/.test(e.code)) { if (this.choose(e.code.slice(-1))) e.stopPropagation(); return; }
    if (this.panel === 'radio' && e.code === 'Backspace' && this.menu === 'dept') { this.menu = 'top'; this.renderRadio(); return; }
    if (e.code === 'KeyK') this.openPanel('details'); else if (e.code === 'KeyL') this.openPanel('log'); else if (e.code === 'KeyH') this.openPanel('radio');
    else if (e.code === 'Escape' && this.panel) this.openPanel(null);
  }
  // ---- per-frame
  update(dt) {
    this.t += dt; const vis = !this.G || VISIBLE_PHASES.has(this.G.phase), disp = vis ? '' : 'none';
    for (const e of [this.elBanner, this.elStack, this.elPa]) e.style.display = disp; if (!vis) { this.elBadge.style.display = 'none'; return; }
    if (this.alerts.active().map(a => a.id).join(',') !== this.sig) this.renderBanner(); else this.elBadge.style.display = this.alerts.active().length ? 'none' : '';
    if ((this.elT -= dt) <= 0) { this.elT = 0.5; for (const el of this.elBanner.querySelectorAll('[data-el]')) { const a = this.alerts.get(el.dataset.el); if (a) el.textContent = fmtElapsed(this.alerts.elapsed(a)); } if (this.panel === 'details') this.renderDetails(); if (this.panel === 'log') this.renderLog(); }
    if (this.paT > 0 && (this.paT -= dt) <= 0) this.elPa.classList.remove('on');
    for (const l of [...this.lines]) { l.age += dt; if (l.age > l.life) { l.el.classList.add('fade'); if (l.age > l.life + 0.9) { l.el.remove(); this.lines.splice(this.lines.indexOf(l), 1); } } }
    // klaxon repeats twice more for serious alerts, ~7 s apart
    for (const a of this.alerts.active()) { if ((this.reps.get(a.id) || 0) > 0 && (this.alertTimer[a.id] = (this.alertTimer[a.id] ?? 7) - dt) <= 0) { this.alertTimer[a.id] = 7; this.reps.set(a.id, this.reps.get(a.id) - 1); this.tone(a.def.klaxon); } }
  }
}
