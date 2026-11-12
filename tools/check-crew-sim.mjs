// Validate docs/crew-sim/<billet>.json profiles against docs/crew-sim/SCHEMA.md.
// usage: node tools/check-crew-sim.mjs [billet-key ...]   (no args = every billet; missing files are reported)
import fs from 'node:fs';
import { BILLETS } from '../js/crew.js';
import { ROOMS } from '../js/data.js';

const DIR = new URL('../docs/crew-sim/', import.meta.url).pathname;
const KEYS = BILLETS.map(b => b.key);
const ROOM = new Set(Object.keys(ROOMS));
const MISSIONS = ['quiet_watch', 'survey', 'cargo_run', 'medical_relief', 'shakedown'];
const PHASES = ['nominal', 'anomalies', 'degraded', 'crisis', 'collapse'];
const ALERTS = ['yellow', 'red', 'fire', 'hull_breach', 'contamination', 'power_failure', 'gravity_failure', 'intruder', 'medical_emergency', 'abandon_ship'];
const BARKS = ['idle', 'working', 'greeting_player', 'greeting_player_higher_rank', 'greeting_player_lower_rank', 'tired', 'hungry', 'stressed', 'alert'];
const REACT = ['player_does_their_job_well', 'player_neglects_duty', 'player_fakes_report', 'player_gives_order_ok', 'player_gives_order_outranked', 'player_out_of_place', 'player_asks_favour'];

function check(key) {
  const errs = [], file = DIR + key + '.json';
  if (!fs.existsSync(file)) return ['missing file'];
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return ['invalid JSON: ' + e.message]; }
  const e = (m) => errs.push(m), room = (r, where) => { if (!ROOM.has(r)) e(`${where}: unknown room "${r}"`); };
  if (j.billet !== key) e(`billet should be "${key}"`);
  if (typeof j.role_summary !== 'string' || j.role_summary.length < 40) e('role_summary too short');
  if (!Array.isArray(j.personas) || j.personas.length !== 3) e('personas must have exactly 3 entries');
  // daily template: contiguous 0..24
  const t = j.daily_template;
  if (!Array.isArray(t) || t.length < 6) e('daily_template needs at least 6 blocks');
  else {
    let at = 0;
    t.forEach((b, i) => { if (Math.abs(b.from - at) > 0.01) e(`daily_template[${i}] starts at ${b.from}, expected ${at}`); if (!(b.to > b.from)) e(`daily_template[${i}] to<=from`); at = b.to; room(b.room, `daily_template[${i}]`); if (!b.activity) e(`daily_template[${i}] no activity`); });
    if (Math.abs(at - 24) > 0.01) e(`daily_template ends at ${at}, expected 24`);
  }
  if (!Array.isArray(j.activities) || j.activities.length < 6) e('activities needs at least 6');
  else {
    const ids = new Set(j.activities.map(a => a.id));
    for (const need of ['rec_bar', 'holo_playroom', 'sleep']) if (!ids.has(need)) e(`activities missing "${need}"`);
    j.activities.forEach((a, i) => { (a.rooms || []).forEach(r => room(r, `activities[${i}]`)); if (!Array.isArray(a.minutes) || a.minutes.length !== 2) e(`activities[${i}] minutes must be [min,max]`); });
  }
  if (!Array.isArray(j.duty_loops) || j.duty_loops.length < 2 || j.duty_loops.length > 5) e('duty_loops needs 2–5');
  else j.duty_loops.forEach((d, i) => { room(d.room, `duty_loops[${i}]`); for (const q of ['proper', 'rushed', 'skipped', 'faked']) if (!d.quality?.[q]) e(`duty_loops[${i}] quality.${q} missing`); });
  for (const m of MISSIONS) { const a = j.mission_tasks?.[m]; if (!Array.isArray(a) || a.length < 2 || a.length > 5) e(`mission_tasks.${m} needs 2–5 tasks`); else a.forEach((x, i) => x.room && room(x.room, `mission_tasks.${m}[${i}]`)); }
  if (!j.bridge_comms?.calls_to_bridge?.length) e('bridge_comms.calls_to_bridge empty');
  if (!j.bridge_comms?.calls_from_bridge?.length) e('bridge_comms.calls_from_bridge empty');
  for (const a of ALERTS) { const r = j.alert_responses?.[a]; if (!r) e(`alert_responses.${a} missing`); else { if (r.room) room(r.room, `alert_responses.${a}`); if (!r.comm_line) e(`alert_responses.${a}.comm_line missing`); } }
  for (const p of PHASES) if (!j.phase_behaviour?.[p]) e(`phase_behaviour.${p} missing`);
  if (!Array.isArray(j.relationships) || !j.relationships.length) e('relationships empty'); else j.relationships.forEach((r, i) => { if (!KEYS.includes(r.with_billet)) e(`relationships[${i}] unknown billet "${r.with_billet}"`); });
  for (const b of BARKS) { const a = j.barks?.[b]; if (!Array.isArray(a) || a.length < 3) e(`barks.${b} needs 3+ lines`); else a.forEach(l => l.length > 90 && e(`barks.${b} line over 90 chars: "${l.slice(0, 30)}…"`)); }
  for (const r of REACT) if (!j.player_reactions?.[r]) e(`player_reactions.${r} missing`);
  if (!Array.isArray(j.decision_rules) || j.decision_rules.length < 8) e('decision_rules needs 8+');
  if (!j.information_view) e('information_view missing');
  if (!Array.isArray(j.temptations) || !j.temptations.length) e('temptations empty');
  const size = fs.statSync(file).size; if (size > 24000) e(`file is ${size} bytes; aim for under ~14 KB`);
  return errs;
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : KEYS;
let bad = 0;
for (const k of want) {
  if (!KEYS.includes(k)) { console.log(`${k}: not a billet key`); bad++; continue; }
  const errs = check(k);
  if (errs.length) { bad++; console.log(`✗ ${k}\n   ` + errs.slice(0, 12).join('\n   ') + (errs.length > 12 ? `\n   … ${errs.length - 12} more` : '')); } else console.log(`✓ ${k}`);
}
console.log(bad ? `\n${bad} of ${want.length} need work` : `\nOK (${want.length})`);
process.exit(bad ? 1 : 0);
