// Final colour grade, haze and bloom per room mood (no three.js import: pure numbers, so tools/test.mjs drives it in node).
// js/main.js feeds it the room the player stands in, the deck's power (0 blackout .. 1) and alert (0..1) levels every frame; it eases toward the
// mood's target and returns uniform values for the post chain's final pass (js/fx.js FinalShader: white balance, exposure, saturation, log contrast,
// split-tone), the fog (colour multiplier and density multiplier on the ship's FogExp2) and the bloom pass (strength / threshold).
// Every value is a uniform or a plain pass property: nothing here changes a shader program or a light count.
// A grade is deliberately subtle (a few per cent): it should read as "this room feels clinical / industrial / homely", not as a filter.

const N = { wb: [1, 1, 1], expo: 1, sat: 1, con: 1, sh: [0.9, 0.98, 1.1], hi: [1.07, 1.02, 0.9], fog: [1, 1, 1], fogD: 1, bloomS: 0.3, bloomT: 1.75 };
const mood = (o) => Object.assign({}, N, o);
// sh / hi: the split-tone multipliers for shadows and highlights (the pre-existing fixed grade was N.sh / N.hi, so corridors look as before)
export const MOODS = {
  corridor: N,
  command: mood({ wb: [0.97, 0.99, 1.05], con: 1.05, sh: [0.9, 0.97, 1.12], hi: [1.02, 1.02, 1.0], fog: [0.92, 0.97, 1.1] }),
  clinical: mood({ wb: [0.97, 1.01, 1.03], sat: 0.88, con: 1.03, expo: 1.04, sh: [0.92, 1.0, 1.08], hi: [1.0, 1.02, 1.02], fog: [0.95, 1.02, 1.05], fogD: 0.85 }),
  cold: mood({ wb: [0.94, 0.99, 1.08], sat: 0.78, con: 1.08, expo: 0.96, sh: [0.88, 0.96, 1.16], hi: [0.98, 1.01, 1.05], fog: [0.88, 0.96, 1.12] }),
  industrial: mood({ wb: [1.05, 1.0, 0.92], sat: 0.9, con: 1.08, sh: [0.92, 0.96, 1.06], hi: [1.1, 1.02, 0.86], fog: [1.12, 1.0, 0.86], fogD: 1.3, bloomS: 0.36 }),
  warm: mood({ wb: [1.05, 1.01, 0.93], sat: 1.06, con: 0.97, sh: [0.95, 0.96, 1.04], hi: [1.09, 1.03, 0.88], fog: [1.1, 1.0, 0.88] }),
  garden: mood({ wb: [0.99, 1.03, 0.95], sat: 1.1, con: 0.98, sh: [0.9, 1.0, 1.04], hi: [1.04, 1.05, 0.9], fog: [0.95, 1.08, 0.92], fogD: 1.2 }),
  holo: mood({ wb: [1.02, 1.01, 0.97], sat: 1.08, con: 1.02, hi: [1.08, 1.05, 0.88], bloomS: 0.38 }),
  tube: mood({ wb: [1.03, 0.98, 0.94], sat: 0.85, con: 1.12, expo: 0.94, sh: [0.86, 0.94, 1.1], fog: [1.05, 0.95, 0.85], fogD: 1.35 }),
};
export const ROOM_MOOD = {
  bridge: 'command', readyroom: 'command', transporter: 'command', datacore: 'command',
  sickbay: 'clinical', lab: 'clinical', washroom: 'clinical', gym: 'clinical',
  morgue: 'cold', brig: 'cold', airlock: 'cold',
  engineering: 'industrial', cargo: 'industrial', shuttlebay: 'industrial', plant: 'industrial', workshop: 'industrial', stores: 'industrial', armory: 'industrial', laundry: 'industrial',
  mess: 'warm', quarters: 'warm', lounge: 'warm',
  arboretum: 'garden', atrium: 'garden', holodeck: 'holo', jefferies: 'tube',
};
export const moodFor = (room) => MOODS[ROOM_MOOD[room]] || MOODS.corridor;

// state overlays: blackout (emergency red, washed out, darker haze) and alert (warm red push, pulsing unless Calm visuals)
const BLACK = { wb: [1.1, 0.9, 0.88], sat: 0.55, con: 1.05, expo: 1.08, sh: [0.84, 0.9, 1.18], hi: [1.12, 0.96, 0.9], fog: [0.1, 0.035, 0.03], fogD: 1.25, bloomS: 0.5, bloomT: 1.4 };
const ALERT = { wb: [1.07, 0.95, 0.93], sat: 0.92, fog: [1.25, 0.8, 0.75] };
const KEYS3 = ['wb', 'sh', 'hi', 'fog'], KEYS1 = ['expo', 'sat', 'con', 'fogD', 'bloomS', 'bloomT'];
const mix = (a, b, k) => a + (b - a) * k;

// the target grade for one moment (no easing): room mood, then blackout, then alert on top
export function gradeTarget(room, power = 1, alert = 0, { calm = false, t = 0 } = {}) {
  const m = moodFor(room), o = {}, off = Math.min(1, Math.max(0, 1 - power));
  for (const k of KEYS3) o[k] = m[k].map((v, i) => mix(v, BLACK[k][i], off));
  for (const k of KEYS1) o[k] = mix(m[k], BLACK[k], off);
  const a = Math.min(1, Math.max(0, alert)) * (calm ? 0.5 : 0.75 + 0.25 * Math.sin(t * 6));   // Calm visuals: half the red push and no beat
  o.wb = o.wb.map((v, i) => mix(v, ALERT.wb[i], a)); o.fog = o.fog.map((v, i) => mix(v, v * ALERT.fog[i], a)); o.sat = mix(o.sat, ALERT.sat, a);
  if (calm) o.bloomS *= 0.8;
  return o;
}

export class GradeState {
  constructor() { this.p = gradeTarget(null); this.room = null; }
  // dt seconds; ease toward the target (room changes over ~0.6 s, ~1.5 s under Calm visuals); power / alert already ease in js/world.js, so they follow 4x faster
  update(dt, room, power = 1, alert = 0, opts = {}) {
    const tg = gradeTarget(room, power, alert, opts), k = Math.min(1, dt * (opts.calm ? 1.5 : 4)), p = this.p;
    for (const key of KEYS3) for (let i = 0; i < 3; i++) p[key][i] = mix(p[key][i], tg[key][i], k);
    for (const key of KEYS1) p[key] = mix(p[key], tg[key], k);
    this.room = room; return p;
  }
  snap(room, power = 1, alert = 0, opts = {}) { this.p = gradeTarget(room, power, alert, opts); this.room = room; return this.p; }
}

// pick the nearest few of a list of {x, z} (squared distance), stable for ties: the pooled light picks (panel lights / emergency lamps / panel rect lights)
export function nearest(list, x, z, n, filter = null) {
  const arr = [];
  for (const p of list || []) { if (filter && !filter(p)) continue; const dx = p.x - x, dz = p.z - z; arr.push([dx * dx + dz * dz, p]); }
  arr.sort((a, b) => a[0] - b[0]); return arr.slice(0, n);
}
