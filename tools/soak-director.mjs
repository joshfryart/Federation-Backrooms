// Headless soak of the pacing director, per-deck hostile mixes and hull-breach numbers.   node tools/soak-director.mjs [--seeds N] [--minutes M]
// It drives the real js/director.js and js/threats.js with a crude stand-in for the player and the hostiles (no three.js, no world): each awake hostile
// closes on the player, lands a hit when it arrives, and gets shaken off again. The stand-in is a MODEL, not the game: use the numbers to compare constants
// and catch outliers (unfair spikes, dead stretches, stacked pressure), then confirm in real play (F3 overlay).
// Exports soak(deck, seed, minutes), summarise(rows) and breachReport() for tools/test.mjs (section "director-soak").
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { Director } = await imp('js/director.js'), { threatPlan, HOSTILES, BREACH, breachSealCost, breachSealTime } = await imp('js/threats.js');
export const lcg = (seed) => { let s = (seed >>> 0) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const SPEED = { gronk: 2.6, drone: 2.4, phantom: 1.6, crazed: 3.6 };   // m/s toward the player while awake (guesses, not read from the enemy configs)
const DT = 0.1;
// one deck, `minutes` of play. Returns counters and worst cases.
// style: 'fight' (hostiles reach you, a hit lands 60% of the time, then they back off ~18 m), 'hide' (you stay out of reach: nothing closer than ~24 m unless the director nudges)
export function soak(deck, seed, minutes = 8, style = 'fight') {
  const rnd = lcg(seed * 7919 + deck * 104729 + 1), D = new Director(rnd); D.reset(deck);
  const pool = HOSTILES.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const plan = threatPlan(deck, rnd, pool);
  const hs = plan.types.map((type, i) => ({ type, delay: plan.delays[i], d: 40, awake: false, stun: 0, hitCd: 0 }));
  let faults = 0, madT = deck === 1 ? 16 : 16 + rnd() * 14, madAlive = false, madH = null, t = 0, hits = 0;
  const acts = {}, actTimes = [], hitTimes = [], inten = [], phaseT = { build: 0, peak: 0, relax: 0 }, faultTimers = [];
  let maxFaults = 0, relaxRun = 0, longestRelax = 0, firstMad = null, calm = 0, longestCalm = 0, quietNoAct = 0, longestQuiet = 0, firstAct = null, hitsInRelax = 0, actsInPeak = 0, peaks = 0, wasPeak = false, madTurns = 0;
  for (let step = 0; step < minutes * 600; step++, t += DT) {
    let tension = 0;
    for (const h of hs) {
      if (!h.awake) { h.delay -= DT; if (h.delay <= 0) h.awake = true; continue; }
      h.hitCd -= DT;
      if (h.stun > 0) { h.stun -= DT; h.d = Math.min(40, h.d + 4 * DT); }
      else { h.d = Math.max(style === 'hide' ? 24 : 0, h.d - SPEED[h.type] * (0.6 + 0.8 * rnd()) * DT); if (rnd() < DT * 0.06) h.d = Math.min(40, h.d + 12); }   // loses you now and then (doors, hiding, tubes)
      if (h.d < 2.2 && h.hitCd <= 0 && h.stun <= 0) { if (rnd() < 0.6) { hits++; hitTimes.push(t); if (D.phase === 'relax') hitsInRelax++; D.bump(0.35); } h.hitCd = 1.5; h.d = 18; h.stun = 3 + rnd() * 4; }   // arrival: hit or dodge, then it backs off
      tension = Math.max(tension, Math.max(0, 1 - h.d / 22) * (h.stun > 0 ? 0.3 : 1) * (h.d < 22 ? 1.3 : 1));
    }
    if (madAlive) {
      madH.d = Math.max(0, madH.d - SPEED.crazed * (0.6 + 0.8 * rnd()) * DT); madH.hitCd -= DT;
      if (madH.d < 2.2 && madH.hitCd <= 0) { if (rnd() < 0.6) { hits++; hitTimes.push(t); if (D.phase === 'relax') hitsInRelax++; D.bump(0.35); } madH.hitCd = 1.2; if (rnd() < 0.6) madH.hp--; if (style === 'hide' || rnd() < 0.3) madH.d = 20; }
      if (madH.hp <= 0) { madAlive = false; madT = 12 + rnd() * 8; }
      tension = Math.max(tension, Math.max(0, 1 - madH.d / 22) * 1.3);
    }
    tension = Math.min(1, tension);
    if (!madAlive && !D.relaxing) { madT -= DT; if (madT <= 0) { madT = 1e9; madAlive = true; madTurns++; if (firstMad === null) firstMad = t; D.bump(0.2); madH = { d: 15 + rnd() * 15, hitCd: 0, hp: 2 }; } }
    for (let i = faultTimers.length - 1; i >= 0; i--) { faultTimers[i] -= DT; if (faultTimers[i] <= 0) { faultTimers.splice(i, 1); faults--; } }
    const live = hs.filter(h => h.awake);
    const prevPhase = D.phase;
    const a = D.update(DT, { tension, deckTime: t, faults, dormant: hs.length - live.length, active: live.length, madPending: madAlive ? Infinity : madT });
    phaseT[D.phase] += DT; maxFaults = Math.max(maxFaults, faults);
    if (D.phase === 'relax') { relaxRun += DT; longestRelax = Math.max(longestRelax, relaxRun); } else relaxRun = 0;
    if (D.phase === 'peak' && !wasPeak) peaks++;
    wasPeak = D.phase === 'peak';
    if (a) {
      acts[a] = (acts[a] || 0) + 1; actTimes.push(t); if (firstAct === null) firstAct = t; if (prevPhase === 'peak') actsInPeak++;
      if (a === 'fault') { faults++; faultTimers.push(35 + rnd() * 20); D.bump(0.08); }
      else if (a === 'blackout') D.bump(0.1);
      else if (a === 'wake') { const h = hs.find(h => !h.awake); if (h) h.delay = Math.min(h.delay, 2); }
      else if (a === 'nudge') { const h = live.sort((p, q) => p.d - q.d)[0]; if (h) { h.d = Math.min(h.d, 20); h.stun = 0; } }
      else if (a === 'madness') madT = Math.min(madT, 2.5);
    }
    // dead stretch: nothing near, nothing broken, no mad crew; and intensity low with nothing added
    const quiet = tension < 0.05 && !madAlive && faults === 0 && D.phase !== 'peak';
    if (quiet) { quietNoAct += DT; longestQuiet = Math.max(longestQuiet, quietNoAct); } else quietNoAct = 0;
    if (D.intensity < 0.15 && !a) { calm += DT; longestCalm = Math.max(longestCalm, calm); } else calm = 0;
    if (step % 10 === 0) inten.push(D.intensity);
  }
  let worst20 = 0; for (let i = 0, j = 0; i < hitTimes.length; i++) { while (hitTimes[i] - hitTimes[j] > 20) j++; worst20 = Math.max(worst20, i - j + 1); }   // most hits in any 20 s
  let rise10 = 0; for (let i = 10; i < inten.length; i++) rise10 = Math.max(rise10, inten[i] - inten[i - 10]);
  let tight = 0; for (let i = 1; i < actTimes.length; i++) if (actTimes[i] - actTimes[i - 1] < 8) tight++;   // two pressure actions within 8 s
  const secs = minutes * 60;
  return { deck, seed, minutes, style, actsPerMin: actTimes.length / minutes, hitsPerMin: hits / minutes, worst20, hitsInRelax, actsInPeak, peaks, relaxFrac: phaseT.relax / secs, peakFrac: phaseT.peak / secs, buildFrac: phaseT.build / secs,
    longestQuiet, longestCalm, firstAct: firstAct ?? secs, maxFaults, longestRelax, madTurns, firstMad: firstMad ?? secs, rise10, tight, acts, madTurns, maxIntensity: Math.max(...inten), meanIntensity: inten.reduce((a, b) => a + b, 0) / inten.length };
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
export function summarise(rows) {
  const out = {}; for (const r of rows) (out[r.deck] ||= []).push(r);
  return Object.entries(out).map(([deck, rs]) => ({ deck: +deck, n: rs.length, actsPerMin: +mean(rs, 'actsPerMin').toFixed(2), hitsPerMin: +mean(rs, 'hitsPerMin').toFixed(2),
    p95worst20: q(rs.map(r => r.worst20), 0.95), maxWorst20: Math.max(...rs.map(r => r.worst20)), peakFrac: +mean(rs, 'peakFrac').toFixed(2), relaxFrac: +mean(rs, 'relaxFrac').toFixed(2),
    p95quiet: +q(rs.map(r => r.longestQuiet), 0.95).toFixed(0), maxQuiet: +Math.max(...rs.map(r => r.longestQuiet)).toFixed(0), p95calm: +q(rs.map(r => r.longestCalm), 0.95).toFixed(0), p95first: +q(rs.map(r => r.firstAct), 0.95).toFixed(0),
    maxFaults: Math.max(...rs.map(r => r.maxFaults)), p95relax: +q(rs.map(r => r.longestRelax), 0.95).toFixed(0), maxRelax: +Math.max(...rs.map(r => r.longestRelax)).toFixed(0), madTurns: +mean(rs, 'madTurns').toFixed(1), p95firstMad: +q(rs.map(r => r.firstMad), 0.95).toFixed(0), hitsInRelax: rs.reduce((a, r) => a + r.hitsInRelax, 0), actsInPeak: rs.reduce((a, r) => a + r.actsInPeak, 0), tight: rs.reduce((a, r) => a + r.tight, 0), meanInt: +mean(rs, 'meanIntensity').toFixed(2), peaksPerMin: +(rs.reduce((a, r) => a + r.peaks, 0) / rs.reduce((a, r) => a + r.minutes, 0)).toFixed(2) }));
}
export function breachReport() {
  const rows = {}; for (const c of ['none', 'breather', 'patch_plate']) rows[c] = { sealSec: breachSealTime(c), hpLost: +breachSealCost(c).toFixed(1) };
  return { reachMinusHurt: +(BREACH.reach - BREACH.hurt).toFixed(2), rows };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : +a[i + 1]; }, seeds = arg('seeds', 60), minutes = arg('minutes', 8);
  for (const style of ['fight', 'hide']) { const rows = []; for (let deck = 1; deck <= 11; deck++) for (let s = 1; s <= seeds; s++) rows.push(soak(deck, s, minutes, style)); console.log('style:', style); console.table(summarise(rows)); } console.log('breach', JSON.stringify(breachReport()));
}
