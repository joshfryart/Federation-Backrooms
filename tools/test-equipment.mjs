// Node unit tests: equipment motions, use scripts, Operator, carry items.  node tools/test-equipment.mjs
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function equipmentTests(fail) {
  const E = await imp('js/equipment.js'), M = await imp('js/movement.js'), { generate } = await imp('js/gen.js'), { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js');
  const ck = (c, m) => { if (!c) fail('equipment: ' + m); return !!c; };
  // coverage: every prop kind the generator places (all room types, liminal dead ends) has its own entry; schedule spots resolve or fall back on purpose
  const placed = new Set(); for (let deck = 0; deck < 10; deck++) for (let s = 1; s <= 30; s++) for (const p of generate(deck, s * 977 + deck).props) placed.add(p.kind);
  const src = readFileSync(join(ROOT, 'js/gen.js'), 'utf8'); for (const m of src.matchAll(/'([a-z]+)'/g)) if (/put\([^)]*'/.test(src) && src.includes(`'${m[1]}')`) && E.EQUIPMENT[m[1]]) placed.add(m[1]);
  for (const k of placed) ck(E.EQUIPMENT[k] && E.equipKey(k) === k, `prop kind ${k} has no equipment entry`);
  const { PROP_KINDS } = { PROP_KINDS: (readFileSync(join(ROOT, 'js/world.js'), 'utf8').match(/export const PROP_KINDS = \[([^\]]+)\]/)[1].match(/'(\w+)'/g) || []).map(s => s.slice(1, -1)) };
  for (const k of PROP_KINDS) ck(E.EQUIPMENT[k], `PROP_KINDS ${k} not covered`);
  const comms = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), spots = new Set(); for (const b of Object.values(comms.billets)) for (const d of b.day || []) spots.add(d[3]);
  let generic = []; for (const s of spots) { const k = E.equipKey(s); ck(E.EQUIPMENT[k], `spot ${s} unresolved`); if (k === E.GENERIC && s !== E.GENERIC) generic.push(s); }
  for (const s of generic) ck(E.SPOT_ALIAS[s] === 'post', `spot ${s} falls back to 'post' without being listed in SPOT_ALIAS`);
  // table sanity: stances, clips, gestures, holds, poses exist
  const CLIPS = ['crouch_fwd', 'crouch_idle', 'dance', 'death01', 'fixing_kneeling', 'hit_chest', 'hit_head', 'idle', 'idle_talking', 'idle_torch', 'interact', 'jog_fwd', 'punch_cross', 'punch_jab', 'push', 'sitting_idle', 'spell_simple_idle', 'sprint', 'walk_formal', 'walk'];
  for (const [k, d] of Object.entries(E.EQUIPMENT)) {
    ck(E.STANCE_CLIP[d.stance], `${k}: stance ${d.stance}`); ck(d.steps?.length >= 2, `${k}: steps`); ck(!d.clip || CLIPS.includes(d.clip), `${k}: clip ${d.clip}`); ck(!d.restClip || CLIPS.includes(d.restClip), `${k}: restClip`);
    for (const p of d.props) ck(PROP_KINDS.includes(p), `${k}: prop ${p}`);
    for (const s of d.steps) { ck(!s.g || M.GESTURES[s.g], `${k}: gesture ${s.g}`); ck(!s.clip || CLIPS.includes(s.clip), `${k}: step clip ${s.clip}`); ck(s.dur[0] > 0 && s.dur[1] >= s.dur[0], `${k}: dur`); for (const h of [s.hold, s.holdL]) ck(h == null || E.ITEMS[h], `${k}: item ${h}`); ck(!s.pose || M.HOLDS[s.pose], `${k}: pose ${s.pose}`); }
    for (const g of d.idle || []) ck(M.GESTURES[g], `${k}: idle gesture ${g}`); ck(!d.hold || E.ITEMS[d.hold], `${k}: hold`);
    if (d.stance === 'sit') ck(d.spots?.length && d.seat > 0.3, `${k}: seated entries need spots and a seat height`);
  }
  for (const [id, h] of Object.entries(M.HOLDS)) for (const c in h) ck(M.RIG[c] && Math.abs(h[c]) < 2.6, `HOLDS ${id}.${c}`);
  for (const it of Object.values(E.ITEMS)) ck(!it.pose || M.HOLDS[it.pose], `item pose ${it.pose}`);
  // stand points: beside the prop, never inside its box, facing it; seats honour `taken`
  for (const [k, d] of Object.entries(E.EQUIPMENT)) for (const rot of [0, Math.PI / 2, 2]) for (const [fx, fz] of [[2.5, 0], [0, 2.5], [-2.5, 0], [0, -2.5]]) {
    const s = E.standPoint(d, { cx: 0, cz: 0, rot }, { x: fx, z: fz }); ck(Number.isFinite(s.x + s.z + s.yaw) && Math.hypot(s.x, s.z) < 2.2, `${k}: stand point ${JSON.stringify(s)}`);
    if (!s.spot && d.box) { const toC = Math.atan2(-s.x, -s.z); ck(Math.abs(Math.atan2(Math.sin(toC - s.yaw), Math.cos(toC - s.yaw))) < 0.05, `${k}: faces the prop`); }
  }
  { const d = E.EQUIPMENT.table, a = E.standPoint(d, { cx: 0, cz: 0, rot: 0 }, { x: 0, z: 2.5 }), b = E.standPoint(d, { cx: 0, cz: 0, rot: 0 }, { x: 0, z: 2.5 }, [[a.x, a.z]]); ck(Math.hypot(a.x - b.x, a.z - b.z) > 0.4, 'second diner takes another seat'); }
  // scripts are deterministic, vary by person/cycle; the Operator advances, loops, changes clip/gesture/hold, emits cues, and finishes on request
  const r = C.makeComplement(SHIPS[0], 5), people = r.people.slice(0, 12); let variety = 0, holds = 0, cues = 0, gestures = new Set(), clips = new Set();
  for (const k of Object.keys(E.EQUIPMENT)) {
    const a = JSON.stringify(E.useScript(k, people[0], 3, 1)), b = JSON.stringify(E.useScript(k, people[0], 3, 1)); ck(a === b, `${k}: script not deterministic`);
    if (people.slice(1).some(p => JSON.stringify(E.useScript(k, p, 3, 1).steps.map(s => [s.g, +s.dur.toFixed(2)])) !== JSON.stringify(E.useScript(k, people[0], 3, 1).steps.map(s => [s.g, +s.dur.toFixed(2)])))) variety++;
    const o = new E.Operator(k, people[2], 9); let steps = new Set(), maxCh = 0;
    for (let t = 0; t < 120; t += 0.1) { const u = o.update(0.1); steps.add(u.step); if (u.gesture) gestures.add(u.gesture); clips.add(u.clip); if (u.hold || u.holdL) holds++; if (u.cue) cues++; for (const v of Object.values(u.ch)) { ck(Number.isFinite(v), `${k}: channel NaN`); maxCh = Math.max(maxCh, Math.abs(v)); } }
    ck(o.cycle >= 2, `${k}: operator did not loop (${o.cycle})`); ck(steps.size >= 3, `${k}: few distinct steps ${[...steps]}`); ck(maxCh < 3.2, `${k}: channel range ${maxCh}`);
    const f = new E.Operator(k, people[3], 9, { loops: 1 }); let done = false; for (let t = 0; t < 200 && !done; t += 0.1) done = f.update(0.1).done; ck(done && f.hold === null && f.holdL === null, `${k}: loops:1 operator finishes empty-handed`);
  }
  ck(variety >= Object.keys(E.EQUIPMENT).length * 0.8, `scripts vary by person ${variety}`); ck(holds > 1000, 'items get held ' + holds); ck(cues > 50, 'sound cues ' + cues); ck(clips.has('jog_fwd') && clips.has('sitting_idle') && clips.has('fixing_kneeling'), 'clips used ' + [...clips]);
  for (const g of ['tap_console', 'press_panel', 'sip', 'scan_sweep', 'curl_weights', 'tool_work', 'reach_shelf', 'type_keys']) ck(gestures.has(g), `gesture ${g} never played`);
  // replicator: press, wait, take something into the right hand
  { const o = new E.Operator('replicator', people[0], 1); const seen = []; for (let t = 0; t < 60; t += 0.1) { const u = o.update(0.1); if (seen[seen.length - 1] !== u.step) seen.push(u.step); if (u.hold) { ck(['cup', 'tray'].includes(u.hold), 'replicator hold ' + u.hold); } } ck(seen.includes('press_panel') && seen.includes('take_item'), 'replicator sequence ' + seen.join(',')); }
  // carry items: classification, slow-down, payoffs
  ck(E.classifyItem('Hydrospanner') === 'tool' && E.classifyItem('Coffee mug') === 'cup' && E.classifyItem('Emergency medkit') === 'medkit' && E.classifyItem('Field toolbox') === 'toolbox' && E.classifyItem('Supply crate') === 'crate', 'classifyItem');
  ck(E.carrySlow('crate') < 0.9 && E.carrySlow('cup') === 1, 'crates slow you'); ck(E.ITEMS.toolbox.tool === 1.25 && E.ITEMS.medkit.heal && E.ITEMS.tray.gift > E.ITEMS.padd.gift || !E.ITEMS.padd.gift, 'payoffs');
  for (const [b, h] of Object.entries(E.HAULERS)) { ck(!h.cart || E.CARTS[h.cart], `hauler ${b} cart`); ck(!h.carry || E.ITEMS[h.carry], `hauler ${b} carry`); ck(h.to.length, `hauler ${b} to`); }
  return { entries: Object.keys(E.EQUIPMENT).length, placed: placed.size, spots: spots.size, generic: generic.length, gestures: gestures.size, holds, cues };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await equipmentTests(m => errs.push(m)); console.log(errs.length ? errs.slice(0, 20).join('\n') : 'equipment OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
