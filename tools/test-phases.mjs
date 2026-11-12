// Node unit tests: phase machine and failure modes.  node tools/test-phases.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function phaseTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), A = await imp('js/alerts.js'), P = await imp('js/phases.js');
  const ck = (c, m) => { if (!c) fail('phases: ' + m); return !!c; }, out = { modes: new Set(), collapse: 0, hazards: 0 };
  for (let seed = 1; seed <= 24; seed++) {
    const ship = SHIPS[seed % SHIPS.length], roster = C.makeComplement(ship, seed), ss = new C.ShipState(ship, seed); ss.auto = false; for (const s of C.SYSTEMS) ss.repair(s.id);
    const al = new A.AlertState(), say = []; const ph = new P.Phases({ shipState: ss, alerts: al, roster, seed, say: (t) => say.push(t) });
    const seq = []; ph.on(e => { if (e.type === 'phase') seq.push(e.to); }); let ended = false; ph.on(e => { if (e.type === 'end') ended = true; });
    let lethal = null;
    for (let t = 0; t < 1210; t += 1) { ph.tick(1); if (ph.index === 4 && !lethal) { for (let d = 1; d <= ship.decks && !lethal; d++) lethal = ph.hazard(d, { zone: 'engineering' }); } }
    ck(seq.join() === 'anomalies,degraded,crisis,collapse', `phase order ${seq}`); ck(ended, 'run ends at 20 min'); ck(ph.mode, 'a mode was chosen'); out.modes.add(ph.mode);
    ck(ss.faulted().length > 0, 'ship degraded'); if (ph.index === 4) out.collapse++; if (lethal) out.hazards++;
    ck(say.length >= 3, 'crew-visible text'); ck(al.active().length > 0, 'alerts raised');
    // repair relieves the mode
    const sev = ph.severity; ph.onRepair(ph.modeDef.watch); ck(ph.severity < sev || sev === 0, 'repair lowers severity');
  }
  // debt pushes phases early
  const ship = SHIPS[0], roster = C.makeComplement(ship, 3), ss = new C.ShipState(ship, 3); for (const s of C.SYSTEMS) ss.repair(s.id);
  const ph = new P.Phases({ shipState: ss, roster, seed: 3, duty: { debt: 12, ledger: { reactor: 4 } } }); ph.tick(1); ck(ph.index >= 2, 'debt accelerates phases'); ck(ph.mode === 'reactor_drift', 'neglected system picks the mode: ' + ph.mode);
  ck(out.modes.size >= 4, 'varied modes ' + [...out.modes]); ck(out.hazards > 0, 'collapse can be lethal');
  return { modes: [...out.modes], hazards: out.hazards };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await phaseTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'phases OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
