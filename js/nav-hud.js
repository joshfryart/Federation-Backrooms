// Navigation + visual HUD glue for Systems Nominal (DOM + canvas; logic lives in js/nav.js, drawing in js/minimap.js / compass.js).
// One pin drives everything: minimap route ribbon, 3D floor chevrons + destination beacon (World.setGuide), compass marker, route card.
//   G   cycles: most urgent due duty/task -> next due ... -> nearest lift -> none   (auto-pins the most urgent when it comes due)
//   M   big map: whole deck + deck column (every deck, unvisited ones from the ship plan), find-a-room-type strip, click a room to guide
//       there (any deck: walk to the lift, ride, walk). While open the world is paused (G.menuPause) and keys/mouse go to the map;
//       under pointer lock the mouse drives a virtual cursor, so the lock never has to be released.
//   Tab ship status: systems schematic (js/schematic.js) instead of the sentence list.
// Inputs: G.duty (board), G.pin ({kind, id, room, deck}: set by the tasks agent for the guided first task), G.plan, G.shipDecks, world.
// main.js calls frame(dt) every play frame (route recompute is internal at 0.12 s), renderStatus(el) from renderStatus().
import { ICONS, CATS, SHAPES, drawIcon, badgeSvg, iconSvg } from './icons.js';
import { ROOM_CAT, Pins, dutyItems, ringNav, deckRoomTypes, planRoute, pinKey, liftTile, WALK } from './nav.js';
import { bakeDeck, deckBounds, drawLocal, drawPlan, drawBadge, ROUTE, DUE, LATE, IDLE, DOING } from './minimap.js';
import { Compass } from './compass.js';
import { schematicHTML, SCHEMATIC_CSS } from './schematic.js';
import { mountBrief } from './briefmap.js';
import { ROOMS } from './data.js';
import { UIHUB } from './ui-mode.js';
import { zoneOf } from './ships.js';

const ZCOL = { Command: '#6ea8ff', Habitat: '#58c9b9', Services: '#c6d25e', Engineering: '#e8892b' };
const OPEN = '#8fb8ff';   // an open task (due by end of shift: no countdown)
const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const short = (s, n = 3) => String(s || '').split(/\s+/).slice(0, n).join(' ');
const bdg = (type, px = 16) => badgeSvg(type === 'lift' ? 'lift' : type, ROOM_CAT[type] || 'crew', { size: px });
const ico = (n, px = 14, color = 'currentColor') => iconSvg(ICONS[n] ? n : 'dots', { size: px, color });
const label = (t) => ROOMS[t]?.label || (t === 'lift' ? 'Tubelift' : t);
/** status ring svg: frac of arc, glyph inside, optional notch (where the ETA lands on the time left) */
function ring(frac, color, size, icon, notch = null) {
  let h = `<svg width="${size}" height="${size}" viewBox="0 0 34 34" style="flex:none"><circle cx="17" cy="17" r="14" fill="rgba(5,8,14,.55)" stroke="rgba(255,255,255,.14)" stroke-width="3"/>`
    + `<circle cx="17" cy="17" r="14" fill="none" stroke="${color}" stroke-width="3.4" pathLength="100" stroke-dasharray="${Math.max(0, Math.min(1, frac)) * 100} 100" transform="rotate(-90 17 17)"/>`;
  if (notch != null) { const a = -Math.PI / 2 + Math.min(1, notch) * 2 * Math.PI; h += `<line x1="${17 + Math.cos(a) * 9.8}" y1="${17 + Math.sin(a) * 9.8}" x2="${17 + Math.cos(a) * 17.4}" y2="${17 + Math.sin(a) * 17.4}" stroke="#fff" stroke-width="2"/>`; }
  if (icon) h += `<g transform="translate(9.8 9.8) scale(.6)" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[icon] || ICONS.dots}"/></g>`;
  return h + '</svg>';
}
const shapeSvg = (k, px = 13) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24"><path d="${SHAPES[CATS[k].s]}" fill="${CATS[k].c}" fill-opacity=".3" stroke="${CATS[k].c}" stroke-width="2.4"/></svg>`;
const legendHTML = () => `<span>${ico('guide', 13, '#fff')}you</span><span>${ico('lift', 13)}lift</span><span>${ring(0.65, DUE, 14)}due</span><span>${ring(0.2, LATE, 14)}late</span><span>${ring(1, OPEN, 14)}open</span><span style="color:${ROUTE}">${ico('chev', 13, ROUTE)}route</span><span>${Object.keys(CATS).map(k => shapeSvg(k)).join('')}</span>`;

