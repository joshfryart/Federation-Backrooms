// Node unit tests: handheld job equipment / improvised weapons.  node tools/test-handhelds.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function handheldTests(fail) {
  const HH = await imp('js/handhelds.js'), E = await imp('js/equipment.js'), M = await imp('js/movement.js'), { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js');
  const ck = (c, m) => { if (!c) fail('handhelds: ' + m); return !!c; };
  const ids = HH.HANDHELD_IDS; ck(ids.length >= 12 && ids.length <= 30, 'item count ' + ids.length); ck(ids.filter(i => i.startsWith('tricorder_')).length >= 5, 'tricorder types'); ck(['phaser1', 'phaser2', 'phaser_rifle'].every(i => HH.HANDHELDS[i]?.weapon.ranged), 'three phasers');
  for (const id of ids) { const h = HH.HANDHELDS[id];
    ck(h.name && h.real && h.carriers && ['belt', 'hand', 'back', 'chest', 'pocket'].includes(h.holster) && E.ITEMS[h.model] && h.dur > 0, `${id}: fields`);
    ck(h.job?.verbs?.length && h.job.effect && h.job.script?.length && Array.isArray(h.job.where), `${id}: job profile`); for (const s of h.job.script) ck(!s.g || M.GESTURES[s.g], `${id}: gesture ${s.g}`); for (const w of h.job.where) ck(E.EQUIPMENT[w], `${id}: where ${w}`);
    const w = h.weapon; ck(w?.melee && w.throw, `${id}: weapon profile`); for (const p of [w.melee, w.throw]) ck(p.dmg >= 0 && p.stun >= 0 && p.range > 0 && p.noise >= 0, `${id}: weapon numbers`);
    if (w.ranged) ck(w.ranged.charge > 0 && w.ranged.range > 0 && Object.keys(w.ranged.settings).length, `${id}: ranged`); }
  ck(HH.WEAPON_TABLE.length >= ids.length * 2, 'weapon table rows'); ck(HH.WEAPON_TABLE.every(r => Number.isFinite(r.dmg) && Number.isFinite(r.stun)), 'weapon table numbers');
  // durability is shared between job and weapon; a broken tool loses its job but still hits (weaker); foldables can snap
  { const t = HH.newInstance('tricorder_eng', 3); ck(HH.useJob(t).ok && t.dur === 99, 'job wears'); let hits = 0; while (!HH.isBroken(t) && hits < 50) { HH.strike(t, 'melee', 7); hits++; } ck(HH.isBroken(t) && hits <= 4, 'clubbing breaks a tricorder fast ' + hits); ck(!HH.useJob(t).ok, 'broken tricorder does not scan'); const s = HH.strike(t, 'melee', 7); ck(s.ok && s.dmg < HH.HANDHELDS.tricorder_eng.weapon.melee.dmg, 'broken still hits, weaker'); }
  { const sp = HH.newInstance('spanner', 1); for (let i = 0; i < 40; i++) HH.strike(sp, 'melee', 1); ck(!HH.isBroken(sp), 'a spanner survives a fight'); }
  { let snapped = 0; for (let s = 0; s < 40; s++) { const p = HH.newInstance('padd', s); HH.strike(p, 'throw', s); if (HH.isBroken(p)) snapped++; } ck(snapped > 5 && snapped < 40, 'thrown PADDs sometimes break ' + snapped); }
  { const ph = HH.newInstance('phaser1', 1); const a = HH.strike(ph, 'ranged', 1); ck(a.ok && a.stun === 5 && ph.charge === 11, 'phaser stun shot'); HH.cycleSetting(ph); ck(ph.setting === 'kill' && HH.strike(ph, 'ranged', 1).dmg === 1 && ph.charge === 9, 'kill setting'); HH.cycleSetting(ph); const o = HH.strike(ph, 'ranged', 1); ck(o.consumed && o.radius > 0 && HH.isBroken(ph) && ph.charge === 0, 'overload consumes the phaser'); ck(!HH.strike(ph, 'ranged', 1).ok, 'no shots after overload'); }
  { const h = HH.newInstance('hypospray', 1), r = HH.strike(h, 'melee', 1); ck(r.sedate && r.stun >= 5 && r.dmg < 0.2, 'hypospray sedates'); }
  // determinism + loadouts
  { const a = HH.newInstance('padd', 9), b = HH.newInstance('padd', 9); const ra = [1, 2, 3, 4].map(() => JSON.stringify(HH.strike(a, 'throw', 5))), rb = [1, 2, 3, 4].map(() => JSON.stringify(HH.strike(b, 'throw', 5))); ck(ra.join() === rb.join(), 'strikes deterministic'); }
  const r = C.makeComplement(SHIPS[0], 3); let phasers = 0, tric = 0;
  for (const p of r.people) { const lo = HH.loadoutFor(p); ck(lo[0] === 'commbadge' && lo.length <= 4 && JSON.stringify(lo) === JSON.stringify(HH.loadoutFor(p)), `loadout ${p.billet}`); ck(lo.filter(i => i.startsWith('phaser')).length <= 1 && lo.filter(i => i.startsWith('tricorder')).length <= 1, `one phaser / tricorder ${p.billet}`);
    if (p.dept === 'security') ck(lo.some(i => i.startsWith('phaser')), `security wears a phaser ${p.billet}`); if (lo.some(i => i.startsWith('phaser'))) phasers++; if (lo.some(i => i.startsWith('tricorder'))) tric++;
    if (p.dept === 'medical') ck(lo.includes('tricorder_med'), 'medics carry a medical tricorder'); }
  ck(phasers > 3 && tric > 10, `phasers ${phasers} tricorders ${tric}`);
  // NPC use: a tool comes out inside an equipment use cycle, held in the hand, then put back
  { const p = r.people.find(q => q.dept === 'engineering'), tool = HH.toolFor(p, 'junction', 1); ck(tool, 'engineer has a junction tool'); const o = new E.Operator('junction', p, 1, { toolSteps: HH.toolScript(tool) }); let seen = false; for (let t = 0; t < 200; t += 0.1) if (o.update(0.1).hold === HH.HANDHELDS[tool].model) seen = true; ck(seen, 'tool held during use script'); }
  return { items: ids.length, rows: HH.WEAPON_TABLE.length, phasers, tric };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await handheldTests(m => errs.push(m)); console.log(errs.length ? errs.slice(0, 20).join('\n') : 'handhelds OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
