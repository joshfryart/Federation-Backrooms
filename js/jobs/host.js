// In-room host for job modules (docs/procedures.md): turns a room job's sites into tiles of the room and wraps the module's game in the run
// interface js/worksite-ui.js already drives (markers, nav pin, LCARS checklist, item in hand, fetch at a supply point). Pure logic.
//   resolveJobSites(game, ctx, seed, { fetch })  ctx: { rect, props: [{ kind, tx, ty }], free(tx, ty) } -> [{ tx, ty, kind, prop, name, act }]
//   jobRun(mod, game, sites)                     -> run { def, sites, next, left, faults, t, limit, state 'work'|'win'|'fail'|'cancel', events, item,
//                                                   step(dt, inp), fetched(), cancel(), result(), outcome(), hint(i, frame), bad(i, frame), mech, game }
import { mulberry32 } from '../data.js';
import { propName, SUPPLY } from '../worksites.js';

export function resolveJobSites(game, ctx, seed = 1, opts = {}) {
  const rnd = mulberry32(seed >>> 0), { rect, props = [], free = () => true } = ctx, inR = (p) => p.tx >= rect.x && p.tx < rect.x + rect.w && p.ty >= rect.y && p.ty < rect.y + rect.h;
  const mine = props.filter(inR), out = [], used = (x, y) => out.some(s => s.tx === x && s.ty === y), far = (x, y, d) => out.every(s => Math.hypot(s.tx - x, s.ty - y) >= d);
  const tiles = []; for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (free(x, y) && !mine.some(p => p.tx === x && p.ty === y)) tiles.push([x, y, rnd()]);
  tiles.sort((a, b) => a[2] - b[2]);
  for (const s of game.sites) {
    const p = mine.find(q => q.kind === s.prop && !used(q.tx, q.ty)); let o = p ? { tx: p.tx, ty: p.ty, kind: p.kind, prop: true } : null;
    if (!o) for (const d of [2, 1.2, 0]) { const t = tiles.find(([x, y]) => !used(x, y) && far(x, y, d)); if (t) { o = { tx: t[0], ty: t[1], kind: 'floor', prop: false }; break; } }
    if (!o) o = { ...(out[out.length - 1] || { tx: rect.x, ty: rect.y }), kind: 'floor', prop: false };
    out.push({ ...o, name: `${s.name}${o.prop && s.prop ? ' · ' + propName(o.kind) : ''}`, act: 'job' });
  }
  if (opts.fetch) {
    const sp = SUPPLY.map(k => mine.find(p => p.kind === k && !used(p.tx, p.ty))).find(Boolean), t = tiles.find(([x, y]) => !used(x, y));
    const f = sp ? { tx: sp.tx, ty: sp.ty, kind: sp.kind, prop: true } : t ? { tx: t[0], ty: t[1], kind: 'floor', prop: false } : null;
    if (f) out.unshift({ ...f, act: 'fetch', name: `Supply · ${propName(f.kind === 'floor' ? 'locker' : f.kind)}` });
  }
  return out;
}

export function jobRun(mod, game, sites) {
  const off = sites[0]?.act === 'fetch' ? 1 : 0, item = mod.item || null;
  const run = { mech: mod, game, sites, item, carrying: false, events: [], faults: 0, t: 0, limit: game.limit,
    def: { id: mod.id, name: mod.title, dept: mod.dept, item: item ? [item] : [], how: mod.how, site: mod.siteName || 'Site', verb: mod.verb || 'Work', act: 'job' } };
  let seen = 0; const newEvents = () => { const k = Math.min(game.evn - seen, game.events.length); seen = game.evn; return k > 0 ? game.events.slice(-k) : []; };
  const sync = () => {
    game.sites.forEach((g, i) => { const s = sites[i + off]; s.prog = g.prog; s.done = g.done; });
    run.faults = game.strikes; run.t = game.t; run.state = game.state === 'play' ? 'work' : game.state;
    const fresh = newEvents(); for (const e of fresh) { run.events.push({ ...e, type: e.type === 'strike' ? 'fault' : e.type, ...(e.site != null ? { site: e.site + off } : {}) }); if (run.events.length > 40) run.events.shift(); }
    return fresh;
  };
  const fetchLeft = () => off && !sites[0].done;
  Object.defineProperty(run, 'next', { get: () => fetchLeft() ? 0 : game.next < 0 ? -1 : game.next + off });
  Object.defineProperty(run, 'left', { get: () => sites.filter(s => !s.done).length });
  run.blocked = (i) => fetchLeft() && i !== 0 ? 'fetch' : null;
  run.fetched = () => { if (off) { sites[0].done = true; sites[0].prog = 1; run.events.push({ type: 'site', site: 0, t: run.t }); } };
  run.step = (dt, inp = {}) => {
    if (run.state !== 'work') return null; const at = inp.at ?? -1;
    if (fetchLeft()) { game.live(dt, inp.away); sync(); if (at === 0 && inp.press) return { type: 'fetch', site: 0 }; if (at > 0 && inp.press) return { type: 'blocked', site: at, why: 'fetch' }; return null; }
    if (item && !inp.hasItem && at >= off) { game.live(dt, inp.away); sync(); return inp.press ? { type: 'needItem', site: at } : null; }
    game.step(dt, { ...inp, at: at >= off ? at - off : -1 }); const fresh = sync();
    const b = fresh.find(e => e.type === 'blocked'); return b ? { type: 'blocked', site: b.site + off, why: b.why } : null;
  };
  run.cancel = () => { game.cancel(); sync(); };
  run.result = () => ({ ...game.result(), sites: sites.length });
  run.outcome = () => {
    if (game.state === 'win') { const perfect = game.strikes === 0; return { quality: 'proper', timeMul: perfect ? 0.05 : 0.08, perfect, label: perfect ? 'Clean work' : 'Done properly' }; }
    if (game.state === 'fail') return { quality: 'rushed', timeMul: 0.5, perfect: false, label: game.why === 'time' ? 'Ran long — the job is logged as rushed' : 'Fumbled it — the job is logged as rushed' };
    return null;
  };
  run.prompt = (i) => i < off ? '' : game.prompt(i - off);
  run.panel = (i) => i < off ? null : game.panel(i - off);
  run.hint = (i, frame = 0) => { if (fetchLeft()) return { at: 0, press: frame % 2 === 0 }; const h = game.hint(frame); return { ...h, at: h.at == null || h.at < 0 ? -1 : h.at + off, hasItem: true }; };
  run.bad = (i, frame = 0) => { const h = game.bad(frame); return h ? { ...h, at: h.at == null || h.at < 0 ? -1 : h.at + off, hasItem: true } : { at: -1 }; };
  sync(); return run;
}