const CSS = `
body.nominal #minimap{top:12px;right:14px;width:208px;height:208px;image-rendering:auto}
#nv-card,#nv-legend,#nv-compass{display:none}body.nominal #nv-card,body.nominal #nv-compass{display:block}body.nominal #nv-legend.on{display:flex}
#nv-card{position:fixed;right:14px;top:226px;width:208px;z-index:5;pointer-events:none;background:rgba(7,11,19,.72);border:1px solid rgba(150,180,210,.26);border-left:3px solid ${ROUTE};padding:5px 8px;color:#e8eef6;font:12px var(--f-d,Arial);clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,0 100%)}
#nv-card .row{display:flex;align-items:center;gap:7px}#nv-card .big{font:800 22px var(--f-m,monospace);line-height:1}#nv-card .big small{font-size:11px;color:#8fa0b6;margin-left:2px}
#nv-card .sub{font:700 9px var(--f-m,monospace);color:#8fa0b6;display:flex;gap:3px;align-items:center;margin-top:2px}#nv-card .eta{text-align:center;font:700 10px var(--f-m,monospace)}
#nv-card .stp{display:flex;align-items:center;gap:3px;margin-top:5px;flex-wrap:wrap}#nv-card.dim{border-left-color:#567;color:#8fa0b6}
.nv-c{display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border:1px solid rgba(150,180,210,.26);background:rgba(255,255,255,.05);font:700 10px var(--f-m,monospace);color:#cfe1f3;border-radius:10px;white-space:nowrap}
.nv-c.cur{border-color:${ROUTE};color:${ROUTE};box-shadow:0 0 6px rgba(142,243,255,.4)}.nv-c.done{opacity:.45}
.nv-k{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;border:1px solid #9fb2c8;border-bottom-width:3px;border-radius:4px;background:#101a2c;color:#fff;font:700 10px var(--f-m,monospace)}
#nv-legend{position:fixed;right:14px;width:208px;z-index:5;pointer-events:none;flex-wrap:wrap;gap:3px 8px;padding:4px 7px;background:rgba(7,11,19,.72);border:1px solid rgba(150,180,210,.26);font:600 9px var(--f-m,monospace);color:#cfe1f3}
#nv-legend span,#nv-map .leg span{display:inline-flex;align-items:center;gap:3px}
#liftui .lr em.lb{display:inline-flex;margin-left:3px;vertical-align:middle}#liftui .lr.pre{border-color:#8ef3ff;box-shadow:inset 3px 0 0 #8ef3ff}#liftui .lr.pre b::after{content:'  ▸ guide destination (Enter)';color:#8ef3ff;font-size:11px}
#nv-compass{position:fixed;left:50%;top:36px;transform:translateX(-50%);width:min(520px,50vw);height:auto;aspect-ratio:520/62;z-index:4;pointer-events:none}
body.nominal #faults{top:316px}
#nv-map{position:fixed;inset:0;z-index:12;display:none;background:#03060c;color:#e8eef6;font:12px var(--f-d,Arial)}#nv-map.on{display:flex}
#nv-map .col{width:136px;border-right:1px solid rgba(150,180,210,.26);padding:8px 6px;display:flex;flex-direction:column;gap:3px;overflow:auto}
#nv-map .h{font:700 9px var(--f-d,Arial);letter-spacing:.2em;color:#f2a03d;margin-bottom:2px}
#nv-map .dk{display:grid;grid-template-columns:30px 1fr;align-items:center;gap:5px;padding:3px 5px;border:1px solid rgba(150,180,210,.26);border-left:4px solid var(--z);background:rgba(255,255,255,.03);cursor:pointer;font:700 12px var(--f-m,monospace);color:#cfe1f3}
#nv-map .dk.cur{background:rgba(142,243,255,.12)}#nv-map .dk.sel{box-shadow:inset 0 0 0 1px #f2a03d;border-color:#f2a03d}#nv-map .dk.has{outline:1px dashed #fff}
#nv-map .dk .z{font:600 9px var(--f-d,Arial);letter-spacing:.08em}#nv-map .dk .mk{grid-column:1/3;display:flex;gap:2px;flex-wrap:wrap;min-height:2px}
#nv-map .main{flex:1;position:relative;overflow:hidden}#nv-map canvas{position:absolute;inset:0;width:100%;height:100%}
#nv-map .find{position:absolute;left:8px;right:8px;top:6px;display:flex;flex-wrap:wrap;gap:2px;align-items:center}#nv-map .find span{cursor:pointer;opacity:.75}#nv-map .find span.on{opacity:1;filter:drop-shadow(0 0 4px #fff)}
#nv-map .tip{position:absolute;pointer-events:none;display:none;align-items:center;gap:6px;padding:3px 8px;background:rgba(5,8,14,.94);border:1px solid rgba(150,180,210,.3);font:700 11px var(--f-d,Arial);white-space:nowrap}
#nv-map .tools{position:absolute;left:8px;bottom:8px;display:flex;gap:8px;align-items:center;font:700 10px var(--f-m,monospace);color:#cfe1f3}
#nv-map .leg{position:absolute;right:8px;bottom:8px;display:flex;gap:8px;align-items:center;padding:4px 8px;background:rgba(7,11,19,.8);border:1px solid rgba(150,180,210,.26);font:700 10px var(--f-m,monospace)}
#nv-map .note{position:absolute;left:10px;top:44px;font:700 11px var(--f-m,monospace);color:#8fa0b6}
#nv-map .vc{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid #fff;border-radius:50%;pointer-events:none;box-shadow:0 0 6px #000;display:none}
@media (max-height:470px),(max-width:700px){body.nominal #minimap{width:128px;height:128px}#nv-card{top:146px;width:128px;padding:3px 5px}#nv-card .big{font-size:16px}#nv-card .stp{display:none}#nv-legend{display:none!important}#nv-compass{top:30px;width:52vw}body.nominal #faults{top:206px}#nv-map .col{width:96px}}
${SCHEMATIC_CSS}`;

