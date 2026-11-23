// Node unit tests: pacing director intensity cycle, hostile mix plan, hull-breach numbers, and the headless soak (tools/soak-director.mjs).  node tools/test-director.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function directorTests(fail) {
  const { Director, RELAX_OVERRUN } = await imp('js/director.js'), { threatPlan, BREACH, breachSealCost, breachSealTime } = await imp('js/threats.js'), Soak = await imp('tools/soak-director.mjs');
  const ck = (c, m) => { if (!c) fail('director-soak: ' + m); return !!c; };
  let s = 3; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // ---- intensity cycle: quiet build -> sustained danger -> peak (nothing added) -> relax (nothing added, breather) -> build again
  const D = new Director(rnd); D.reset(4); let t = 0; const log = [];
  const run = (secs, tension, ctx = {}) => { for (let i = 0; i < Math.round(secs * 10); i++) { t += 0.1; const a = D.update(0.1, { tension, deckTime: t, faults: 0, dormant: 1, active: 1, madPending: 20, ...ctx }); log.push({ t, a, phase: D.phase, i: D.intensity }); } };
  run(5, 0); ck(D.intensity === 0 && D.phase === 'build', 'quiet start stays at 0 / build');
  run(120, 0); ck(log.some(e => e.a), 'quiet build produces pressure actions'); ck(D.phase === 'build', 'quiet build never peaks on its own');
  const mark = log.length; run(20, 1);
  const peakStart = log.findIndex((e, i) => i >= mark && e.phase === 'peak');
  ck(peakStart >= 0 && log[peakStart].t - log[mark].t < 12, 'sustained danger reaches the peak within 12 s');
  ck(log.every(e => e.i >= 0 && e.i <= 1), 'intensity stays in 0..1');
  let pEnd = peakStart; while (log[pEnd + 1]?.phase === 'peak') pEnd++;
  const peakLen = log[pEnd].t - log[peakStart].t + 0.1; ck(peakLen >= 5.8 && peakLen <= 11.2, 'peak holds 6-11 s (' + peakLen.toFixed(1) + ')');
  ck(log.slice(peakStart, pEnd + 1).every(e => !e.a), 'nothing is added during the peak');
  ck(D.phase === 'relax' && D.relaxing, 'after the peak comes a relax with the breather held');
  const rs = pEnd + 1; run(10, 0, { faults: 1 });
  ck(log.slice(rs).every(e => e.phase !== 'relax' || !e.a), 'nothing is added during the relax');
  run(80, 0); ck(D.phase === 'build', 'the relax ends once it has calmed down');
  // ---- regression: a hostile that never lets go must not freeze the director in relax (was ~450 s of 480 s on deck 3+)
  const D2 = new Director(rnd); D2.reset(6); let t2 = 0, relaxRun = 0, longest = 0, builds = 0, phase = 'build';
  for (let i = 0; i < 3000; i++) { t2 += 0.1; D2.update(0.1, { tension: 0.45, deckTime: t2, faults: 0, dormant: 0, active: 1, madPending: 20 }); if (D2.phase === 'relax') { relaxRun += 0.1; longest = Math.max(longest, relaxRun); } else relaxRun = 0; if (D2.phase === 'build' && phase !== 'build') builds++; phase = D2.phase; }
  ck(longest <= 40 + RELAX_OVERRUN + 0.5, 'relax is capped under constant pressure (longest ' + longest.toFixed(0) + ' s)'); ck(builds >= 3, 'the cycle keeps turning under constant pressure (' + builds + ' builds in 5 min)');
  { const D3 = new Director(rnd); D3.reset(3); D3.phase = 'relax'; D3.phaseT = 5; ck(D3.relaxing, 'breather holds while the relax timer runs'); D3.phaseT = -1; ck(!D3.relaxing, 'breather is over once the relax timer has run out'); }
  // ---- enemy mix plan (spawnThreats)
  const want = [0, 0, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3];
  for (let n = 1; n <= 11; n++) { const p = threatPlan(n, rnd, ['gronk', 'drone', 'phantom']); ck(p.types.length === want[n], `deck ${n} hostile count ${p.types.length}`);
    for (let i = 1; i < p.delays.length; i++) ck(p.delays[i] - p.delays[i - 1] >= (n >= 6 ? 30 : 22), `deck ${n} arrivals are spaced`);
    ck(p.delays.every(d => d >= 29), `deck ${n} first arrival is not instant`); ck(p.clingers <= (n >= 6 ? 2 : 3) && (n >= 2 || p.clingers === 0), `deck ${n} clinger cap ${p.clingers}`); }
  // ---- hull breach numbers
  ck(BREACH.hurt > BREACH.reach, 'the damage zone covers the seal reach (no free patching from the edge)');
  ck(breachSealCost('none') + 34 < 75, 'sealing a breach unpatched plus one gronk hit (34) leaves over 25% hit points: ' + (breachSealCost('none') + 34).toFixed(0));
  ck(breachSealTime('patch_plate') * 2 === breachSealTime('none'), 'a patch plate halves the work'); ck(breachSealCost('breather') < breachSealCost('none') * 0.6, 'a breather cuts the damage by at least 40%');
  ck(breachSealCost('patch_plate') <= breachSealCost('none') * 0.6, 'a patch plate cuts the total cost');
  // ---- soak: outliers across decks 1..11 (a model of the player and hostiles, see tools/soak-director.mjs)
  const out = {};
  for (const style of ['fight', 'hide']) { const rows = []; for (let d = 1; d <= 11; d++) for (let sd = 1; sd <= 12; sd++) rows.push(Soak.soak(d, sd, 8, style)); const sum = Soak.summarise(rows); out[style] = sum;
    for (const r of sum) { const tag = `${style} deck ${r.deck}`;
      ck(r.actsInPeak === 0, `${tag}: pressure added during a peak`); ck(r.tight === 0, `${tag}: two pressure actions within 8 s`); ck(r.maxRelax <= 40 + RELAX_OVERRUN + 1, `${tag}: relax ran ${r.maxRelax} s`);
      ck(r.madTurns >= 4, `${tag}: only ${r.madTurns} madness turns in 8 min (director starved)`); ck(r.maxFaults <= 4, `${tag}: ${r.maxFaults} faults open at once`);
      if (style === 'hide') { ck(r.p95quiet <= 75, `${tag}: dead stretch ${r.p95quiet} s`); ck(r.p95first <= 150, `${tag}: first pressure at ${r.p95first} s`); ck(r.actsPerMin >= 0.5, `${tag}: only ${r.actsPerMin} actions/min`); } } }
  return { fightDeck5: out.fight.find(r => r.deck === 5), hideDeck5: out.hide.find(r => r.deck === 5), breach: Soak.breachReport() };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await directorTests(m => errs.push(m)); console.log(errs.length ? errs.slice(0, 20).join('\n') : 'director OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
