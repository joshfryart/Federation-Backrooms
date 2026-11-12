// Compiles duty loops, mission tasks, player reactions and the "temptations" of the 41 crew profiles into assets/data/duties.json
//   node tools/build-duties.mjs  |  --check
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), SRC = join(ROOT, 'docs/crew-sim'), OUT = join(ROOT, 'assets/data/duties.json');
export const MISSIONS = ['quiet_watch', 'survey', 'cargo_run', 'medical_relief', 'shakedown'];
export function build() {
  const billets = {};
  for (const f of readdirSync(SRC).filter(f => f.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(join(SRC, f), 'utf8')), k = d.billet, q = (x) => [x.time, x.debt];
    billets[k] = {
      role: d.role_summary,
      loops: (d.duty_loops || []).map(l => ({ id: l.id, label: l.label, room: l.room, spot: l.spot, every: l.every_min, dur: l.duration_min, sys: l.system || null, steps: l.steps, q: { proper: q(l.quality.proper), rushed: q(l.quality.rushed), skipped: q(l.quality.skipped), faked: q(l.quality.faked) }, report: l.bridge_report || null })),
      tasks: Object.fromEntries(MISSIONS.map(m => [m, (d.mission_tasks?.[m] || []).map(t => ({ task: t.task, at: t.at_run_min, room: t.room, spot: t.spot, dep: t.depends_on, to: t.reports_to, neglect: t.if_neglected }))])),
      react: d.player_reactions || {}, tempt: d.temptations || [], rules: (d.decision_rules || []).slice(0, 6),
      traits: [...new Set((d.personas || []).flatMap(p => p.traits || []))].slice(0, 8),
    };
  }
  return { version: 1, billets };
}
export function validate(data) {
  const bad = [];
  for (const [k, b] of Object.entries(data.billets)) {
    if (!b.loops.length) bad.push(`${k}: no duty loops`);
    for (const l of b.loops) if (!(l.every > 0 && l.dur > 0 && l.q?.proper)) bad.push(`${k}/${l.id}: bad loop`);
    for (const m of MISSIONS) if (!b.tasks[m]?.length) bad.push(`${k}: no ${m} tasks`);
  }
  return bad;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = build(), bad = validate(out); if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  if (process.argv.includes('--check')) { if (readFileSync(OUT, 'utf8') !== JSON.stringify(out)) { console.error('duties.json is stale'); process.exit(1); } console.log('duties OK'); }
  else { writeFileSync(OUT, JSON.stringify(out)); console.log('wrote duties.json', Object.keys(out.billets).length, 'billets', (JSON.stringify(out).length / 1024).toFixed(0) + ' KB'); }
}
