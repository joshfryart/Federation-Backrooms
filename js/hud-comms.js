// HUD for ship-wide alerts and bridge comms. DOM only (no three.js); it injects its own markup and CSS, so index.html needs no changes.
//   top-centre: alert banner (stacked, highest severity first) / condition badge when green; PA subtitle line
//   bottom-left: comm traffic stack; K: alert details + legend; L: comm log; H: radio menu (digits choose, Backspace goes back)
//   F4 (debug): raise the next alert type; Shift+F4 clears them all
import { ALERTS, ALERT_ORDER, SEVERITY_NAME, fmtElapsed } from './alerts.js';
import { iconSvg } from './icons.js';
import { UIHUB } from './ui-mode.js';
import { deptCol, DEPT_LETTER } from './icons.js';
import { RANKS } from './data.js';
import { party } from './bridge.js';

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
#cm-radio.show~#cm-stack,body.radio-open #cm-stack{display:none}
#ac-details .alertcard h4{display:flex;gap:8px;align-items:center;margin:0 0 3px;font:700 15px var(--f-d,Arial);letter-spacing:.12em;text-transform:uppercase;color:var(--c)}#ac-details .alertcard h4 .ico{width:22px;height:22px}
.ac-panel .ico{width:1.3em;height:1.3em;fill:none;vertical-align:-.3em;flex:none}.sev{display:inline-flex;gap:3px;margin-left:auto}.sev i{width:16px;height:6px;background:#2a3446}.sev i.f{background:var(--c)}
.steps{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap}.steps div{flex:1;min-width:110px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 6px;background:rgba(255,255,255,.05);font:10px var(--f-d,Arial);letter-spacing:.06em;text-transform:uppercase;text-align:center;border:1px solid rgba(150,180,210,.26)}.steps .ico{width:26px;height:26px;color:var(--c)}
.lgw summary{cursor:pointer;font:700 11px var(--f-d,Arial);letter-spacing:.18em;text-transform:uppercase;color:var(--lc2,#58c9b9);margin:8px 0 5px}
.ac-panel.show{pointer-events:auto}.ac-panel .chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}.ac-panel .chips button{background:rgba(255,255,255,.04);border:1px solid rgba(150,180,210,.26);padding:2px 10px;font:700 10px var(--f-d,Arial);letter-spacing:.12em;text-transform:uppercase;color:#8fa0b6;cursor:pointer}.ac-panel .chips button[aria-pressed=true]{background:var(--lc1,#f2a03d);color:#08101a;border-color:var(--lc1,#f2a03d)}
#cm-radio{left:auto;right:14px;top:56px;bottom:20px;width:min(600px,94vw);overflow:auto}#cm-radio .quick{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
.ac-panel .act{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px;padding:5px 8px;background:rgba(255,255,255,.05);border:1px solid rgba(150,180,210,.26);color:#e8eef6;font:9px var(--f-d,Arial);letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.ac-panel .act .ico{width:22px;height:22px}.ac-panel .act img{width:26px;height:26px}.ac-panel .act:hover{border-color:var(--lc1,#f2a03d);background:rgba(242,160,61,.14)}.ac-panel .act.off{opacity:.4;pointer-events:none}.ac-panel .act kbd{position:absolute;top:1px;right:3px;font:9px var(--f-m,monospace);color:#ffd9a0}
#cm-radio .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:8px}#cm-radio,#cm-radio *{box-sizing:border-box}
#cm-radio .card{--c:#888;position:relative;display:grid;grid-template-columns:54px 1fr;gap:2px 9px;text-align:left;background:rgba(13,18,32,.92);border:1px solid rgba(150,180,210,.26);border-top:3px solid var(--c);padding:7px 8px 6px;color:#e8eef6;cursor:pointer;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,0 100%)}
#cm-radio .card:hover,#cm-radio .card.sel{outline:2px solid var(--lc1,#f2a03d);outline-offset:-2px;background:rgba(30,38,56,.95)}#cm-radio .card .pt{position:relative;width:54px;height:54px;grid-row:1/3}#cm-radio .card .pt img{width:54px;height:54px;display:block;border:1px solid rgba(255,255,255,.12)}
#cm-radio .card .dot{position:absolute;right:-5px;bottom:-5px;background:#05070c;border-radius:50%;padding:1px;width:16px;height:16px}#cm-radio .card .sdot{width:14px;height:14px;display:block}
#cm-radio .card .nm{display:block;font:700 12px/1.1 var(--f-d,Arial);letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#cm-radio .card>span{min-width:0}#cm-radio .card .tt{font-size:10px;color:#8fa0b6;line-height:1.15;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cm-radio .card .mt{grid-column:1/3;display:flex;align-items:center;gap:6px;margin-top:4px;font:10px var(--f-m,monospace);color:#8fa0b6}#cm-radio .card .pips{display:inline-flex;gap:2px}#cm-radio .card .pips i{width:7px;height:7px;transform:rotate(45deg);background:#ffd25e}#cm-radio .card .pips i.e{background:none;border:1px solid #ffd25e;width:6px;height:6px}
#cm-radio .card .dist{margin-left:auto;display:flex;align-items:center;gap:4px}#cm-radio .card .dist b{display:block;width:24px;height:4px;background:#1a2535;position:relative}#cm-radio .card .dist b i{position:absolute;left:0;top:0;bottom:0;background:var(--c)}#cm-radio .card .dg{position:absolute;top:4px;right:12px;font:700 10px var(--f-m,monospace);color:var(--c)}
.tray{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding:8px;border:1px dashed rgba(150,180,210,.26);align-items:center}.tray .who{font:700 12px var(--f-d,Arial);letter-spacing:.08em;margin-right:6px}.ac-panel .hint .sdot{width:11px;height:11px;vertical-align:-1px}
#cm-log .tl{position:relative;padding-left:64px}#cm-log .tl::before{content:'';position:absolute;left:52px;top:0;bottom:0;width:2px;background:#223046}
#cm-log .ev{position:relative;margin:0 0 6px;--c:#8fd8ff;display:block;border:0;font-size:12px;padding:0}#cm-log .ev.p-urgent{--c:#ffb347}#cm-log .ev.p-emergency{--c:#ff5a4a}
#cm-log .ev time{position:absolute;left:-64px;top:5px;width:36px;text-align:right;font:10px var(--f-m,monospace);color:#8fa0b6;opacity:1}
#cm-log .ev .nd{position:absolute;left:-23px;top:2px;width:24px;height:24px;box-sizing:border-box;border-radius:50%;background:#05070c;border:2px solid var(--c);display:grid;place-items:center;color:var(--c)}#cm-log .ev .nd .ico{width:13px;height:13px}
#cm-log .ev.ch-pa .nd{border-radius:4px}#cm-log .ev.ch-alert .nd{border-radius:0;transform:rotate(45deg)}#cm-log .ev.ch-alert .nd .ico{transform:rotate(-45deg)}
#cm-log .ev .bd{margin-left:12px;display:flex;gap:7px;align-items:flex-start;background:rgba(13,18,32,.9);border:1px solid rgba(150,180,210,.26);border-left:3px solid var(--c);padding:3px 9px;line-height:1.3}#cm-log .ev.pa .bd{background:rgba(143,216,255,.08);font-style:italic}
#cm-log .ev .bd>div{flex:1;min-width:0}#cm-log .ev .bd img,#cm-log .lfi{width:26px;height:26px;flex:none;border:1px solid #345}#cm-log .lfi{display:grid;place-items:center;color:#8fa0b6;border-color:#223046}
#cm-log .ev .bd b{font:700 10px var(--f-d,Arial);letter-spacing:.08em;text-transform:uppercase;color:var(--c);display:flex;gap:6px;align-items:center;font-style:normal}#cm-log .ev .bd b em{margin-left:auto;font:9px var(--f-m,monospace);font-style:normal;color:#8fa0b6}#cm-log .ev .bd b .to{width:10px;height:10px}#cm-log .ev .bd b span{text-transform:none;letter-spacing:0}
#cm-log .hr{position:relative;margin:8px 0 6px -64px;font:9px var(--f-m,monospace);color:#8fa0b6;display:flex;gap:6px;align-items:center}#cm-log .hr::after{content:'';flex:1;height:1px;background:#223046}
#cm-log .rows{overflow:auto;display:block;max-height:calc(100% - 90px)}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = (h) => { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return String(hh).padStart(2, '0') + String(mm).padStart(2, '0'); };
const who = (p) => !p ? '' : p.system ? esc(p.short) : p.group ? esc(p.short) : `${esc(p.short)} <span style="opacity:.6">· ${esc(p.title)}</span>`;
const PULSE = (sev) => [2, 1.8, 1.4, 1.0, 0.7, 0.5][Math.min(5, sev)] + 's';   // seconds per pulse: faster = more severe
const VISIBLE_PHASES = new Set(['play', 'ride', 'select', 'paused', 'perk']);
const CH_ICON = { pa: 'speaker', comm: 'badge', intercom: 'intercom', alert: 'alert', order: 'order' };
const OPT_ICON = { bridge: 'command', dept_menu: 'heads', status: 'check', assist: 'delegate', fault: 'alert', orders: 'order', dept: 'person' };
const OPT_LABEL = { bridge: 'Bridge', dept_menu: 'Dept heads', status: 'Status', assist: 'Assistance', fault: 'Fault', orders: 'Orders?' };
// contact status: hue AND shape (on watch dot, busy diamond, in transit triangle, off watch ring, unreachable cross)
const ST = { duty: ['On watch', '#4fd18b'], busy: ['Busy', '#ffb347'], transit: ['In transit', '#8fd8ff'], off: ['Off watch', '#7e8ea6'], down: ['Unreachable', '#ff5a4a'] };
const dotSvg = (st) => { const c = ST[st][1]; return `<svg class="sdot" viewBox="0 0 16 16" role="img" aria-label="${ST[st][0]}">${{ duty: `<circle cx="8" cy="8" r="5" fill="${c}"/>`, busy: `<path d="M8 2l6 6-6 6-6-6z" fill="${c}"/>`, transit: `<path d="M3 2l11 6-11 6z" fill="${c}"/>`, off: `<circle cx="8" cy="8" r="4.5" fill="none" stroke="${c}" stroke-width="2"/>`, down: `<path d="M3 3l10 10M13 3L3 13" stroke="${c}" stroke-width="2.6"/>` }[st]}</svg>`; };
const pipsOf = (rank) => { const r = RANKS[rank] || RANKS[0]; return '<i></i>'.repeat(r[1]) + '<i class="e"></i>'.repeat(r[2]); };
const stepIcon = (t, i) => { const s = t.toLowerCase(); for (const [re, n] of [[/station|post|report to/, 'pin'], [/seal|door|bulkhead/, 'door'], [/stay|remain|calm|shelter/, 'pause'], [/evacuat|leave|clear/, 'guide'], [/medic|sickbay|injur/, 'sickbay'], [/fire|extinguish/, 'fire'], [/arm|phaser|security/, 'security'], [/report|comm|badge/, 'hail'], [/repair|fix|engineer/, 'repair'], [/carry on|continue|duties|normal/, 'check']]) if (re.test(s)) return n; return ['check', 'chev', 'pin'][i % 3]; };
const SYS_PARTY = { id: 'computer', short: 'Computer', title: 'Computer', billet: 'computer', system: true };

export class CommsHUD {
  // opts: { alerts, bus, sim, clock, sound, G, onLighting(on), life: stack line lifetime (s) }
  constructor(o) {
    Object.assign(this, { alerts: o.alerts, bus: o.bus, sim: o.sim, clock: o.clock, sound: o.sound, G: o.G, onLighting: o.onLighting || (() => { }) });
    this.t = 0; this.lines = []; this.paT = 0; this.sig = ''; this.elT = 0; this.menu = null; this.panel = null; this.dbg = -1; this.reps = new Map();
    if (!document.getElementById('ac-style')) { const st = document.createElement('style'); st.id = 'ac-style'; st.textContent = CSS; document.head.appendChild(st); }
    const mk = (tag, id, cls = '') => { document.getElementById(id)?.remove(); const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); return e; };
    this.elBanner = mk('div', 'ac-banner'); this.elBadge = mk('div', 'ac-badge'); this.elPa = mk('div', 'ac-pa'); this.elStack = mk('div', 'cm-stack');
    this.elDetails = mk('div', 'ac-details', 'ac-panel ui-layer'); this.elLog = mk('div', 'cm-log', 'ac-panel ui-layer'); this.elRadio = mk('div', 'cm-radio', 'ac-panel ui-layer');
    for (const el of [this.elDetails, this.elLog, this.elRadio]) el.addEventListener('mousedown', (e) => { e.stopPropagation(); this.panelClick(e); });
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
    const steps = (d) => { const parts = String(d.doThis || '').split(/(?<=[.;])\s+/).filter(Boolean).slice(0, 3); return `<div class="steps">${parts.map((t, i) => `<div>${iconSvg(stepIcon(t, i))}<span>${esc(t.replace(/[.;]$/, ''))}</span></div>`).join('')}</div>`; };
    const sev = (n) => `<span class="sev">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
    const rows = act.length ? act.map(a => { const d = a.def; return `<div class="ad alertcard" style="--c:${d.colour}"><h4>${iconSvg(d.severity >= 3 ? 'red' : d.severity >= 1 ? 'yellow' : 'green')}<b>${esc(d.label)}</b>${sev(d.severity)}</h4><small>${a.scope === 'deck' && a.deck != null ? 'Deck ' + (a.deck + 1) : a.scope === 'deck' ? 'This deck' : 'Ship-wide'} · ${fmtElapsed(this.alerts.elapsed(a))} · ${a.byPerson ? 'ordered by ' + esc(a.byPerson.short) : a.source === 'auto' ? 'automatic: ' + esc(a.reason) : a.source}${a.reason && a.source !== 'auto' ? ' · ' + esc(a.reason) : ''}</small><p>${esc(d.meaning)}</p><p class="do"><b style="color:#9fe3a8">What you should do:</b></p>${steps(d)}</div>`; }).join('')
      : `<div class="ad alertcard" style="--c:${cond.colour}"><h4>${iconSvg('green')}<b>${esc(cond.label)}</b></h4><p>${esc(cond.meaning)}</p>${steps(cond)}</div>`;
    const legend = ALERT_ORDER.map(id => { const d = ALERTS[id]; return `<div style="--c:${d.colour}" title="${esc(d.meaning)}"><i></i><span>${esc(d.label)} <em>${esc(d.short)}</em></span><em>${d.severity}</em></div>`; }).join('');
    this.elDetails.innerHTML = `<h3>${iconSvg('alert')} Ship condition: ${esc(cond.label)}</h3>${rows}<details class="lgw"><summary>All alert types (severity 0-5)</summary><div class="lg">${legend}</div></details><div class="hint">K or Esc closes · L comm log · H radio</div>`;
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
  // ---- comm log: icon timeline (node shape = channel, ring colour = priority), 5-minute marks, filter chips, portraits
  renderLog() {
    const f = this.logFilter || 'all', ok = (m) => f === 'all' || (f === 'urgent' ? m.priority !== 'routine' : f === 'order' ? /order/.test(m.kind) : f === 'alert' ? !!m.alert : m.channel === f);
    let lastB = -1, html = '';
    for (const m of this.bus.log.slice(-60).filter(ok)) {
      const b = Math.floor(m.hour * 12); if (b !== lastB) { lastB = b; html += `<div class="hr">${hhmm(b / 12)}</div>`; }
      const ch = m.alert ? 'alert' : /order/.test(m.kind) ? 'order' : m.channel, face = this.face(m.from);
      html += `<div class="lr ev p-${m.priority} ch-${ch}${m.channel === 'pa' ? ' pa' : ''}"><time>${hhmm(m.hour)}</time><span class="nd">${iconSvg(CH_ICON[ch] || 'badge')}</span><div class="bd">${face}<div><b>${who(m.from)}${m.to && !m.to.group && m.channel !== 'pa' ? ` ${iconSvg('chev', { cls: 'to' })} ${esc(m.to.short)}` : ''}<em>${ch.toUpperCase()}${m.priority !== 'routine' ? ' · ' + m.priority.toUpperCase() : ''}</em></b>${esc(m.text)}</div></div></div>`;
    }
    const chips = [['all', 'All'], ['comm', 'Comm'], ['pa', 'PA'], ['order', 'Orders'], ['alert', 'Alerts'], ['urgent', 'Urgent']].map(([k, t]) => `<button data-lf="${k}" aria-pressed="${f === k}">${t}</button>`).join('');
    this.elLog.innerHTML = `<h3>${iconSvg('log')} Comm log · ship time ${hhmm(this.clock.hour)}</h3><div class="chips">${chips}</div><div class="rows tl">${html || '<div class="hint">No traffic yet.</div>'}</div><div class="hint">L or Esc closes · H radio · K alerts</div>`;
    const r = this.elLog.querySelector('.rows'); if (r) r.scrollTop = r.scrollHeight;
  }
  face(from, px = 26) { const p = from && typeof from.id === 'number' ? this.G?.roster?.people?.[from.id] : null; const PT = UIHUB.portraits; return p && PT && p.id === from.id ? PT.img(p, px, 'lf') : `<span class="lfi">${iconSvg(from?.group || from?.system ? 'command' : 'person')}</span>`; }
  // ---- radio: quick calls (the comm-badge options, digits 1-6) + contact cards with live portraits
  contacts() {
    const G = this.G, R = G?.roster; if (!R) return [];
    const D = G.duty, subs = new Set(D?.subs?.() || []), heads = new Set(this.sim.heads?.() || []), M = UIHUB.menus;
    return R.people.filter(p => !p.isPlayer && p.status !== 'evacuated').map(p => {
      const w = this.sim?.where?.(p) || G.sim?.where?.(p), dist = M?.distTo?.(p) ?? null;
      const st = ['dead', 'corpse', 'crazed'].includes(p.status) ? 'down' : w?.transit ? 'transit' : /sleep|rest|off|bunk/.test(w?.activity || '') || w?.room === 'quarters' ? 'off' : /work|duty|repair|post|console|station/.test(w?.activity || '') ? 'duty' : 'busy';
      return { p, w, st, dist, sub: subs.has(p), head: heads.has(p), bridge: w?.room === 'bridge' };
    });
  }
  renderRadio() {
    const PT = UIHUB.portraits, lvl = this.menu === 'dept' ? 'dept' : 'top', opts = this.sim.playerOptions(lvl);
    const heads = lvl === 'dept' ? this.sim.heads().filter(p => p.billet !== 'co') : [];
    const quick = opts.map((o, i) => { const h = heads[i]; return `<button class="opt act" data-opt="${o.key}">${h && PT ? PT.img(h, 26, 'op') : iconSvg(OPT_ICON[o.id] || 'hail')}<span>${esc(lvl === 'dept' && h ? h.short : OPT_LABEL[o.id] || o.label)}</span><kbd>${o.key}</kbd></button>`; }).join('');
    const f = this.cardFilter || 'all', FL = { all: () => true, heads: c => c.head, mine: c => c.sub, near: c => c.dist && c.dist.deck === 0 && c.st !== 'down', bridge: c => c.bridge };
    const list = this.contacts().filter(FL[f] || FL.all).sort((a, b) => (a.st === 'down') - (b.st === 'down') || (a.dist?.deck ?? 99) - (b.dist?.deck ?? 99) || (a.dist?.m ?? 999) - (b.dist?.m ?? 999) || b.p.rank - a.p.rank).slice(0, 24);
    const card = (c) => { const p = c.p, col = deptCol(p), d = c.dist, near = d && d.deck === 0 ? Math.max(6, 100 - d.m * 2) : d ? Math.max(4, 30 - d.deck * 6) : 0;
      return `<button class="card${this.sel === p.id ? ' sel' : ''}" style="--c:${col}" data-id="${p.id}" aria-label="${esc(p.short)}, ${esc(p.title)}, ${ST[c.st][0]}"><span class="pt">${PT ? PT.img(p, 54, 'cp') : ''}<span class="dot">${dotSvg(c.st)}</span></span><span><span class="nm">${esc(p.short)}</span><span class="tt">${esc(p.title)}</span></span><span class="dg">${DEPT_LETTER[p.dept] || ''}</span><span class="mt"><span class="pips">${pipsOf(p.rank)}</span><span class="dist"><b><i style="width:${near}%"></i></b>${c.w?.deckNo ? 'D' + c.w.deckNo : '—'}${d && d.deck === 0 ? '·' + Math.round(d.m) + 'm' : ''}</span></span></button>`; };
    const s = list.find(c => c.p.id === this.sel), A = [['hail', 'Hail', 'hail'], ['order', 'Order duty', 'order'], ['delegate', 'Ask help', 'help'], ['locate', 'Locate', 'loc'], ['greet', 'Say hi', 'hi']];
    const tray = s ? `<span class="who" style="color:${deptCol(s.p)}">${esc(s.p.short)}</span>${A.map(([i, t, id]) => `<button class="act${(s.st === 'down' && id !== 'loc') || (id === 'order' && !s.sub) ? ' off' : ''}" data-ca="${id}">${iconSvg(i)}${t}</button>`).join('')}` : `<span class="hint" style="margin:0">Select a card: ${iconSvg('hail')} hail · ${iconSvg('order')} order · ${iconSvg('delegate')} ask for help · ${iconSvg('locate')} locate</span>`;
    const chips = [['all', 'Everyone'], ['heads', 'Dept heads'], ['mine', 'My reports'], ['near', 'This deck'], ['bridge', 'Bridge']].map(([k, t]) => `<button data-f="${k}" aria-pressed="${f === k}">${t}</button>`).join('');
    this.elRadio.innerHTML = `<h3>${iconSvg('badge')} Comm badge${lvl === 'dept' ? ' · department heads' : ''}</h3><div class="quick">${quick}</div><div class="chips">${chips}</div><div class="cards">${list.map(card).join('')}</div><div class="tray">${tray}</div><div class="hint">${lvl === 'dept' ? 'Backspace back · ' : ''}digits call · H or Esc closes · ${Object.keys(ST).map(k => dotSvg(k) + ' ' + ST[k][0]).join(' ')}</div>`;
  }
  openPanel(name) {
    if (this.panel === name) name = null; const prev = this.panel;
    this.panel = name; this.menu = name === 'radio' ? 'top' : null; if (name !== 'radio') this.sel = null;
    this.elDetails.classList.toggle('show', name === 'details'); this.elLog.classList.toggle('show', name === 'log'); this.elRadio.classList.toggle('show', name === 'radio');
    document.body.classList.toggle('radio-open', name === 'radio');
    if (name === 'details') this.renderDetails(); if (name === 'log') this.renderLog(); if (name === 'radio') this.renderRadio();
    const UI = UIHUB.ui; if (!UI) return;
    if (prev && !name) UI.closed('comms');
    if (name) UI.open('comms', { close: () => this.openPanel(null), back: () => { if (this.panel === 'radio' && this.menu === 'dept') { this.menu = 'top'; this.renderRadio(); return true; } this._fromUI = true; this.openPanel(null); return false; }, key: (e) => this.panelKey(e), toggle: { details: 'KeyK', log: 'KeyL', radio: 'KeyH' }[name], panel: name });
  }
  panelKey(e) { if (this.panel === 'radio' && /^(Digit|Numpad)\d$/.test(e.code)) { this.choose(e.code.slice(-1)); return true; } return false; }
  choose(key) {
    const opt = this.sim.playerOptions(this.menu === 'dept' ? 'dept' : 'top').find(o => o.key === key); if (!opt) return false;
    if (opt.id === 'dept_menu') { this.menu = 'dept'; this.renderRadio(); return true; }
    this.sim.playerChoose(opt.id, opt.arg); this.openPanel(null); return true;
  }
  /** hail anyone on the badge (heads use the bridge model's own reply lines) */
  hail(p) {
    const pl = this.sim.player; if (!p || !pl) return null; const h = this.sim.heads?.().find(x => x === p); if (h && p.billet !== 'co') return this.sim.playerChoose('dept', p.billet);
    const me = party(pl), m = this.sim.say({ from: me, to: party(p), text: `${p.short}, ${pl.short}. Have you got a minute?`, priority: 'routine', channel: 'comm', kind: 'hail' });
    const down = ['dead', 'corpse', 'crazed'].includes(p.status); this.sim.after(2 + Math.random(), () => this.sim.say(down ? { from: SYS_PARTY, to: me, text: `No response from ${p.short}.`, priority: 'urgent', channel: 'comm', kind: 'reply' } : { from: party(p), to: me, text: p.rank < pl.rank ? 'Go ahead, sir.' : 'Go ahead.', priority: 'routine', channel: 'comm', kind: 'reply', re: m?.id })); return m;
  }
  cardAction(id) {
    const p = this.G?.roster?.people?.find(x => x.id === this.sel); if (!p) return; const D = this.G.duty, say = (t, c) => UIHUB.menus?.say?.(t, c);
    if (id === 'hail') { this.hail(p); this.openPanel(null); }
    else if (id === 'order') { const r = D?.order(p, null); if (r && !r.ok && !r.refused) say(r.why, 'warn'); this.openPanel(null); }
    else if (id === 'help') { const r = D?.askHelp(p); if (r && !r.ok && !r.refused) say(r.why, 'warn'); this.openPanel(null); }
    else if (id === 'loc') { const w = this.sim.where?.(p) || this.G.sim?.where?.(p); say(w ? (w.transit ? `${p.short}: in transit` : `${p.short}: deck ${w.deckNo}, ${w.room}`) : `${p.short}: not on the board`, 'comp'); UIHUB.menus?.locate?.(p); }
    else if (id === 'hi') { const m = this.sim.say({ from: party(this.sim.player), to: party(p), text: `Morning, ${p.family || p.short}.`, priority: 'routine', channel: 'comm', kind: 'hail' }); this.sim.after(1.5, () => this.sim.say({ from: party(p), to: party(this.sim.player), text: 'Morning.', priority: 'routine', channel: 'comm', kind: 'reply', re: m?.id })); this.openPanel(null); }
  }
  panelClick(e) {
    const t = e.target, o = t.closest('[data-opt]'); if (o) { this.choose(o.dataset.opt); return; }
    const f = t.closest('[data-f]'); if (f) { this.cardFilter = f.dataset.f; this.renderRadio(); return; }
    const lf = t.closest('[data-lf]'); if (lf) { this.logFilter = lf.dataset.lf; this.renderLog(); return; }
    const a = t.closest('[data-ca]'); if (a) { this.cardAction(a.dataset.ca); return; }
    const c = t.closest('.card'); if (c) { this.sel = +c.dataset.id; this.renderRadio(); }
  }
  // debug: raise the next alert type (clears the previous one so each can be seen)
  debugCycle(clear = false) {
    if (clear) { this.alerts.clearAll(); this.dbg = -1; return null; }
    const ids = ALERT_ORDER.slice(1); if (this.dbg >= 0) this.alerts.clear(ids[this.dbg]);
    this.dbg = (this.dbg + 1) % ids.length; return this.alerts.raise(ids[this.dbg], { source: 'debug', reason: 'F4 debug cycle', deck: this.G?.shipDeck ?? 0 });
  }
  onKey(e) {
    if (e.code === 'F4') { e.preventDefault(); if (!e.repeat) this.debugCycle(e.shiftKey); return; }
    if (UIHUB.ui && UIHUB.menus) return;   // js/menus.js routes K / L / H, digits, Esc and Backspace through the UI layer stack
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
