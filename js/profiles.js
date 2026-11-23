// Crew role-play profiles -> behaviour (Systems Nominal). Pure logic, no three.js, no DOM: node-testable.
// The compiled profile (assets/data/comms.json, built by tools/build-comms.mjs from docs/crew-sim/<billet>.json) carries per billet:
//   act  [[id, rooms[], spot, anim, minLo, minHi, weight, social, when, [fatigue, hunger, stress]], ...]   the personal-time menu (`activities` + `needs`)
//   pb   { phase: [mood, stay, leaves] }   `phase_behaviour`: mood word, stay = routine_change says they dig in at the post, leaves = leaves_post_if is set
//   al   { alert: { a, r, s, p, l } }      `alert_responses`: action text, room, spot, priority (1 = first), comm line (js/comms.js speaks `l`)
// Used by js/sim.js (free-time picks, phase digging-in, mild-alert free time) and js/main.js alertStations (severe alert responses).
// Everything is stateless and seeded: the same seed, clock and context always give the same answer.
import { hash01 } from './clock.js';

export const SLOT_H = 1 / 3;                     // ship hours: free time is picked on a 20-minute grid; an activity's `minutes` hold it for several slots
export const SEVERE = 3;                         // alert severity from which the response is an order to go (sim priority 3); below it only free time changes
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// mood word -> stress it adds (first match wins; "afraid but steady" reads as afraid)
const MOODS = [[/afraid|panic|scared|frighten|desperate|anxious/, 0.35], [/grim|stressed|tense|urgent|hard|fierce|numb|exhausted/, 0.2], [/wary|watchful|alert|curious/, 0.08], [/resign|resolute|focus|steady|working/, 0.05], [/calm|relaxed|content|bored/, -0.1]];
export const moodStress = (m) => { for (const [re, v] of MOODS) if (re.test(m || '')) return v; return 0.1; };
export const PHASE_NAMES = ['nominal', 'anomalies', 'degraded', 'crisis', 'collapse'];
const STAY_BASE = [0, 0.05, 0.25, 0.5, 0.7];     // chance a person on free time stays at the post instead, per phase (x1.8 when their profile says they dig in, x0.6 when not)

// how much a person needs each thing right now, 0..1. `h` is their local hour (hours since their watch began).
// ctx: { prof, phase (0..4), sev (top alert severity 0..5) }
export function needsAt(p, h, ctx, seed = 1) {
  const j = (k) => hash01('need', seed, p.id, k) - 0.5, pb = ctx?.prof?.pb?.[PHASE_NAMES[ctx?.phase || 0]];
  const fatigue = clamp(h / 20 + 0.3 * j('f')), hunger = clamp((((h + 5 * hash01('meal', seed, p.id)) % 5) / 5) + 0.2 * j('h'));
  const stress = clamp(0.2 + 0.12 * (ctx?.phase || 0) + 0.06 * (ctx?.sev || 0) + moodStress(pb?.[0]) * 0.8 + 0.2 * j('s'));
  return { fatigue, hunger, stress };
}
// weight of one activity right now: its base weight, boosted by how much it relieves what the person needs (needs deltas are negative = relieves)
export const scoreActivity = (a, n) => a[6] * Math.exp(2 * (-(a[9][0] * n.fatigue + a[9][1] * n.hunger + a[9][2] * n.stress)));

// The activity a person does in a free-time block starting at local hour `from`, at local hour h: walks the 20-min grid from the block start,
// each pick weighted by needs then held for its `minutes`; so the answer depends on (person, time, context) only, never on call order.
// Returns { room, spot, activity, id, anim, social } or null (no profile menu / nothing fits the ship, or the template block won the draw).
// `has(room)` says whether the ship has that room. The template's own block competes as one more option (weight tmplW) when `tmpl` is set.
export function pickActivity(prof, p, { from, h, ctx, seed = 1, has = () => true, tmpl = false, tmplW = 2 }) {
  const acts = (prof?.act || []).filter(a => a[1].some(has)); if (!acts.length) return null;
  const cur = Math.floor((h - from) / SLOT_H + 1e-9); let s = 0, pick = null, guard = 0;
  while (guard++ < 80) {
    const hs = from + s * SLOT_H, n = needsAt(p, hs, ctx, seed), opts = acts.map(a => [a, scoreActivity(a, n)]);
    if (tmpl) opts.push([null, tmplW]);
    let tot = 0; for (const o of opts) tot += o[1]; let r = hash01('act', seed, p.id, Math.round(hs * 3), s) * tot; pick = opts[opts.length - 1][0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
    const mins = pick ? pick[4] + (pick[5] - pick[4]) * hash01('dwell', seed, p.id, Math.round(hs * 3)) : 20, dwell = Math.max(1, Math.round(mins / 20));
    if (s + dwell > cur) break; s += dwell;
  }
  if (!pick) return null;
  const rooms = pick[1].filter(has), room = rooms[Math.floor(hash01('room', seed, p.id, Math.round(from * 3), s) * rooms.length)];
  return { room, spot: pick[2], activity: pick[0], id: pick[0], anim: pick[3], social: pick[7] };
}
// the share of free time a person gives up to stay at the post in this phase (0 in nominal)
export const stayChance = (prof, phaseIdx) => { const pb = prof?.pb?.[PHASE_NAMES[phaseIdx]]; return clamp((STAY_BASE[phaseIdx] || 0) * (pb?.[1] ? 1.8 : 0.6), 0, 0.95); };

// The response this person has to the alerts now up. `alerts` = AlertState records ({ id, def: { severity }, scope, deck }); `deckNo` = the 1-based deck the
// person is on (deck-scoped alerts only reach that deck). severe = only alerts that order people about (severity >= SEVERE); else only the mild ones.
// The pick is the lowest profile priority number (1 = first), then the more severe alert. Returns { id, room, spot, prio, action, line, sev } or null.
export function alertResponse(prof, alerts, { deckNo = null, severe = true } = {}) {
  let best = null;
  for (const a of alerts || []) {
    const sev = a.def?.severity ?? 0, isSevere = sev >= SEVERE; if (isSevere !== severe) continue;
    if (a.scope === 'deck' && a.deck != null && deckNo != null && a.deck + 1 !== deckNo) continue;
    const r = prof?.al?.[a.id]; if (!r?.r) continue;
    if (!best || r.p < best.prio || (r.p === best.prio && sev > best.sev)) best = { id: a.id, room: r.r, spot: r.s || 'door', prio: r.p || 3, action: r.a, line: r.l, sev };
  }
  return best;
}
