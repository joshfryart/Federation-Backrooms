// Node unit tests: the human movement library.  node tools/test-movement.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function movementTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), M = await imp('js/movement.js');
  const ck = (c, m) => { if (!c) fail('movement: ' + m); return !!c; };
  ck(M.GESTURE_IDS.length >= 28, 'library size ' + M.GESTURE_IDS.length);
  for (const id of M.GESTURE_IDS) { const g = M.GESTURES[id]; ck(g.states?.length && g.dur?.[0] > 0 && g.dur[1] >= g.dur[0] && g.weight > 0, id + ' fields'); ck(g.ch || g.face, id + ' has motion');
    for (const k in g.ch || {}) { ck(M.RIG[k], `${id}: unknown channel ${k}`); const ks = g.ch[k]; ck(ks[0][0] === 0 && ks[ks.length - 1][0] === 1, `${id}.${k} keys span 0..1`); ck(Math.abs(ks[0][1]) < 1e-9 && Math.abs(ks[ks.length - 1][1]) < 1e-9 || g.hold, `${id}.${k} starts and ends at rest`); for (let i = 1; i < ks.length; i++) ck(ks[i][0] > ks[i - 1][0], `${id}.${k} times increase`); for (const [, v] of ks) ck(Math.abs(v) <= 2.6, `${id}.${k} range`); }
    const mid = M.sample(g, 0.5); ck(Object.values(mid.ch).every(Number.isFinite), id + ' finite'); }
  // fidgeter: variety, cooldown, rests, state filtering, habits
  const r = C.makeComplement(SHIPS[0], 5), people = r.people.slice(0, 24); const used = new Set(); let cues = 0, maxRot = 0;
  for (const state of ['standing', 'walking', 'sitting', 'working', 'talking']) for (const p of people.slice(0, 6)) {
    const f = new M.Fidgeter(p, 5); let prev = null, same = 0;
    for (let t = 0; t < 240; t += 0.1) { const o = f.update(0.1, { state, stress: 0.4, tired: 0.3 }); if (o.cue) cues++; if (o.gesture) { used.add(o.gesture); ck(M.GESTURES[o.gesture].states.includes(state), `${o.gesture} not allowed while ${state}`); if (o.gesture === prev) same++; prev = o.gesture; } else prev = null; for (const b in o.bones) for (const v of o.bones[b]) maxRot = Math.max(maxRot, Math.abs(v)); }
    ck(!f.cur || true, 'ok');
  }
  ck(used.size >= 22, 'variety across contexts ' + used.size); ck(cues > 5, 'sound cues ' + cues); ck(maxRot < 3.0, 'rotation bounded ' + maxRot);
  // mood steering: tired people yawn/stretch more, stressed people sigh/tap more
  const count = (ctx, ids) => { let n = 0; for (const p of people) { const f = new M.Fidgeter(p, 9); for (let t = 0; t < 400; t += 0.1) { const o = f.update(0.1, { state: 'standing', ...ctx }); if (o.gesture && ids.includes(o.gesture) && f.cur && f.cur.at <= 0.11) n++; } } return n; };
  const tiredY = count({ tired: 1, stress: 0 }, ['yawn', 'stretch', 'rub_eyes', 'slow_blink', 'neck_roll']), freshY = count({ tired: 0, stress: 0 }, ['yawn', 'stretch', 'rub_eyes', 'slow_blink', 'neck_roll']);
  ck(tiredY > freshY * 1.8, `tired gestures ${tiredY} vs ${freshY}`);
  const stressS = count({ stress: 1, tired: 0 }, ['sigh', 'tap_foot', 'frown', 'rub_neck']), calmS = count({ stress: 0, tired: 0 }, ['sigh', 'tap_foot', 'frown', 'rub_neck']);
  ck(stressS > calmS * 1.8, `stress gestures ${stressS} vs ${calmS}`);
  return { gestures: M.GESTURE_IDS.length, used: used.size, cues, tiredY, freshY, stressS, calmS };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await movementTests(m => errs.push(m)); console.log(errs.length ? errs.slice(0, 12).join('\n') : 'movement OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
