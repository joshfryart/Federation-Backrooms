// Work-site jobs in the world (Systems Nominal): glowing site markers, a dirt decal that fades as you scrub, a scan fan while you sweep, a nav pin
// on the next site and an LCARS checklist panel. Logic is js/worksites.js (createSiteRun); main.js startJob() starts a run, interact() hands
// it E presses (press()), nomTick() calls tick(dt) and shows hint() on the duty hint line.
//   const W = new WorkSites({ THREE, G, P, keys, scene, world: () => world, TS, CFG, sound })
//   W.start(it, def, { seed, apply(outcome), cancelled() }) -> { ok, sites }     W.tick(dt)     W.press() -> true if E was for a site
//   W.cancel(why)   W.active   W.run   W.at (site index in reach, -1)   W.hint()   W.inputOverride (tests: { at?, hold, press, look, wipe })
// Item in hand: def.item (any of). On the belt but not in hand -> the first E at a site takes it out (auto-equip). Not on the belt -> a fetch
// site at the room's supply point comes first; E there issues one. Calm visuals: no pulsing. Colour-blind: done = blue, faults amber.
import { createSiteRun, resolveSites, ACTS, siteRushNote } from './worksites.js';
import { HANDHELDS, newInstance, isBroken } from './handhelds.js';
import { resolveJobSites, jobRun } from './jobs/host.js';   // a job's own in-room mechanic (js/jobs/, opts.mod): same markers / checklist / item handling

