// Gait patterns: every person gets a walk assembled from small interchangeable parts (pace + style + carriage + habits),
// seeded by their voice tags, department, rank and id, then modulated by the moment (alert level, fatigue, off duty).
// Pure logic: no three.js, no DOM.   makeGait(person, seed) -> gait;  gaitNow(gait, ctx) -> { v, clip, timeScale, ... };  describeGait(gait)
import { hash, hash01 } from './clock.js';

// ---- parts (each a row you can swap) ----
export const PACES = { dawdle: 0.85, easy: 1.05, normal: 1.25, brisk: 1.5, hurried: 1.75 };          // m/s top walking speed
const PACE_ORDER = ['dawdle', 'easy', 'normal', 'brisk', 'hurried'];
export const STYLES = {            // which animation clip, and the ground speed that clip's stride is authored for (m/s)
  casual: { clip: 'walk', stride: 0.95 },      // stride = ground speed the clip's planted foot moves at (measured: ~0.95 m/s for both), so animation speed = v / stride
  formal: { clip: 'walk_formal', stride: 0.95 },
};
export const CARRIAGES = {         // how the body moves: turn rate (rad/s), acceleration (m/s^2), head sway amplitude (rad), glance chance at the player, pause chance at a corner, personal space (m)
  upright: { turn: 4.6, accel: 3.2, sway: 0.05, glance: 0.15, pause: 0.0, space: 0.95 },
  loose: { turn: 5.6, accel: 2.8, sway: 0.16, glance: 0.45, pause: 0.12, space: 0.75 },
  stiff: { turn: 3.6, accel: 3.8, sway: 0.02, glance: 0.05, pause: 0.0, space: 1.1 },
  shuffle: { turn: 4.0, accel: 1.8, sway: 0.1, glance: 0.2, pause: 0.2, space: 0.8 },
  alert: { turn: 6.4, accel: 4.0, sway: 0.22, glance: 0.3, pause: 0.05, space: 0.85 },
};
export const HABITS = ['none', 'looks-around', 'stops-to-think', 'cuts-corners'];

const DEPT_PACE = { command: 2, flight: 2, operations: 3, engineering: 2, security: 3, sciences: 2, medical: 3, services: 1 };   // index into PACE_ORDER
const has = (p, t) => (p.tags || []).includes(t);
const step = (i, d) => Math.max(0, Math.min(PACE_ORDER.length - 1, i + d));

export function makeGait(p, seed = 1) {
  const r = (k) => hash01('gait', seed, p.id, k);
  let pi = DEPT_PACE[p.dept] ?? 2; pi += r('p') < 0.25 ? -1 : r('p') > 0.8 ? 1 : 0;
  if (has(p, 'voice:pace:rapid')) pi++; if (has(p, 'voice:pace:drawling') || has(p, 'voice:pace:halting')) pi--; if (has(p, 'voice:pace:clipped')) pi += 0.5;
  for (const t of ['stress:snappy', 'stress:short-tempered', 'stress:overworks', 'habit:paces']) if (has(p, t)) pi += 0.5;
  for (const t of ['stress:calm', 'stress:withdrawn', 'habit:leans-on-walls', 'habit:sighs']) if (has(p, t)) pi -= 0.5;
  const pace = PACE_ORDER[step(Math.round(pi), 0)];
  const formalish = ['speech:formal', 'workstation:by-the-book', 'habit:parade-rest', 'social:rule-enforcer', 'social:commanding'].some(t => has(p, t)) || (p.rank ?? 0) >= 4 || p.dept === 'security' && r('s') < 0.6;
  const style = formalish && r('f') < 0.85 ? 'formal' : r('f') < 0.12 ? 'formal' : 'casual';
  let car = formalish ? (r('c') < 0.6 ? 'upright' : 'stiff') : ['loose', 'upright', 'loose', 'shuffle'][Math.floor(r('c') * 4)];
  if (has(p, 'habit:leans-on-walls') || has(p, 'stress:withdrawn')) car = 'shuffle'; if (has(p, 'stress:brittle') || has(p, 'combat:panics')) car = 'alert';
  const habit = has(p, 'habit:paces') || has(p, 'habit:fidgets') ? 'looks-around' : has(p, 'workstation:distracted') || has(p, 'habit:checks-badge') ? 'stops-to-think' : has(p, 'workstation:corner-cutter') ? 'cuts-corners' : HABITS[Math.floor(r('h') * 3)];
  const vary = 0.94 + r('v') * 0.12;
  return { pace, style, carriage: car, habit, v: PACES[pace] * vary, phase: r('ph') * 6.28, seed: hash('gaitseed', seed, p.id) };
}

// ctx: { alert (0..5 severity), tired (0..1), relaxed (bool), late (bool) }
export function gaitNow(g, ctx = {}) {
  const car = CARRIAGES[g.carriage], st = STYLES[g.style];
  let v = g.v, clip = st.clip, stride = st.stride, turn = car.turn, accel = car.accel;
  if (ctx.relaxed) v *= 0.88;
  if (ctx.tired) v *= 1 - 0.14 * ctx.tired;
  if (ctx.late) v *= 1.15;
  if ((ctx.alert || 0) >= 2) { v *= 1.18; turn *= 1.2; accel *= 1.3; }
  if (ctx.run) { clip = 'sprint'; stride = 5.2; v = Math.max(4.0, v * 2.6); turn *= 1.5; accel *= 2.2; }
  else if ((ctx.alert || 0) >= 3) { clip = 'jog'; stride = 3.0; v = Math.max(v * 1.6, 2.6); turn *= 1.3; accel *= 1.5; }
  return { v, clip, stride, timeScale: Math.max(0.5, Math.min(2.0, v / stride)), turn, accel, sway: car.sway * (ctx.alert >= 2 ? 1.4 : 1), glance: car.glance, pause: g.habit === 'stops-to-think' ? Math.max(car.pause, 0.3) : car.pause, space: car.space, look: g.habit === 'looks-around', cut: g.habit === 'cuts-corners' };
}
export const describeGait = (g) => `${g.pace} ${g.style} ${g.carriage}${g.habit !== 'none' ? ', ' + g.habit : ''} (${g.v.toFixed(2)} m/s)`;
