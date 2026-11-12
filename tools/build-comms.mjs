// Compiles the 41 crew role-play profiles (docs/crew-sim/*.json) into one compact file for the browser:
//   node tools/build-comms.mjs            -> assets/data/comms.json
//   node tools/build-comms.mjs --check    -> validate only (also used by tools/test.mjs)
// Per billet: title, calls to the bridge (classified: start / checkin / fault / emergency, with the ship system or
// alert they relate to), calls from the bridge (order, reply, time to comply), alert responses, phase lines,
// the daily template and the alert/greeting barks.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs/crew-sim'), OUT = join(ROOT, 'assets/data/comms.json');
export const ALERT_KEYS = ['yellow', 'red', 'fire', 'hull_breach', 'contamination', 'power_failure', 'gravity_failure', 'intruder', 'medical_emergency', 'abandon_ship'];
export const PHASES = ['nominal', 'anomalies', 'degraded', 'crisis', 'collapse'];

// trigger text -> kind / ship system / alert id (keyword rules; first match wins)
const SYS_RULES = [
  [/reactor|core temp|containment|plasma|warp/i, 'reactor'], [/coolant/i, 'coolant'], [/eps|grid|conduit|breaker|blackout|power request|power feed|bridge demands more power|output cannot meet/i, 'eps'],
  [/life support|co2|o2|air quality|atmosphere/i, 'life'], [/gravity/i, 'gravity'], [/lift/i, 'lifts'], [/damper/i, 'dampers'],
  [/comms|relay|\bpa\b|subspace|latency/i, 'comms'], [/computer|isolinear|chart database|core sweep|core drop|stack/i, 'computer'],
  [/transporter|pattern|beam/i, 'transport'], [/helm|thruster|drift|lurch|course|heading|position|nav/i, 'helm'],
  [/sensor|scan|contact|array|lifeform count|calibration/i, 'sensors'], [/lifeform scanner|internal sensors|force field|badge|door found unlocked|brig/i, 'security'],
  [/armory|charging racks|weapon/i, 'armory'], [/replicator|matter stores|feedstock/i, 'replicators'], [/hydro|bed|blight|grow/i, 'hydro'],
  [/sickbay|monitors|biobed|pharmacy|medical supplies|supplies/i, 'sickbay'], [/holo|interlock|program loop/i, 'holo'], [/light/i, 'lighting'],
];
const ALERT_RULES = [
  [/abandon/i, 'abandon_ship'], [/fire|arcing/i, 'fire'], [/breach|pressure|seal(ing)? failing|vacuum/i, 'hull_breach'],
  [/contaminat|spore|pathogen|toxin|quarantine|outbreak|spoilage/i, 'contamination'], [/intruder|unauthori[sz]ed|unknown person|unidentified person|hostile|restricted room|without a badge/i, 'intruder'],
  [/mass casualt|casualt|collapse|crashes|crew injury|seriously injured|patient arrives with serious/i, 'medical_emergency'],
  [/blackout|power fail|offline power|containment failing/i, 'power_failure'], [/gravity (fail|loss|lost)/i, 'gravity_failure'],
];
const first = (rules, s) => { for (const [re, v] of rules) if (re.test(s)) return v; return null; };
const START = /run start|start of (the )?(watch|shift|run)|watch start|ready to receive mission|pads ready|start of shift|shift start|all green/i;
const CHECKIN = /routine|status interval|complete|finished|\bclean\b|all[- ]clear|patrol|sweep|walk-?round|committed|drill|report ready|bay is clear|preflight|secured|task complete|course leg|ready for launch|survey scan complete/i;

export function classify(c) {
  const s = c.trigger + ' ' + c.message;
  const al = c.priority === 'emergency' ? first(ALERT_RULES, c.trigger) : null;
  let k = START.test(c.trigger) ? 'start' : c.priority === 'routine' && CHECKIN.test(c.trigger) ? 'checkin' : c.priority === 'emergency' ? 'emergency' : 'fault';
  if (k === 'fault' && c.priority === 'routine') k = 'checkin';
  const out = { k, t: c.trigger, m: c.message, p: c.priority[0], to: c.to };
  const sys = k === 'checkin' || k === 'start' ? null : first(SYS_RULES, c.trigger + ' ' + c.message);
  if (sys) out.sys = sys; if (al) out.al = al;
  return out;
}