const DEPT_COL = { medical: '#3fd6a0', engineering: '#e8892b', science: '#c58be0', security: '#ff7a6b', galley: '#c6d25e', cargo: '#d6c85a', flight: '#8fb7ff', bridge: '#6ea8ff', ops: '#b99be6', command: '#6ea8ff', operations: '#b99be6', sciences: '#c58be0', services: '#c6d25e' };
const CSS = `#wsite{position:fixed;left:.875rem;top:30%;z-index:14;width:15.5rem;display:none;pointer-events:none;color:var(--k-ink,#f3eee6);font:600 .8rem/1.35 var(--f-d,Arial,sans-serif);
  border-left:.85rem solid var(--kc,#f0933a);border-top:.5rem solid var(--kc,#f0933a);border-bottom:.5rem solid var(--k-lav,#b99be6);border-radius:1.4rem 0 0 1.4rem;background:var(--k-plate,rgba(6,8,16,.8));padding:.55rem .7rem .55rem .65rem;box-shadow:0 0 18px rgba(0,0,0,.45)}
#wsite.on{display:block}
#wsite .ws-h{display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem}#wsite .ws-h .k-pill{background:var(--kc,#f0933a);color:#120a05;border-radius:99px;padding:.1em .7em;font:800 .62rem/1.3 var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase}
#wsite .ws-t{font:800 .95rem var(--f-d,Arial);letter-spacing:.06em;text-transform:uppercase;color:#fff}
#wsite .ws-item{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--k-dim,#a8a6b9);margin:.15rem 0 .35rem}#wsite .ws-item b{color:var(--k-gold,#f4c25b)}#wsite .ws-item.need b{color:var(--m-warn,#ffb347)}
#wsite ol{list-style:none;margin:0;padding:0;display:grid;gap:.18rem}#wsite li{display:grid;grid-template-columns:1.1rem 1fr auto;gap:.35rem;align-items:center;padding:.12rem .45rem;border-radius:99px;background:rgba(255,255,255,.05);font-size:.74rem}
#wsite li i{width:.8rem;height:.8rem;clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%);background:#556}#wsite li.next{background:rgba(240,147,58,.18);box-shadow:inset 0 0 0 1px var(--kc,#f0933a)}#wsite li.next i{background:var(--kc,#f0933a)}
#wsite li.done{opacity:.7}#wsite li.done i{background:var(--ok,#4fd18b)}#wsite li em{font-style:normal;font:700 .68rem var(--f-m,monospace);color:var(--k-dim,#a8a6b9)}#wsite li.done em{color:var(--ok,#4fd18b)}
#wsite .ws-m{margin:.45rem 0 .2rem;min-height:1.6rem}#wsite .ws-ml{display:flex;justify-content:space-between;font:800 .6rem var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:var(--k-peri,#7d97e8)}
#wsite .ws-bar{position:relative;height:.62rem;border-radius:.31rem;background:rgba(255,255,255,.1);overflow:hidden;margin-top:.15rem}#wsite .ws-bar b{position:absolute;inset:0 auto 0 0;background:var(--m-info,#8fd8ff)}
#wsite .ws-bar::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(5% - 2px),#05060b calc(5% - 2px) 5%)}#wsite .ws-bar s{position:absolute;top:0;bottom:0;background:rgba(79,209,139,.45);box-shadow:inset 0 0 0 1px var(--ok,#4fd18b)}
#wsite .ws-bar u{position:absolute;top:-2px;bottom:-2px;width:3px;background:#fff;z-index:2}#wsite .ws-pips{display:flex;gap:.25rem;margin-top:.2rem}#wsite .ws-pips span{width:.9rem;height:.9rem;border-radius:.2rem;border:2px solid var(--k-gold,#f4c25b)}#wsite .ws-pips span.on{background:var(--k-gold,#f4c25b)}
#wsite .ws-f{display:flex;justify-content:space-between;margin-top:.35rem;font:800 .6rem var(--f-d,Arial);letter-spacing:.14em;text-transform:uppercase;color:var(--k-dim,#a8a6b9)}#wsite .ws-f .bad{color:var(--m-warn,#ffb347)}
body.cb #wsite{--ok:#4f9dff}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const REACH = 2.35;

export class WorkSites {
  constructor(o) {
    Object.assign(this, o); this.run = null; this.job = null; this.at = -1; this.pressed = false; this.marks = []; this.lastYaw = null; this.lastPitch = null; this.wipe = 0; this.turn = 0; this.inputOverride = null; this.log = [];
    if (typeof document === 'undefined') return;
    if (!document.getElementById('wsite-css')) { const st = document.createElement('style'); st.id = 'wsite-css'; st.textContent = CSS; document.head.appendChild(st); }
    let el = document.getElementById('wsite'); if (!el) { el = document.createElement('div'); el.id = 'wsite'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    this.el = el;
  }
  get active() { return !!this.run && this.run.state === 'work'; }
  get world() { return this.getWorld(); }
  note(t) { this.log.push(t); if (this.log.length > 30) this.log.shift(); }
  // the room instance of the job's type the player is in (else the nearest on this deck)
  roomRect(type) {
    const w = this.world, d = w?.d; if (!d) return null; const [tx, ty] = w.tile(this.P.x, this.P.z);
    let best = null, bd = 1e9; for (const r of d.rooms) { if (r.type !== type) continue; const inside = tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h; const dd = inside ? -1 : Math.hypot(r.x + r.w / 2 - tx, r.y + r.h / 2 - ty); if (dd < bd) { bd = dd; best = r; } }
    return best;
  }
  hasItem() { const d = this.run?.def || this.job?.def; if (!d?.item?.length) return true; const it = this.G.kit?.inst; return !!it && d.item.includes(it.id) && !isBroken(it); }
  onBelt(def) { return (this.G.kit?.belt || []).findIndex(b => def.item.includes(b.id) && !isBroken(b)); }
  itemName(def) { const id = (this.run?.def === def && this.run.item) || def.item?.[0]; return id ? HANDHELDS[id]?.name || id : ''; }

  start(it, def, opts = {}) {
    if (this.active) return { ok: false, why: `Finish ${this.run.def.name.toLowerCase()} first (J: stop working)` };
    const w = this.world, rect = this.roomRect(it.room); if (!w || !rect) return { ok: false, why: `Do this in the ${it.room}` };
    if (opts.mod) return this.startJob(it, opts.mod, opts, w, rect);
    const seed = opts.seed || 1, fetch = def.item.length > 0 && this.onBelt(def) < 0, d = w.d;
    const sites = resolveSites(def, { rect, props: d.props, free: (tx, ty) => d.grid[ty]?.[tx] === 0 }, seed, { fetch, variant: opts.variant });
    if (!sites.length) return { ok: false, why: 'no room to work' };
    this.job = { it, def, opts, rect, world: w, label: it.label || it.task }; this.run = createSiteRun(def, seed, sites, { calm: !!this.CFG?.calm, variant: opts.variant });
    this.at = -1; this.pressed = false; this.lastYaw = null; this.anchor = null; this.buildMarks(); this.render(true); this.el?.classList.add('on'); this.pinNext();
    const first = this.run.sites[0]; this.G.say?.(`${def.name}: ${sites.filter(s => s.act !== 'fetch' && !s.hub).length} ${def.site.toLowerCase()}s marked${def.item.length ? ` · needs a ${this.itemName(def)}${fetch ? ' (draw one at the marked supply point)' : ''}` : ''}. ${def.how}`, 'good');
    this.sound?.tone?.(660, 0.08, 'sine', 0.06); this.note(`start ${def.id} ${sites.length}${fetch ? ' fetch' : ''}`); void first;
    return { ok: true, sites: sites.length, fetch };
  }
  // a job module's in-room mechanic (js/jobs/): its sites resolved to room props / floor, its game wrapped as a run (js/jobs/host.js)
  startJob(it, mod, opts, w, rect) {
    const seed = opts.seed || 1, d = w.d, game = mod.create(seed, { calm: !!this.CFG?.calm, cb: !!this.CFG?.cb, label: it.label || it.task }), fetch = !!mod.item && this.onBelt({ item: [mod.item] }) < 0;
    const sites = resolveJobSites(game, { rect, props: d.props, free: (tx, ty) => d.grid[ty]?.[tx] === 0 }, seed, { fetch }); if (!sites.length) return { ok: false, why: 'no room to work' };
    this.run = jobRun(mod, game, sites); this.job = { it, def: this.run.def, opts, rect, world: w, label: it.label || it.task };
    this.at = -1; this.pressed = false; this.lastYaw = null; this.anchor = null; this.buildMarks(); this.render(true); this.el?.classList.add('on'); this.pinNext();
    this.G.say?.(`${mod.title}: ${game.sites.length} marked${mod.item ? ` · needs a ${this.itemName(this.run.def)}${fetch ? ' (draw one at the marked supply point)' : ''}` : ''}. ${mod.how}`, 'good');
    this.sound?.tone?.(660, 0.08, 'sine', 0.06); this.note(`start job ${mod.id} ${sites.length}${fetch ? ' fetch' : ''}`);
    return { ok: true, sites: sites.length, fetch };
  }
  // E went down: true if it was meant for a site (main.js interact() asks first)
  press() { if (!this.active || this.at < 0) return false; this.pressed = true; return true; }
  wants() { return this.active && this.at >= 0; }
  cancel(why = '') { if (!this.run) return; const j = this.job; this.run.cancel(); this.cleanup(); this.note('cancel ' + why); try { j?.opts.cancelled?.(why); } catch (e) { console.warn(e); } }
  cleanup() {
    for (const m of this.marks) { this.scene.remove(m.g); m.g.traverse(o => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } }); }
    if (this.fan) { this.scene.remove(this.fan); this.fan.geometry.dispose(); this.fan.material.dispose(); this.fan = null; }
    this.marks = []; this.el?.classList.remove('on'); if (this.el) this.el.innerHTML = '';
    const N = this.G.nav; if (N?.pin?.kind === 'site') { N.setPin(null, false); N.pins.cleared = false; }
    this.run = null; this.job = null; this.at = -1;
  }
  pinNext() {
    const N = this.G.nav, r = this.run; if (!N?.setPin || !r) return; const i = r.next, s = r.sites[i]; if (!s) return;
    N.setPin({ kind: 'site', id: 'site' + i, deck: this.G.shipDeck ?? 0, tx: s.tx, ty: s.ty, type: this.job.it.room, label: s.name, icon: 'do' }, false);
  }

  // ---- per frame (world not paused)
  tick(dt) {
    const r = this.run; if (!r) return; const G = this.G, P = this.P;
    if (r.state !== 'work') return;
    if (['dead', 'dying', 'end', 'title'].includes(G.phase) || this.world !== this.job.world) { this.cancel('left'); G.say?.(`Stopped: ${this.job?.label || 'the job'} is still due.`); return; }
    if (G.phase !== 'play') return;
    const w = this.world, [ptx, pty] = w.tile(P.x, P.z), R = this.job.rect, away = !(ptx >= R.x - 1 && ptx < R.x + R.w + 1 && pty >= R.y - 1 && pty < R.y + R.h + 1);
    // look motion (scrub strokes): view turn speed, smoothed
    if (this.lastYaw != null && dt > 0) { const v = (Math.abs(wrap(P.yaw - this.lastYaw)) + Math.abs((P.pitch || 0) - (this.lastPitch || 0))) / dt; this.wipe += (v - this.wipe) * Math.min(1, dt * 8); this.turn += (Math.abs(wrap(P.yaw - this.lastYaw)) / dt - this.turn) * Math.min(1, dt * 10); this.swing = (this.swing || 0) + (wrap(P.yaw - this.lastYaw) / dt - (this.swing || 0)) * Math.min(1, dt * 10); }
    this.lastYaw = P.yaw; this.lastPitch = P.pitch || 0;
    // which site is in reach and in view (the next one wins)
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let at = -1, bd = 1e9;
    r.sites.forEach((s, i) => { if (s.done) return; const [cx, cz] = w.center(s.tx, s.ty), dx = cx - P.x, dz = cz - P.z, d = Math.hypot(dx, dz), facing = (dx * fx + dz * fz) / (d || 1); if (d > REACH || (d > 1.1 && facing < 0.35)) return; const sc = d - (i === r.next ? 1 : 0); if (sc < bd) { bd = sc; at = i; } });
    let inp;
    if (this.inputOverride) inp = { ...this.inputOverride, at: this.inputOverride.at ?? at };
    else {   // scan: the hidden reading is a bearing relative to where you first faced the site (stable even standing on a floor site)
      const s = r.sites[at]; if (at < 0) this.anchor = null; else if (!this.anchor || this.anchor.i !== at) { const [cx, cz] = w.center(s.tx, s.ty), d = Math.hypot(cx - P.x, cz - P.z); this.anchor = { i: at, yaw: d > 0.9 ? Math.atan2(-(cx - P.x), -(cz - P.z)) : P.yaw }; }
      if (this.pressed && s?.act === 'scrub') this.wipe = Math.max(this.wipe, 1.6);   // keyboard-only: re-tapping E scrubs too (arrow keys turn the view as well)
      inp = { at, hold: !!this.keys.KeyE && at >= 0, press: this.pressed, look: this.anchor ? wrap(P.yaw - this.anchor.yaw) : 0, wipe: this.wipe, turn: this.turn, swing: this.swing || 0 }; }
    inp.hasItem = inp.hasItem ?? this.hasItem(); inp.away = away; this.pressed = false; this.at = inp.at ?? at;
    const before = r.sites.map(s => s.done), f0 = r.faults, e = r.step(dt, inp);
    if (e) this.onEvent(e);
    if (r.faults > f0 && r.mech) { const why = r.events.filter(x => x.type === 'fault').slice(-1)[0]?.why; this.sound?.denied?.(); this.G.caption?.(r.mech.captions?.[why] || 'fault buzz'); this.G.say?.(r.mech.says?.[why] || `Fault: ${why}.`, 'warn'); }
    else if (r.faults > f0) { const why = r.events.filter(x => x.type === 'fault').slice(-1)[0]?.why; this.sound?.denied?.(); this.G.caption?.(why === 'miscount' ? 'wrong count buzz' : why === 'misread' ? 'wrong call buzz' : why === 'over' ? 'over-limit buzz' : why === 'loose' ? 'gauge drops back' : 'fault buzz'); this.G.say?.(why === 'miscount' ? 'Miscount — start that one again.' : why === 'misread' ? 'Wrong call — check the spec plate and read it again.' : why === 'over' ? 'Too far — let go sooner.' : why === 'loose' ? 'Still loose — turn it further before you let go.' : 'Too soon — hold a little longer.', 'warn'); }
    const fresh = r.sites.findIndex((s, i) => s.done && !before[i]);
    if (fresh >= 0) { const s = r.sites[fresh]; this.sound?.chip?.(); this.G.caption?.('chime'); if (r.state === 'work') { this.G.say?.(`${s.name}: done (${r.sites.filter(x => x.done).length}/${r.sites.length}).`, 'good'); this.pinNext(); } }
    this.updateMarks(dt); this.render();
    if (r.state !== 'work') this.finish();
  }
  onEvent(e) {
    const G = this.G, r = this.run, def = r.def, K = G.kit;
    if (e.type === 'lift') { this.sound?.pickup?.(); this.G.caption?.('load lifted'); G.say?.(`Lifted. Carry it to ${r.sites[r.next]?.name || 'the marked spot'} and hold [E] to set it down.`, 'good'); this.pinNext(); return; }
    if (e.type === 'drop') { this.sound?.tone?.(440, 0.06, 'sine', 0.05); this.G.caption?.('load set down'); this.pinNext(); return; }
    if (e.type === 'needItem') {
      const i = this.onBelt(def); if (i >= 0 && K) { K.hand = i; G.say?.(`You take the ${HANDHELDS[K.belt[i].id].name} off your belt. [E] ${def.verb.toLowerCase()}.`, 'good'); this.sound?.pickup?.(); }
      else { const f = r.sites.findIndex(s => s.act === 'fetch'); G.say?.(`You need a ${this.itemName(def)}${f >= 0 ? ' — the supply point is marked' : ''}.`, 'warn'); }
    } else if (e.type === 'fetch') {
      const id = r.item || def.item[0], inst = newInstance(id, (G.runSeed || 1) + 77); if (K) { if (!K.add(inst)) { const j = K.belt.findIndex(b => b.id !== 'commbadge'); K.belt[j >= 0 ? j : K.belt.length - 1] = inst; K.hand = j >= 0 ? j : K.belt.length - 1; } }
      r.fetched(); this.sound?.pickup?.(); G.say?.(`Issued: ${HANDHELDS[id].name} (in hand). Now the ${def.site.toLowerCase()}s.`, 'good'); this.pinNext();
    } else if (e.type === 'blocked') G.say?.(e.why === 'fetch' ? `Draw the ${this.itemName(def)} at the supply point first.` : e.why === 'hands' ? `Your hands are full — set the load down at ${r.sites[r.next]?.name || 'a marked spot'} first.` : e.why === 'empty' ? `Nothing to set down — lift a load at ${r.sites[r.next]?.name || 'the marked point'} first.` : `${r.sites[r.next]?.name || 'The next site'} first — follow the marker.`, 'warn');
  }
  finish() {
    const r = this.run, j = this.job, res = r.outcome(); this.note(`done ${r.def.id} ${r.state} ${res?.quality}`);
    if (r.state === 'win' && !this.CFG?.calm) this.sound?.chip?.(); this.cleanup();
    if (res) try { j.opts.apply?.(res, r.result()); } catch (e) { console.warn(e); }
  }
  hint() {
    const r = this.run; if (!r || r.state !== 'work') return ''; const s = r.sites[this.at], nx = r.sites[r.next];
    if (!s) return `${r.def.name}: go to ${nx?.name || 'the next site'} (marked) · ${r.left} left · [J] stop working`;
    if (s.act === 'fetch') return `[E] draw a ${this.itemName(r.def)} here`;
    if (!this.hasItem()) return `[E] take the ${this.itemName(r.def)} off your belt`;
    if (r.mech) return `${r.prompt(this.at)} · ${s.name}`;
    return { scrub: `Hold [E] and swing your view back and forth — ${s.name}`, scan: `Hold [E] and sweep your view slowly — lock the peak · ${s.name}`, timing: `Hold [E] to charge, let go in the band · ${s.name}`, count: `Tap [E] ${s.n}× then pause · ${s.name}`,
      turn: `Hold [E] and turn your view to crank, let go in the band · ${s.name}`, carry: s.role === 'pick' ? `[E] lift a load · ${s.name}` : s.n != null ? `Tap [E] ${s.n}× to count it in, then pause · ${s.name}` : `Hold [E] to set it down · ${s.name}`,
      read: !s.read ? '' : s.settle < s.need ? `Reading… stay on it · ${s.name}` : `Tap [E]: ${(r.def.calls || ['in limits'])[0].toLowerCase()} · hold [E]: ${(r.def.calls || [, 'out of limits'])[1].toLowerCase()} · ${s.read.txt}` }[s.act] || '';
  }

  // ---- 3D markers (procedural: rings, beams, number tags, grime decals, scan fan)
  colour() { return this.DEPT || DEPT_COL[this.run.def.dept] || '#f0933a'; }
  tagTex(s, i) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'), T = new this.THREE.CanvasTexture(cv); T.colorSpace = this.THREE.SRGBColorSpace; return { cv, c, T, key: '' };
  }
  drawTag(m, s, i, next) {
    const key = `${s.done}|${next}|${Math.round(s.prog * 20)}|${s.c ?? ''}|${s.n ?? ''}|${this.CFG?.cb ? 1 : 0}|${this.run?.carrying ? 1 : 0}`; if (m.tag.key === key) return; m.tag.key = key;
    const c = m.tag.c, col = s.done ? (this.CFG?.cb ? '#4f9dff' : '#4fd18b') : next ? this.colour() : '#8fa0b6'; c.clearRect(0, 0, 128, 128);
    c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); } c.closePath(); c.fillStyle = 'rgba(5,8,16,.85)'; c.fill(); c.lineWidth = 6; c.strokeStyle = col; c.stroke();
    c.beginPath(); c.arc(64, 64, 54, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, s.prog) * Math.PI * 2); c.lineWidth = 7; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.font = '800 40px Arial Narrow, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(s.done ? '✓' : s.act === 'fetch' ? '+' : s.hub ? (s.role === 'pick' ? '▲' : '▼') : String(this.run.sites.filter(x => x.act !== 'fetch' && !x.hub).indexOf(s) + 1), 64, 66);
    if (s.hub && !s.done) { for (let k = 0; k < s.trips; k++) { c.fillStyle = k < s.c ? '#f4c25b' : 'rgba(244,194,91,.25)'; c.fillRect(64 - s.trips * 9 + k * 18 + 2, 104, 14, 14); } }
    if ((s.act === 'count' || (s.act === 'carry' && s.n != null)) && !s.done) { for (let k = 0; k < s.n; k++) { c.fillStyle = k < s.c ? '#f4c25b' : 'rgba(244,194,91,.25)'; c.fillRect(64 - s.n * 9 + k * 18 + 2, 104, 14, 14); } }
    m.tag.T.needsUpdate = true;
  }
  grimeTex(seed) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); let a = seed >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let k = 0; k < 26; k++) { const x = 20 + rnd() * 88, y = 20 + rnd() * 88, r = 6 + rnd() * 22, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${60 + rnd() * 40 | 0},${48 + rnd() * 30 | 0},${30 + rnd() * 20 | 0},${0.5 + rnd() * 0.4})`); g.addColorStop(1, 'rgba(40,30,20,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    const T = new this.THREE.CanvasTexture(cv); T.colorSpace = this.THREE.SRGBColorSpace; return T;
  }
  buildMarks() {
    const THREE = this.THREE, w = this.world, col = new THREE.Color(this.colour());
    const add = (o) => { o.material.transparent = true; o.material.depthWrite = false; o.renderOrder = 6; return o; };
    this.marks = this.run.sites.map((s, i) => {
      const [cx, cz] = w.center(s.tx, s.ty), g = new THREE.Group(); g.position.set(cx, 0, cz); g.userData.worksite = i;
      const big = s.prop ? 1.05 : 0.6, ring = add(new THREE.Mesh(new THREE.RingGeometry(big, big + 0.1, 48), new THREE.MeshBasicMaterial({ color: col, blending: THREE.AdditiveBlending, opacity: 0.85, side: THREE.DoubleSide }))); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
      const beam = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, blending: THREE.AdditiveBlending, opacity: 0.3 }))); beam.position.y = 1.3; g.add(beam);
      const tag = this.tagTex(s, i), spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag.T, transparent: true, depthWrite: false, depthTest: false })); spr.scale.set(0.5, 0.5, 1); const top = w.topAt?.(s.tx, s.ty); spr.position.y = (isFinite(top) && top < 2.2 ? top : 1.1) + 0.75; spr.renderOrder = 7; g.add(spr);
      let grime = null; if (s.act === 'scrub') { grime = add(new THREE.Mesh(new THREE.PlaneGeometry(s.prop ? 1.4 : 1.6, s.prop ? 1.4 : 1.6), new THREE.MeshBasicMaterial({ map: this.grimeTex(i * 97 + 13), opacity: 0.95 }))); grime.rotation.x = -Math.PI / 2; grime.position.y = isFinite(top) && top < 1.6 && s.prop ? top + 0.015 : 0.02; g.add(grime); }
      this.scene.add(g); return { g, ring, beam, spr, tag, grime, t: i * 0.7 };
    });
    const fan = add(new THREE.Mesh(new THREE.CircleGeometry(1.6, 24, -0.35, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fd8ff'), blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide }))); fan.visible = false; this.fan = fan; this.scene.add(fan);
  }
  updateMarks(dt) {
    const r = this.run, calm = !!this.CFG?.calm, done = new this.THREE.Color(this.CFG?.cb ? '#4f9dff' : '#4fd18b'), dim = new this.THREE.Color('#8fa0b6'), col = new this.THREE.Color(this.colour());
    r.sites.forEach((s, i) => {
      const m = this.marks[i]; if (!m) return; m.t += dt; const next = i === r.next && !s.done, pulse = calm ? 1 : 1 + Math.sin(m.t * 4) * 0.06;
      m.ring.material.color.copy(s.done ? done : next ? col : dim); m.ring.material.opacity = s.done ? 0.35 : next ? 0.95 : 0.45; m.ring.scale.setScalar(next ? pulse : 1);
      m.beam.visible = !s.done; m.beam.material.opacity = next ? 0.34 : 0.1; m.beam.material.color.copy(next ? col : dim);
      if (m.grime) m.grime.material.opacity = 0.95 * (1 - s.prog);
      this.drawTag(m, s, i, next);
    });
    const s = r.sites[this.at], P = this.P, scanning = s && s.act === 'scan' && !s.done && (this.keys.KeyE || this.inputOverride?.hold);
    if (this.fan) { this.fan.visible = !!scanning; if (scanning) { this.fan.position.set(P.x, 1.05, P.z); this.fan.rotation.set(-Math.PI / 2, 0, P.yaw + Math.PI / 2); this.fan.material.opacity = 0.08 + 0.3 * s.sig; } }
  }

  // ---- LCARS checklist (left edge)
  render(full = false) {
    const el = this.el, r = this.run; if (!el || !r) return; const def = r.def, s = r.sites[this.at] || null, cur = s && !s.done ? s : null;
    el.style.setProperty('--kc', this.colour());
    const key = r.sites.map(x => x.done ? 1 : 0).join('') + '|' + r.next + '|' + this.hasItem() + '|' + this.at;
    if (full || key + '|' + r.carrying !== this._key) {
      this._key = key + '|' + r.carrying; const need = def.item.length && !this.hasItem();
      el.innerHTML = `<div class="ws-h"><span class="k-pill">${r.mech ? 'Job' : 'Work site'}</span><span class="ws-t">${esc(def.name)}</span></div>
        <div class="ws-item${need ? ' need' : ''}">${def.item.length ? `Item · <b>${esc(this.itemName(def))}</b> ${this.hasItem() ? '· in hand' : this.onBelt(def) >= 0 ? '· on belt ([E] takes it)' : '· draw at supply'}` : 'Item · hands'} · ${esc(ACTS[def.act] || def.verb)}${def.act === 'carry' ? ` · ${r.carrying ? '<b>carrying</b>' : 'hands free'}` : ''}</div>
        <ol>${r.sites.map((x, i) => `<li class="${x.done ? 'done' : i === r.next ? 'next' : ''}"><i></i><span>${esc(x.name)}</span><em data-p="${i}">${x.done ? 'OK' : Math.round(x.prog * 100) + '%'}</em></li>`).join('')}</ol>
        <div class="ws-m"></div><div class="ws-f"><span class="ws-fl"></span><span class="ws-tm"></span></div>`;
    }
    r.sites.forEach((x, i) => { const e = el.querySelector(`[data-p="${i}"]`); if (e && !x.done) e.textContent = Math.round(x.prog * 100) + '%'; });
    const m = el.querySelector('.ws-m'); if (m) {
      const lbl = (a, b) => `<div class="ws-ml"><span>${a}</span><span>${b}</span></div>`;
      const jp = cur && r.mech && cur.act !== 'fetch' ? r.panel(this.at) : null;
      if (jp) m.innerHTML = lbl(esc(jp.label || def.verb), esc(jp.value ?? '')) + `<div class="ws-bar">${jp.band ? `<s style="left:${jp.band[0] * 100}%;width:${(jp.band[1] - jp.band[0]) * 100}%"></s>` : ''}<b style="width:${Math.round(Math.max(0, Math.min(1, jp.bar || 0)) * 100)}%"></b></div>`;
      else if (!cur) m.innerHTML = lbl('Next', esc(r.sites[r.next]?.name || '—')) + `<div class="ws-bar"><b style="width:${Math.round((1 - r.left / r.sites.length) * 100)}%"></b></div>`;
      else if (cur.act === 'scan') m.innerHTML = lbl('Signal', cur.sig > 0.8 ? 'peak — hold' : cur.sig > 0.4 ? 'warmer' : 'sweep') + `<div class="ws-bar"><b style="width:${Math.round(cur.sig * 100)}%"></b></div><div class="ws-bar"><b style="width:${Math.round(cur.prog * 100)}%;background:var(--ok,#4fd18b)"></b></div>`;
      else if (cur.act === 'turn') m.innerHTML = lbl(def.verb, `${cur.hits}/${cur.need}`) + `<div class="ws-bar"><s style="left:${cur.band[0] * 100}%;width:${(cur.band[1] - cur.band[0]) * 100}%"></s><b style="width:${Math.round(cur.m * 100)}%;background:var(--k-gold,#f4c25b)"></b><u style="left:${cur.m * 100}%"></u></div>`;
      else if (cur.act === 'read') { const R = cur.read, ok = cur.settle >= cur.need, num = R.lo != null && R.hi != null && typeof R.v === 'number', lo = num ? Math.min(R.lo, R.v) - (R.hi - R.lo) * 0.3 : 0, hi = num ? Math.max(R.hi, R.v) + (R.hi - R.lo) * 0.3 : 1, X = (v) => Math.round((v - lo) / (hi - lo || 1) * 100), jit = ok || this.CFG?.calm ? 0 : (Math.sin(r.t * 23) * 6);
        m.innerHTML = lbl(def.verb, ok ? esc(R.txt) : 'settling…') + (num ? `<div class="ws-bar"><s style="left:${X(R.lo)}%;width:${X(R.hi) - X(R.lo)}%"></s><u style="left:${Math.max(0, Math.min(100, X(R.v) + jit))}%"></u></div>` : '') + `<div class="ws-ml"><span>tap [E] ${esc((def.calls || [])[0] || '')}</span><span>hold [E] ${esc((def.calls || [])[1] || '')}</span></div><div class="ws-bar"><b style="width:${Math.round(Math.min(1, cur.ht / 0.7) * 100)}%;background:var(--k-gold,#f4c25b)"></b></div>`; }
      else if (cur.act === 'carry' && cur.n != null && cur.role === 'drop') m.innerHTML = lbl(def.verb, `${cur.c} / ${cur.n}`) + `<div class="ws-pips">${Array.from({ length: cur.n }, (_, k) => `<span class="${k < cur.c ? 'on' : ''}"></span>`).join('')}</div>`;
      else if (cur.act === 'carry') m.innerHTML = lbl(cur.role === 'pick' ? 'Lift' : 'Set down', r.carrying ? 'carrying' : 'hands free') + `<div class="ws-bar"><b style="width:${Math.round((cur.role === 'drop' ? (cur.set || 0) / 0.6 : 0) * 100)}%"></b></div>`;
      else if (cur.act === 'timing') m.innerHTML = lbl(def.verb, `${cur.hits}/${cur.need}`) + `<div class="ws-bar"><s style="left:${cur.band[0] * 100}%;width:${(cur.band[1] - cur.band[0]) * 100}%"></s><b style="width:${Math.round(cur.m * 100)}%;background:var(--k-gold,#f4c25b)"></b><u style="left:${cur.m * 100}%"></u></div>`;
      else if (cur.act === 'count') m.innerHTML = lbl(def.verb, `${cur.c} / ${cur.n}`) + `<div class="ws-pips">${Array.from({ length: cur.n }, (_, k) => `<span class="${k < cur.c ? 'on' : ''}"></span>`).join('')}</div>`;
      else if (cur.act === 'scrub') m.innerHTML = lbl('Clean', this.wipe > 0.5 ? 'scrubbing' : 'move your view') + `<div class="ws-bar"><b style="width:${Math.round(cur.prog * 100)}%"></b></div>`;
      else m.innerHTML = lbl('Supply', '[E] draw');
    }
    const fl = el.querySelector('.ws-fl'), tm = el.querySelector('.ws-tm');
    if (fl) { fl.textContent = `Faults ${r.faults}/3`; fl.className = 'ws-fl' + (r.faults ? ' bad' : ''); } if (tm) tm.textContent = `${Math.max(0, Math.ceil(r.limit - r.t))} s`;
  }
}
export { siteRushNote };