export class NavHUD {
  constructor(ctx) {
    this.c = ctx; this.pins = new Pins(); this.t = 0; this.tickT = 0; this.drawT = 0; this.mapT = 0;
    this.items = []; this.plan = null; this.route = null; this.dest = null; this.planKey = ''; this.markers = []; this.cardHTML = '';
    this.mapOpen = false; this.selDeck = 0; this.findType = null; this.hover = null; this.vc = null; this.layers = new Map(); this.beacons = {};
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const mk = (tag, id, html = '') => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; document.body.appendChild(e); return e; };
    this.card = mk('div', 'nv-card'); this.legend = mk('div', 'nv-legend', legendHTML());
    this.cmpC = mk('canvas', 'nv-compass'); this.cmpC.width = 1040; this.cmpC.height = 124; this.compass = new Compass(this.cmpC);
    this.map = mk('div', 'nv-map', `<div class="col"><div class="h">DECKS</div><div class="decks"></div></div><div class="main"><canvas></canvas><div class="find"></div><div class="note"></div><div class="tip"></div><div class="vc"></div>
      <div class="tools"><span class="nv-k">M</span>${ico('x', 13)}<span class="nv-k">G</span>${ico('guide', 13)}<span class="nv-k">L</span>${ico('lift', 13)}<span class="nv-k">1-9</span>${ico('ship', 13)}<span class="nv-k">F</span>${ico('eye', 13)}</div><div class="leg">${legendHTML()}</div></div>`);
    this.mapC = this.map.querySelector('canvas'); this.mapG = this.mapC.getContext('2d');
    this.map.querySelector('.decks').onclick = (e) => { const b = e.target.closest('.dk'); if (b) this.selectDeck(+b.dataset.d); };
    this.map.querySelector('.find').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) this.find(b.dataset.t); };
    this.mapC.addEventListener('mousemove', (e) => { if (!this.locked()) this.hoverAt(e.offsetX, e.offsetY); });
    this.mapC.addEventListener('click', (e) => { if (!this.locked()) this.clickAt(e.offsetX, e.offsetY); });
    UIHUB.nav = this;
    addEventListener('keydown', (e) => this.onKey(e), true);
    addEventListener('mousemove', (e) => this.onMouse(e), true);
    addEventListener('mousedown', (e) => this.onDown(e), true);
    setInterval(() => this.poll(), 300);
  }
  get G() { return this.c.G; } get P() { return this.c.P; } get world() { return this.c.world; } get TS() { return this.c.TS || 2.5; }
  on() { return this.c.NOM ? this.c.NOM() : this.G.mode === 'nominal'; }
  locked() { return !!document.pointerLockElement; }
  decks() { const S = this.G.shipDecks; if (S !== this._sd) { this._sd = S; this._dd = S ? S.map(s => s.data) : null; } return this._dd; }
  from() { return { x: this.P.x / this.TS, y: this.P.z / this.TS }; }
  get pin() { return this.pins.pin; }

  // ---- pins
  setPin(p, sayIt = true) { this.pins.set(p); this.pins.cleared = !p; this.planKey = ''; this.tick(); if (sayIt) this.G.say?.(p ? `Guide: ${short(p.label || label(p.room || p.type), 4)}` : 'Guide off', 'comp'); return p; }
  /** lift panel: room-type badges for deck i (js/nav.js deckRoomTypes) and the deck the guided pin leads to */
  liftBadges(i, types) { return deckRoomTypes(this.G.plan, i, types).map(t => `<em class="lb" title="${esc(label(t))}">${bdg(t, 15)}</em>`).join(''); }
  destDeck() { return this.on() && this.pin ? (this.dest?.deck ?? this.pin.deck ?? null) : null; }
  /** pin a duty / task by id (duty board 'Guide me') */
  pinItem(kind, id) { this.items = dutyItems(this.G.duty); const it = this.items.find(i => i.kind === kind && i.id === id); if (!it || !it.room) return null; return this.setPin({ kind: it.kind, id: it.id, room: it.room, label: it.label, icon: it.icon }); }
  /** duty-board ring extras for a loop id: { pinned, notch, late } (js/nav.js ringNav) */
  ringInfo(id) { const it = this.items.find(i => i.kind === 'duty' && i.id === id); return ringNav(it, this.pin, this.plan); }
  cycle() { this.items = dutyItems(this.G.duty); const p = this.pins.cycle(this.items); this.planKey = ''; this.tick(); this.G.say?.(p ? `Guide: ${short(p.label, 4)}` : 'Guide off', 'comp'); return p; }
  targetOf(p) {
    if (!p) return null;
    if (p.kind === 'lift') return { lift: true };
    if (p.tx != null) return { deck: p.deck, tx: p.tx, ty: p.ty, type: p.type || p.room };
    if (p.kind === 'deck') return { deck: p.deck };
    const room = p.room || p.type; return room ? { type: room, deck: p.deck ?? undefined } : null;
  }

  // ---- 0.12 s tick: items, pin, plan, markers, card
  tick() {
    const G = this.G, w = this.world; if (!w || !this.on()) return;
    this.items = dutyItems(G.duty); const pin = this.pins.update(this.items, G.pin || null), decks = this.decks(), cur = G.shipDeck ?? 0, from = this.from();
    const key = pinKey(pin) + '@' + cur;
    if (!pin || !decks) { this.plan = null; this.dest = null; this.planKey = key; }
    else if (key !== this.planKey || !this.dest) { this.plan = planRoute(G.plan, decks, cur, from, this.targetOf(pin), { world: w, TS: this.TS }); this.dest = this.plan?.dest || null; this.planKey = key; }
    else { const d = this.dest; this.plan = planRoute(G.plan, decks, cur, from, d.lift ? { lift: true, deck: d.deck } : { deck: d.deck, tx: d.tx, ty: d.ty, type: d.type }, { world: w, TS: this.TS }); }
    const leg = this.plan?.legs[0]; this.route = leg && leg.kind === 'walk' && leg.deck === cur ? leg.route : null;
    // arrived at a room / the lift: a plain "go there" pin is done
    if (pin && (pin.kind === 'room' || pin.kind === 'lift') && this.plan && this.plan.legs.length === 1 && this.route && this.route.len * this.TS < 2.2) { this.pins.set(null); this.pins.cleared = true; G.say?.(`Arrived: ${short(pin.label || label(pin.room), 3)}`, 'good'); this.plan = this.route = this.dest = null; }
    this.buildMarkers(); this.renderCard();
  }
  /** room instance of a type on this deck nearest the player (for markers) */
  nearRoom(type) { const d = this.world.d, f = this.from(); let b = null, bd = 1e9; for (const r of d.rooms) if (r.type === type) { const dd = Math.hypot(r.x + r.w / 2 - f.x, r.y + r.h / 2 - f.y); if (dd < bd) { bd = dd; b = r; } } return b; }
  status(it) {
    if (it.status === 'doing') return { frac: 0.5, color: DOING, pulse: false };
    if (it.kind === 'task') return it.due ? { frac: 1, color: OPEN, pulse: false } : { frac: 1 - Math.min(1, it.eta / 300), color: IDLE };
    if (!it.due) return { frac: 1 - Math.min(1, it.eta / 300), color: IDLE };
    const frac = it.total ? (it.left ?? 0) / it.total : 0.5; return { frac, color: it.late || frac < 0.3 ? LATE : DUE, pulse: true };
  }
  buildMarkers() {
    const pin = this.pin, cur = this.G.shipDeck ?? 0, out = [];
    for (const it of this.items) {
      if (!it.room || it.status === 'done' || it.status === 'missed') continue; if (!it.due && !(it.eta < 120 && it.status !== 'pending')) continue;
      const pinned = pin && pin.kind === it.kind && pin.id === it.id; let r = null;
      if (pinned && this.dest && this.dest.deck === cur && this.dest.room) r = this.dest.room; else r = this.nearRoom(it.room);
      if (!r) continue; out.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, type: it.room, icon: it.icon, pinned, dest: pinned, item: it, ...this.status(it) });
    }
    if (this.dest && this.dest.deck === cur && this.dest.room && !out.some(m => m.dest)) { const r = this.dest.room; out.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, type: r.type, icon: r.type, frac: 1, color: ROUTE, pinned: true, dest: true }); }
    this.markers = out;
  }
  legDest() {   // where the current leg ends on this deck: {x, y, type, icon, tx, ty}
    const leg = this.plan?.legs[0]; if (!leg || leg.kind !== 'walk') return null; const to = leg.to, pin = this.pin;
    const r = to.type !== 'lift' && this.dest?.room && this.plan.legs.length === 1 ? this.dest.room : null;
    return { x: r ? r.x + r.w / 2 : to.tx + 0.5, y: r ? r.y + r.h / 2 : to.ty + 0.5, tx: to.tx, ty: to.ty, type: to.type || 'lift', icon: to.type === 'lift' ? 'lift' : (pin?.icon || to.type) };
  }
  renderCard() {
    const pin = this.pin, p = this.plan; let h, dim = false;
    if (!pin) { dim = true; const n = this.items.filter(i => i.due).length; h = `<div class="row">${ico('guide', 20)}<span class="nv-k">G</span><span class="ttl">No guide<small>pin your next duty</small></span><span class="due" style="font:600 10px var(--f-m,monospace)">${n ? `${n} ${ico('clock', 11)}` : ''}</span></div>`; }
    else if (!p) h = `<div class="row">${ico('warn', 20, LATE)}<span>${esc(short(pin.label || label(pin.room), 3))}</span></div>`;
    else {
      const leg = p.legs[0], r = leg.kind === 'walk' ? leg.route : null, nm = r?.man[0], toLift = leg.kind === 'walk' && leg.to.type === 'lift' && p.legs.length > 1;
      const turn = !r || r.len * this.TS < 3 ? (toLift ? 'lift' : 'pin') : nm ? nm.kind : 'straight', nd = r ? Math.round((nm ? nm.at : r.len) * this.TS) : 0;
      const it = this.items.find(i => i.kind === pin.kind && i.id === pin.id), left = it?.due && it.kind === 'duty' ? it.left : null, late = left != null && p.eta > left;
      const then = toLift ? `${ico('lift', 11)}${ico('chev', 9)}D${p.dest.deck + 1}` : r?.man[1] ? `${ico('chev', 9)}${ico(r.man[1].kind, 11)}` : nm ? `${ico('chev', 9)}${ico('pin', 11)}` : '';
      const chips = p.legs.map((l, i) => l.kind === 'ride' ? `<span class="nv-c">${ico('lift', 11)}D${l.from + 1}${ico('chev', 8)}D${l.to + 1}</span>` : `<span class="nv-c ${i === 0 ? 'cur' : ''}">${l.to.type === 'lift' ? ico('lift', 11) : bdg(l.to.type, 13)}${Math.round(l.route.len * this.TS)}m</span>`).join(ico('chev', 8, '#567'));
      h = `<div class="ttl pinned">${ico(pin.icon || 'pin', 13)}<span>${esc(short(pin.label || label(pin.room || p.dest.type), 4))}</span><span class="nv-k">G</span></div><div class="row"><span style="color:${ROUTE}">${ico(turn, 28, ROUTE)}</span><div style="flex:1"><div class="big">${nd}<small>m</small></div><div class="sub">${then}</div></div>`
        + `<div class="eta">${ring(left != null ? Math.min(1, p.eta / Math.max(1, left)) : 1, late ? LATE : ROUTE, 34, 'clock', left != null ? Math.min(1, p.eta / Math.max(1, it.total || left)) : null)}<div>${fmt(p.eta)}</div></div></div>`
        + `<div class="stp">${chips}${ico('chev', 8, '#567')}<span class="nv-c" style="border-color:${late ? LATE : ROUTE};color:${late ? LATE : ROUTE}">${ico(pin.icon || 'pin', 11)}${esc(short(pin.label || label(pin.room || p.dest.type), 2))}</span></div>`;
    }
    if (h !== this.cardHTML) { this.cardHTML = h; this.card.innerHTML = h; this.card.classList.toggle('dim', dim); }
  }

  // ---- per frame
  frame(dt) {
    const w = this.world; if (!w || !this.on() || typeof document === 'undefined') return; this.t += dt;
    if (w !== this._w) { this._w = w; this.layers.clear(); this.planKey = ''; this.exCount = -1; }
    this.tickT -= dt; if (this.tickT <= 0) { this.tickT = 0.12; this.tick(); }
    const G = this.G, f = this.from(), ld = this.legDest();
    this.drawT -= dt;
    if (this.drawT <= 0) {
      this.drawT = 1 / 30; const mm = document.getElementById('minimap');
      if (mm) { if (mm.width !== 416) { mm.width = mm.height = 416; } this.drawMini(mm, f, ld); }
      const car = w.car || { tx: w.d.exit[0], ty: w.d.exit[1] };
      const cm = [{ x: car.tx + 0.5, y: car.ty + 0.5, icon: 'lift', color: '#cfe1f3' }, ...this.markers.filter(m => !m.dest && m.item?.due).map(m => ({ x: m.x, y: m.y, icon: m.icon, color: m.color, frac: m.frac }))];
      if (ld) cm.push({ x: ld.x, y: ld.y, icon: ld.icon, color: ROUTE, main: true, txt: Math.round(this.route ? this.route.len * this.TS : 0) + 'm' });
      this.compass.draw({ yaw: this.P.yaw, px: f.x, py: f.y, markers: cm });
      this.legend.classList.toggle('on', (G.time || 0) < 150); if (this.legend.classList.contains('on')) { const r = this.card.getBoundingClientRect(); this.legend.style.top = (r.bottom + 4) + 'px'; }
    }
    w.setGuide?.(this.route, this.t, ld ? { tx: ld.tx, ty: ld.ty, key: ld.icon, canvas: this.beacon(ld.icon) } : null);
  }
  layerFor(d, explored, sc, dim) {
    let n = 0; if (explored) for (let i = 0; i < explored.length; i++) n += explored[i];
    const k = `${d.deck}:${sc.toFixed(2)}:${dim ? 1 : 0}`, c = this.layers.get(k);
    if (c && (c.n === n || this.t - c.at < 0.5)) return c.cv;
    const cv = bakeDeck(d, explored, sc, { dim, canvas: c?.cv }); this.layers.set(k, { cv, n, at: this.t }); return cv;
  }
  drawMini(mm, f, ld) {
    const w = this.world, sc = mm.width / 26, G = this.G, car = w.car || { tx: w.d.exit[0], ty: w.d.exit[1] };
    drawLocal(mm.getContext('2d'), { d: w.d, layer: this.layerFor(w.d, w.explored, sc), explored: w.explored, sc, px: f.x, py: f.y, yaw: this.P.yaw, rot: this.P.yaw, route: this.route, dest: ld, markers: this.markers, t: this.t, lift: { x: car.tx + 0.5, y: car.ty + 0.5 }, liftOk: !G.fx?.liftLocked });
  }
  beacon(icon) {
    if (this.beacons[icon]) return this.beacons[icon];
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(5,10,16,.85)'; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill(); g.strokeStyle = ROUTE; g.lineWidth = 7; g.stroke(); drawIcon(g, icon, 64, 64, 68, '#fff', 2.4);
    return (this.beacons[icon] = c);
  }

  // ---- M big map
  toggleMap(on = !this.mapOpen) {
    if (on === this.mapOpen) return; const G = this.G; this.mapOpen = on; this.map.classList.toggle('on', on);
    if (on) { this._pause = G.menuPause; G.menuPause = true; this._look = [this.P.yaw, this.P.pitch]; this.selDeck = G.shipDeck ?? 0; this.hover = null; this.vc = null; this.buildFind(); this.buildDecks(); this.drawMap();
      let last = 0; const loop = (now) => { if (!this.mapOpen) return; requestAnimationFrame(loop); if (now - last < 66) return; this.t += (now - (last || now)) / 1000; last = now; this.drawMap(); }; requestAnimationFrame(loop); }   // own 15 Hz loop: the world (and main's frame) may be paused
    else { G.menuPause = this._pause || false; if (this._look) [this.P.yaw, this.P.pitch] = this._look; this.map.querySelector('.tip').style.display = 'none'; this.map.querySelector('.vc').style.display = 'none'; }
  }
  selectDeck(i) { const n = this.decks()?.length || 1; this.selDeck = Math.max(0, Math.min(n - 1, i)); this.hover = null; this.buildDecks(); this.drawMap(); }
  find(type) {
    this.findType = this.findType === type ? null : type;
    if (this.findType) { const cur = this.G.shipDeck ?? 0, hit = (this.G.plan?.[type] || []).map(c => c.deck).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur))[0]; if (hit != null) this.selDeck = hit; }
    this.buildFind(); this.buildDecks(); this.drawMap();
  }
  buildFind() {
    const types = Object.keys(this.G.plan || {}).filter(t => t !== 'jefferies' && ROOMS[t]);
    this.findTypes = types; this.map.querySelector('.find').innerHTML = types.map(t => `<span data-t="${t}" class="${this.findType === t ? 'on' : ''}" title="${esc(label(t))}">${bdg(t, 24)}</span>`).join('');
  }
  buildDecks() {
    const decks = this.decks() || [], G = this.G, cur = G.shipDeck ?? 0, N = decks.length, pin = this.pin;
    const due = this.items.filter(i => i.due && i.room).map(i => ({ i, deck: (G.plan?.[i.room] || []).map(c => c.deck).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur))[0] }));
    this.map.querySelector('.decks').innerHTML = decks.map((d, i) => {
      const z = zoneOf(i / Math.max(1, N - 1)).label, has = this.findType && d.rooms.some(r => r.type === this.findType);
      const mk = due.filter(x => x.deck === i).map(x => { const s = this.status(x.i); return `<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="rgba(5,8,14,.8)" stroke="${s.color}" stroke-width="2.4"/><g transform="translate(5 5) scale(.58)" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="${ICONS[x.i.icon] || ICONS.dots}"/></g></svg>`; }).join('');
      return `<div class="dk ${i === cur ? 'cur' : ''} ${i === this.selDeck ? 'sel' : ''} ${has ? 'has' : ''}" style="--z:${ZCOL[z] || '#6f8fb8'}" data-d="${i}"><span>D${i + 1}</span><span class="z" style="color:${ZCOL[z] || '#6f8fb8'}">${z.slice(0, 4).toUpperCase()}</span><span class="mk">${i === cur ? ico('guide', 13, ROUTE) : ''}${this.dest?.deck === i ? ico('pin', 13, ROUTE) : ''}${mk}</span></div>`;
    }).join('');
  }
  drawMap() {
    const c = this.mapC, r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), W = Math.max(50, Math.round(r.width * dpr)), H = Math.max(50, Math.round(r.height * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const decks = this.decks(); if (!decks) return; const sel = this.selDeck, d = decks[sel], cur = sel === (this.G.shipDeck ?? 0), g = this.mapG, f = this.from();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    const ex = cur ? this.world.explored : this.G.shipDecks[sel]?.st?.explored || null, top = 40 * dpr, h2 = H - top - 36 * dpr;
    const pad = 1, bb = deckBounds(d), sc = Math.min(W / (bb.w + pad * 2), h2 / (bb.h + pad * 2), 48 * dpr);
    g.save(); g.translate(0, top);
    const leg = this.plan?.legs.find(l => l.kind === 'walk' && l.deck === sel), markers = cur ? this.markers : (this.dest?.deck === sel && this.dest.room ? [{ x: this.dest.room.x + this.dest.room.w / 2, y: this.dest.room.y + this.dest.room.h / 2, type: this.dest.type, frac: 1, color: ROUTE, pinned: true, dest: true }] : []);
    const gp = drawPlan(g, { d, w: W, h: h2, layer: this.layerFor(d, ex, sc, !cur), explored: ex, dim: !cur, route: leg?.route, dashed: !cur, player: cur ? { x: f.x, y: f.y, yaw: this.P.yaw } : null, markers, hot: this.findType ? { [this.findType]: 1 } : null, t: this.t, pad, maxSc: 48 * dpr });
    g.restore(); this.geo = { sc: gp.sc, ox: gp.ox, oy: gp.oy + top, dpr };
    this.map.querySelector('.note').innerHTML = cur ? '' : `${ico('log', 12)} D${sel + 1}`;
  }
  roomAt(cx, cy) { const G = this.geo, d = this.decks()?.[this.selDeck]; if (!G || !d) return null; const x = (cx * G.dpr - G.ox) / G.sc, y = (cy * G.dpr - G.oy) / G.sc; return d.rooms.find(r => r.type !== 'jefferies' && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null; }
  hoverAt(cx, cy) {
    const rm = this.roomAt(cx, cy), tip = this.map.querySelector('.tip'); this.hover = rm;
    if (!rm) { tip.style.display = 'none'; return; }
    if (this._tipRoom !== rm) { this._tipRoom = rm; const p = planRoute(this.G.plan, this.decks(), this.G.shipDeck ?? 0, this.from(), { deck: this.selDeck, tx: rm.x + (rm.w >> 1), ty: rm.y + (rm.h >> 1), type: rm.type }, { world: this.world, TS: this.TS });
      tip.innerHTML = `${bdg(rm.type, 22)}<b>${esc(label(rm.type))}</b>${p ? `<span class="nv-c">${p.rides ? ico('lift', 11) + 'D' + (this.selDeck + 1) + ' ' : ''}${Math.round(p.metres)}m ${fmt(p.eta)}</span>` : ''}`; }
    tip.style.display = 'flex'; tip.style.left = (cx + 14) + 'px'; tip.style.top = (cy + 14) + 'px';
  }
  clickAt(cx, cy) { const rm = this.roomAt(cx, cy); if (!rm) return; this.pinRoom(this.selDeck, rm); this.toggleMap(false); }
  pinRoom(deck, rm) { return this.setPin({ kind: 'room', id: `${deck}:${rm.x},${rm.y}`, deck, tx: rm.x + (rm.w >> 1), ty: rm.y + (rm.h >> 1), type: rm.type, room: rm.type, label: label(rm.type), icon: rm.type }); }

  // ---- input (window capture: runs before main.js and the HUD modules)
  onKey(e) {
    if (!this.on() || this.G.phase !== 'play') return;
    if (this.mapOpen) {
      e.stopImmediatePropagation(); if (e.code !== 'Tab') e.preventDefault(); if (e.repeat) return;
      const dg = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (e.code === 'KeyM' || e.code === 'Escape') this.toggleMap(false);
      else if (dg) this.selectDeck(+dg[1] - 1);
      else if (e.code === 'BracketLeft' || e.code === 'ArrowUp' || e.code === 'KeyW') this.selectDeck(this.selDeck - 1);
      else if (e.code === 'BracketRight' || e.code === 'ArrowDown' || e.code === 'KeyS') this.selectDeck(this.selDeck + 1);
      else if (e.code === 'KeyG') { this.cycle(); this.buildDecks(); }
      else if (e.code === 'KeyL') { this.setPin({ kind: 'lift', id: 'lift', label: 'Nearest lift', icon: 'lift' }); this.toggleMap(false); }
      else if (e.code === 'KeyF') { const L = this.findTypes || [], i = L.indexOf(this.findType); this.find(L[(i + 1) % Math.max(1, L.length)] || null); }
      else if (e.code === 'Enter' && this.hover) { this.pinRoom(this.selDeck, this.hover); this.toggleMap(false); }
      return;
    }
    if (e.repeat || document.body.classList.contains('bd-menu-open')) return;
    if (e.code === 'KeyM') { e.stopImmediatePropagation(); this.toggleMap(true); }
    else if (e.code === 'KeyG' && !this.G.carry) { e.stopImmediatePropagation(); this.cycle(); }
  }
  onMouse(e) {
    if (!this.mapOpen || !this.locked()) return; e.stopImmediatePropagation();
    const r = this.map.getBoundingClientRect(); this.vc = this.vc || { x: r.width / 2, y: r.height / 2 };
    this.vc.x = Math.max(0, Math.min(r.width, this.vc.x + e.movementX)); this.vc.y = Math.max(0, Math.min(r.height, this.vc.y + e.movementY));
    const v = this.map.querySelector('.vc'); v.style.display = 'block'; v.style.left = (this.vc.x - this.mapC.getBoundingClientRect().left + r.left) + 'px'; v.style.top = (this.vc.y - this.mapC.getBoundingClientRect().top + r.top) + 'px';
    const cr = this.mapC.getBoundingClientRect(); this.hoverAt(this.vc.x + r.left - cr.left, this.vc.y + r.top - cr.top);
  }
  onDown(e) {
    if (!this.mapOpen) return; if (!this.locked()) return;   // unlocked: normal DOM clicks
    e.stopImmediatePropagation(); e.preventDefault(); if (!this.vc) return;
    const r = this.map.getBoundingClientRect(), x = this.vc.x + r.left, y = this.vc.y + r.top, el = document.elementFromPoint(x, y);
    if (el === this.mapC) { const cr = this.mapC.getBoundingClientRect(); this.clickAt(x - cr.left, y - cr.top); } else el?.closest('[data-t],[data-d]')?.click();
  }
  poll() {
    if (!this.on()) return;
    if (this.mapOpen && this.G.phase !== 'play') this.toggleMap(false);
    const card = document.querySelector('#bd-brief.show .card'); if (card && !card.querySelector('.nv-brief')) this.brief(card);
  }

  // ---- briefing flythrough: duty stations of this deck as numbered badges, the rest as lift chips
  brief(card) {
    const G = this.G, decks = this.decks(), w = this.world; if (!decks || !w || !G.duty) return null;
    const cur = G.shipDeck ?? 0, lt = liftTile(w.d), types = [...new Set([...G.duty.loops.map(l => l.room), ...G.duty.tasks.map(t => t.room)].filter(r => r && r !== 'any'))];
    const stations = [], away = [];
    for (const type of types) { const p = planRoute(G.plan, decks, cur, { x: lt[0] + 0.5, y: lt[1] + 0.5 }, { type }, { TS: this.TS }); if (!p) continue; if (p.dest.deck === cur) stations.push({ type, tx: p.dest.tx, ty: p.dest.ty }); else away.push({ type, deck: p.dest.deck }); }
    return (this.briefView = mountBrief(card, { d: w.d, stations, away, deckNo: cur + 1 }));
  }

  // ---- Tab: systems schematic
  renderStatus(el) {
    const G = this.G, S = G.shipState; if (!S || !el || !this.on()) return false;
    const here = {}; for (const r of this.c.repairPts || []) here[r.sys] = `${r.where} · ${Math.round(Math.hypot(r.x - this.P.x, r.z - this.P.z))} m`;
    const ppl = G.roster?.people || [], cnt = (s) => ppl.filter(p => p.status === s).length, N = G.ship.decks;
    el.innerHTML = schematicHTML(S, { here, head: `<span><b>${esc(G.ship.name)}</b> ${esc(G.ship.reg)} · D${(G.shipDeck ?? 0) + 1}/${N} · ${esc(zoneOf((G.shipDeck ?? 0) / Math.max(1, N - 1)).label)}</span>`, foot: `crew ${ppl.length} · ${cnt('dead') + cnt('corpse')} dead · ${cnt('crazed')} crazed · ${cnt('evacuated')} evacuated · hold Tab` });
    return true;
  }
}
export const _test = { ring, legendHTML, WALK };