export function build() {
  const out = { version: 1, generated: 'tools/build-comms.mjs', billets: {} }, problems = [];
  for (const f of readdirSync(SRC).filter(f => f.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(join(SRC, f), 'utf8')), key = d.billet;
    if (f !== key + '.json') problems.push(`${f}: billet "${key}" does not match the file name`);
    const bc = d.bridge_comms || {}, al = {}, ph = {};
    for (const a of ALERT_KEYS) { const r = d.alert_responses?.[a]; if (!r || !r.comm_line) problems.push(`${key}: no alert_responses.${a}.comm_line`); else al[a] = { a: r.action, r: r.room, s: r.spot, p: r.priority, l: r.comm_line }; }
    for (const p of PHASES) { const r = d.phase_behaviour?.[p]; if (!r?.lines?.length) problems.push(`${key}: no phase_behaviour.${p}.lines`); else ph[p] = r.lines; }
    if (!bc.calls_to_bridge?.length) problems.push(`${key}: no calls_to_bridge`);
    if (!bc.calls_from_bridge?.length) problems.push(`${key}: no calls_from_bridge`);
    if (!d.daily_template?.length) problems.push(`${key}: no daily_template`);
    out.billets[key] = {
      to: (bc.calls_to_bridge || []).map(classify),
      from: (bc.calls_from_bridge || []).map(c => ({ o: c.order, r: c.response_line, min: c.time_to_comply_min, no: c.refuses_if || undefined })),
      al, ph,
      day: (d.daily_template || []).map(b => [b.from, b.to, b.room, b.spot, b.activity]),
      bark: { alert: d.barks?.alert || [], greet: d.barks?.greeting_player || [], greetHi: d.barks?.greeting_player_higher_rank || [], greetLo: d.barks?.greeting_player_lower_rank || [] },
      rel: (d.relationships || []).filter(r => r.with_billet && r.kind).map(r => [r.with_billet, r.kind]),   // billet-to-billet attitudes, read by js/social.js
    };
  }
  return { out, problems };
}

// structural validation of a compiled file (also used by tools/test.mjs)
export function validate(data) {
  const bad = [], keys = Object.keys(data.billets || {});
  if (keys.length < 41) bad.push(`only ${keys.length} billets`);
  for (const k of keys) {
    const b = data.billets[k];
    for (const a of ALERT_KEYS) if (!b.al?.[a]?.l) bad.push(`${k}: alert ${a}`);
    for (const p of PHASES) if (!b.ph?.[p]?.length) bad.push(`${k}: phase ${p}`);
    if (!b.to?.length || !b.from?.length) bad.push(`${k}: calls`);
    const day = b.day || []; if (!day.length || day[0][0] !== 0 || day[day.length - 1][1] !== 24) bad.push(`${k}: daily template does not cover 0..24`);
    for (let i = 1; i < day.length; i++) if (Math.abs(day[i][0] - day[i - 1][1]) > 1e-6) bad.push(`${k}: daily template gap at ${day[i][0]}`);
    for (const c of b.to || []) if (!c.m || !'rue'.includes(c.p) || !['start', 'checkin', 'fault', 'emergency'].includes(c.k)) bad.push(`${k}: bad call ${c.t}`);
  }
  return bad;
}

if (process.argv[1] && process.argv[1].endsWith('build-comms.mjs')) {
  const { out, problems } = build(); const bad = [...problems, ...validate(out)];
  if (bad.length) { console.error('build-comms: ' + bad.length + ' problems\n  ' + bad.slice(0, 30).join('\n  ')); process.exit(1); }
  if (!process.argv.includes('--check')) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(out)); }
  const n = Object.keys(out.billets).length, calls = Object.values(out.billets).reduce((a, b) => a + b.to.length, 0);
  console.log(`build-comms: ${n} billets, ${calls} calls to the bridge, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB${process.argv.includes('--check') ? ' (check only)' : ' -> assets/data/comms.json'}`);
}
