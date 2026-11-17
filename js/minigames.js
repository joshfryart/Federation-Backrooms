// Job mini-games for Systems Nominal (docs/minigames.md). PURE LOGIC: no DOM, no three.js, no Math.random, no wall clock — a game is
// driven by dt and input events only, so node tests replay it exactly and `?test=1` runs stay deterministic. The DOM layer is js/minigames-ui.js,
// the glue (ui-mode layer, duty / repair feedback) is G.mini in js/main.js.
//
//   gameFor(job)               -> game id | null     job = { kind: 'repair'|'duty'|'task', sys, spot, room, main, steps }
//   difficulty({ skill, severity, first }) -> 0..1   skillOf(person, dept) -> 0..1
//   makeGame(id, { seed, d, first, steps, timeMul }) -> Game
//     game.input({ k, ... })   discrete input (see each game)      game.hold = { left, right, up, down }   held directions (the layer sets them)
//     game.step(dt)            advance; sets game.done            game.result() -> { id, quality 0..1, secs, mistakes, timedOut }
//   outcomeOf(result, { first }) -> 'proper' | 'rushed'          (duty loops and mission tasks: never worse than rushed; faking / skipping stay the old verbs)
//   repairLevel(result, { first }) -> { hp, outcome: 'proper'|'rushed'|'botched', costPart, spark }
//   INFO[id]  the instruction card text    STATION[spot]  one line about the station    GAMES  the ids
import { mulberry32 } from './data.js';

export const GAMES = ['wires', 'dials', 'tune', 'sequence', 'crates', 'dose'];
export const THRESH = { proper: 0.7, first: 0.55, botched: 0.3 };   // quality needed for a proper job; the first job of each type teaches (lower bar); below `botched` a repair goes wrong
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export { hashStr };

// ---- skill and difficulty
export const skillOf = (p, dept) => p ? clamp(0.35 + 0.05 * (p.rank || 0) + (p.dept === dept ? 0.3 : 0)) : 0.4;
export const difficulty = ({ skill = 0.5, severity = 0.3, first = false } = {}) => clamp((0.25 + 0.45 * severity + 0.35 * (1 - skill)) * (first ? 0.5 : 1));
export const SEVERITY = { nominal: 0.2, degraded: 0.35, offline: 0.8 };

// ---- which game fits which job. Not every round is a puzzle: patrols, desks, doors and counters keep the plain timed round.
const SYS_MAIN = { eps: 'wires', lighting: 'wires', security: 'wires', lifts: 'wires', armory: 'wires', reactor: 'dials', coolant: 'dials', life: 'dials', gravity: 'dials', dampers: 'dials', hydro: 'dials',
  sensors: 'tune', comms: 'tune', transport: 'tune', emh: 'tune', computer: 'sequence', alert: 'sequence', helm: 'sequence', replicators: 'sequence', holo: 'sequence', sickbay: 'dose' };
const TUNE_SYS = new Set(['sensors', 'comms', 'emh', 'transport']);
export function gameFor(job) {
  if (!job) return null;
  if (job.kind === 'repair') return job.main ? (SYS_MAIN[job.sys] || 'wires') : 'wires';   // a wall junction is always the panel puzzle
  const spot = job.spot, sys = job.sys;
  switch (spot) {
    case 'junction': return sys === 'comms' ? 'tune' : 'wires';
    case 'warpcore': case 'pumpskid': case 'tree': return 'dials';
    case 'biobed': return sys === 'sickbay' || !sys ? 'dose' : 'sequence';
    case 'locker': return job.room === 'armory' ? 'sequence' : 'crates';
    case 'lift': return 'crates';
    case 'pad': return 'tune';
    case 'console': return TUNE_SYS.has(sys) ? 'tune' : 'sequence';
    case 'workbench': return sys === 'eps' || sys === 'transport' ? 'wires' : 'sequence';
    case 'replicator': return 'sequence';
    default: return null;   // desk, table, door, corridor, counter, sink, stove, post, any, captain_chair: no mini-game
  }
}

// ---- instruction cards (docs: what it is, what the job needs, which keys, what "proper" looks like)
export const INFO = {
  wires: { title: 'Junction panel', what: 'Behind the yellow cover, the feed lines have come loose and the labels are scrambled.', needs: 'Pair every numbered terminal on the left with its matching lettered terminal on the right.', keys: [['1', '5'], 'then', ['A', 'G']], tip: 'Or click a left terminal, then its match. A wrong match counts against you.', proper: 'Every pair joined with few wrong tries.' },
  dials: { title: 'Valves and dials', what: 'Pressure and power drift by themselves; the gauges need steady hands.', needs: 'Keep every needle inside its green band until the time runs out.', keys: [['1', '3'], 'pick', ['←', '→'], 'trim'], tip: 'Hold the arrow keys to trim the picked dial. Mouse: click a gauge to select it, wheel to trim.', proper: 'Most of the time inside the band, no needle in the red.' },
  tune: { title: 'Signal calibration', what: 'The instrument is off its peak. Two knobs shape the signal; the meter shows how close you are.', needs: 'Find the strongest reading and lock it in.', keys: [['←', '↑', '↓', '→'], 'tune', ['Space'], 'lock'], tip: 'Or move the mouse over the plot and click to lock. Do not lock on a weak signal.', proper: 'Locked near the top of the meter.' },
  sequence: { title: 'Console procedure', what: 'The checklist for this job came out of order.', needs: 'Enter the steps in the order you would really do them.', keys: [['1', '5'], 'pick the next step'], tip: 'Or click the steps. A wrong step counts against you.', proper: 'The right order, no wrong steps.' },
  crates: { title: 'Load the sled', what: 'Crates come down the line, and the sled tips if one side is heavier.', needs: 'Put each crate on the left or right so the two sides stay level.', keys: [['←'], 'or', ['→']], tip: 'Or click a side. Look at the next crate before you decide.', proper: 'Both sides within a crate or so of each other.' },
  dose: { title: 'Dosing', what: 'Each patient needs a dose that lands in the marked band, not under it and not over it.', needs: 'Start the infusion, then stop it inside the band.', keys: [['Space'], 'start / stop'], tip: 'Or click the button. Going over the top is an overdose.', proper: 'Every dose stopped inside its band.' },
};
export const STATION = {
  junction: 'A maintenance junction: the ship\'s wiring and plumbing meet here.', warpcore: 'The reactor core: the ship\'s power starts here.', pumpskid: 'The coolant pump skid.', tree: 'A grow bed with its nutrient and light controls.',
  biobed: 'A biobed with its dosing panel.', locker: 'A stores locker and loading sled.', lift: 'The cargo sled.', pad: 'A transporter pad with its pattern-buffer panel.', console: 'A work console.', workbench: 'A bench with a worn part and a test rig.', replicator: 'A replicator with its feedstock panel.',
  repair: 'A faulted system: hardware you can bring back by hand.',
};
const GENERIC_STEPS = { console: ['wake the console', 'open the log', 'read the values', 'enter the correction', 'sign the log'], replicator: ['check feedstock', 'run a test cycle', 'read the output', 'log the count', 'sign off'], workbench: ['clear the bench', 'pull the part', 'test it', 'swap it', 'log it'], locker: ['open the locker', 'count the stock', 'check the seals', 'log the count', 'lock up'], default: ['open the panel', 'read the display', 'compare to the log', 'adjust', 'sign off'] };
export function stepsFor(job) {
  const own = (job?.steps || []).filter(s => !/^(walk|go|head|return|get to|move)\b/i.test(s)).map(s => String(s).replace(/^./, c => c.toUpperCase()));
  const base = own.length >= 3 ? own : (GENERIC_STEPS[job?.spot] || GENERIC_STEPS.default).map(s => s.replace(/^./, c => c.toUpperCase()));
  return base.slice(0, 5);
}

// ---- base game
class Game {
  constructor(id, { seed = 1, d = 0.5, first = false, timeMul = 1 } = {}) {
    this.id = id; this.d = clamp(d); this.first = !!first; this.rnd = mulberry32(seed >>> 0); this.t = 0; this.done = false; this.timedOut = false; this.mistakes = 0; this.q = 0;
    this.hold = { left: false, right: false, up: false, down: false }; this.limit = 25 * timeMul; this.msg = ''; this.msgT = 0; this.sfx = null;   // sfx: 'ok' | 'bad' | 'done' (the layer plays and captions it, then clears it)
  }
  say(m, sfx) { this.msg = m; this.msgT = 1.6; if (sfx) this.sfx = sfx; }
  input() { }
  tick() { }
  step(dt) {
    if (this.done) return; this.t += dt; this.msgT -= dt; this.tick(dt);
    if (!this.done && this.t >= this.limit) { this.timedOut = true; this.expire(); this.done = true; }
  }
  expire() { }
  end(q) { this.q = clamp(q); this.done = true; this.sfx = 'done'; }
  get timeLeft() { return Math.max(0, this.limit - this.t); }
  result() { return { id: this.id, quality: +clamp(this.q).toFixed(3), secs: +this.t.toFixed(1), mistakes: this.mistakes, timedOut: this.timedOut }; }
}
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const timeFactor = (t, limit) => 1 - 0.2 * clamp((t / limit - 0.5) / 0.5);   // finishing in the last half costs up to 20%

// (a) wires: input { k: 'selL', i } then { k: 'selR', i }; keys 1..n then A S D F G
export class Wires extends Game {
  constructor(o) {
    super('wires', o); this.n = 3 + Math.round(this.d * 2); this.limit = (30 - this.d * 8) * (o.timeMul || 1);
    this.left = [...Array(this.n).keys()]; this.right = shuffle([...Array(this.n).keys()], this.rnd); if (this.n > 1 && this.right.every((v, i) => v === i)) this.right.push(this.right.shift());
    this.sel = -1; this.joined = new Set();   // joined: symbols already connected
  }
  input(e) {
    if (this.done) return;
    if (e.k === 'selL' && e.i >= 0 && e.i < this.n && !this.joined.has(this.left[e.i])) this.sel = e.i;
    else if (e.k === 'selR' && e.i >= 0 && e.i < this.n && !this.joined.has(this.right[e.i])) {
      if (this.sel < 0) { this.say('pick a left terminal first'); return; }
      if (this.right[e.i] === this.left[this.sel]) { this.joined.add(this.left[this.sel]); this.sel = -1; this.say('joined', 'ok'); if (this.joined.size === this.n) this.finish(); }
      else { this.mistakes++; this.sel = -1; this.say('wrong terminal', 'bad'); }
    }
  }
  score() { return (this.joined.size / this.n) * Math.max(0, 1 - 0.18 * this.mistakes) * timeFactor(this.t, this.limit); }
  finish() { this.end(this.score()); }
  expire() { this.q = clamp(this.score() * 0.9); this.sfx = 'done'; }
}

// (b) dials: input { k: 'sel', i } / { k: 'trim', i, v }; held left / right trims the picked dial. Score = time inside the bands over a fixed run.
export class Dials extends Game {
  constructor(o) {
    super('dials', o); this.m = 2 + (this.d > 0.45 ? 1 : 0); this.run = 14 + this.d * 3; this.limit = this.run; this.sel = 0; this.hw = 0.17 - 0.07 * this.d; this.ok = 0; this.inBand = [];
    this.v = []; this.c = []; this.drift = []; this.dt = []; this.red = [];
    for (let i = 0; i < this.m; i++) { this.c.push(0.3 + this.rnd() * 0.4); { const c = this.c[i], dir = c > 0.5 ? -1 : 1; this.v.push(clamp(c + dir * (this.hw * 1.8 + this.rnd() * 0.12))); } this.drift.push((this.rnd() - 0.5) * 2); this.dt.push(1 + this.rnd() * 1.5); this.red.push(false); this.inBand.push(false); this.armed = this.armed || []; this.armed.push(false); }
  }
  input(e) {
    if (this.done) return;
    if (e.k === 'sel' && e.i >= 0 && e.i < this.m) this.sel = e.i;
    else if (e.k === 'trim' && e.i >= 0 && e.i < this.m) this.v[e.i] = clamp(this.v[e.i] + e.v);
  }
  tick(dt) {
    const speed = 0.04 + 0.1 * this.d, trim = (this.hold.right ? 1 : 0) - (this.hold.left ? 1 : 0);
    if (trim) this.v[this.sel] = clamp(this.v[this.sel] + trim * 0.45 * dt);
    for (let i = 0; i < this.m; i++) {
      if ((this.dt[i] -= dt) <= 0) { this.drift[i] = (this.rnd() - 0.5) * 2; this.dt[i] = 1 + this.rnd() * 1.5; }
      this.v[i] = clamp(this.v[i] + this.drift[i] * speed * dt);
      const off = Math.abs(this.v[i] - this.c[i]); this.inBand[i] = off <= this.hw; if (this.inBand[i]) { this.ok += dt / this.m; this.armed[i] = true; }
      const red = off > this.hw * 2.2 && this.armed[i];   // the red only counts once you have had the needle in the band: a fresh dial is not your fault if (red && !this.red[i]) { this.mistakes++; this.say('needle in the red', 'bad'); } this.red[i] = red;
    }
  }
  expire() { this.q = clamp(this.ok / (this.run * 0.85) * Math.max(0.6, 1 - 0.05 * this.mistakes)); this.sfx = 'done'; }
}

// (c) tune: input { k: 'aim', x, y } (0..1) or held arrows; { k: 'lock' } ends it when the signal is strong enough
export class Tune extends Game {
  constructor(o) {
    super('tune', o); this.limit = (26 - this.d * 6) * (o.timeMul || 1); this.px = 0.2 + this.rnd() * 0.6; this.py = 0.2 + this.rnd() * 0.6; this.sigma = 0.3 - 0.1 * this.d;
    this.x = this.px > 0.5 ? 0.12 : 0.88; this.y = this.py > 0.5 ? 0.12 : 0.88; this.best = 0;
  }
  strength(x = this.x, y = this.y) { return Math.exp(-((x - this.px) ** 2 + (y - this.py) ** 2) / (2 * this.sigma * this.sigma)); }
  input(e) {
    if (this.done) return;
    if (e.k === 'aim') { this.x = clamp(e.x); this.y = clamp(e.y); }
    else if (e.k === 'lock') { const s = this.strength(); if (s < 0.3) { this.mistakes++; this.say('no signal to lock', 'bad'); } else this.end(s * timeFactor(this.t, this.limit)); }
  }
  tick(dt) { const h = this.hold; this.x = clamp(this.x + ((h.right ? 1 : 0) - (h.left ? 1 : 0)) * 0.45 * dt); this.y = clamp(this.y + ((h.down ? 1 : 0) - (h.up ? 1 : 0)) * 0.45 * dt); this.best = Math.max(this.best, this.strength()); }
  expire() { this.q = clamp(this.strength() * 0.8); this.sfx = 'done'; }
}

// (d) sequence: input { k: 'pick', i } picks displayed item i; the right order is the job's own order
export class Sequence extends Game {
  constructor(o) {
    super('sequence', o); const steps = (o.steps && o.steps.length >= 3 ? o.steps : GENERIC_STEPS.default).slice(0, 5); this.n = clamp(Math.round(3 + this.d * 2), 3, steps.length);
    this.order = steps.slice(0, this.n); this.show = shuffle(this.order.map((s, i) => ({ s, i })), this.rnd); if (this.show.every((x, k) => x.i === k)) this.show.push(this.show.shift());
    this.limit = (34 - this.d * 8) * (o.timeMul || 1); this.next = 0; this.picked = new Set();
  }
  input(e) {
    if (this.done || e.k !== 'pick' || e.i < 0 || e.i >= this.n) return; const it = this.show[e.i]; if (this.picked.has(it.i)) return;
    if (it.i === this.next) { this.picked.add(it.i); this.next++; this.say('ok', 'ok'); if (this.next === this.n) this.end(this.score()); } else { this.mistakes++; this.say('not yet', 'bad'); }
  }
  score() { return (this.next / this.n) * Math.max(0, 1 - 0.2 * this.mistakes) * timeFactor(this.t, this.limit); }
  expire() { this.q = clamp(this.score() * 0.9); this.sfx = 'done'; }
}

// (e) crates: input { k: 'put', side: 'L' | 'R' }; keep the two sides level
export class Crates extends Game {
  constructor(o) {
    super('crates', o); this.n = 6 + Math.round(this.d * 2); this.limit = (28 - this.d * 6) * (o.timeMul || 1); this.w = []; for (let i = 0; i < this.n; i++) this.w.push(1 + Math.floor(this.rnd() * 5));
    this.i = 0; this.L = 0; this.R = 0; this.placedL = []; this.placedR = []; this.look = this.d < 0.5 ? 2 : 1;
  }
  get total() { return this.w.reduce((a, b) => a + b, 0); }
  input(e) {
    if (this.done || e.k !== 'put') return; const w = this.w[this.i], heavyL = this.L > this.R, heavyR = this.R > this.L;
    if ((e.side === 'L' && heavyL) || (e.side === 'R' && heavyR)) { this.mistakes++; this.say('heavy side', 'bad'); } else this.say('', 'ok');
    if (e.side === 'L') { this.L += w; this.placedL.push(w); } else { this.R += w; this.placedR.push(w); } this.i++; if (this.i >= this.n) this.end(this.score());
  }
  score() { const rest = this.w.slice(this.i).reduce((a, b) => a + b, 0); return 1 - 1.6 * Math.abs(this.L + rest - this.R) / this.total; }   // crates not placed in time all go on the left
  expire() { this.q = clamp(this.score()); this.sfx = 'done'; }
}

// (f) dose: input { k: 'toggle' } starts / stops the infusion; the level of each patient has to stop inside the band
export class Dose extends Game {
  constructor(o) {
    super('dose', o); this.rounds = 2 + (this.d > 0.5 ? 1 : 0); this.limit = (30 - this.d * 6) * (o.timeMul || 1); this.hw = 0.13 - 0.05 * this.d; this.rate = 0.3 + 0.2 * this.d; this.r = 0; this.level = 0; this.on = false; this.scores = [];
    this.c = []; for (let i = 0; i < this.rounds; i++) this.c.push(0.4 + this.rnd() * 0.4);
  }
  input(e) {
    if (this.done || e.k !== 'toggle') return;
    if (!this.on) { this.on = true; return; }
    this.on = false; const off = Math.abs(this.level - this.c[this.r]); this.scores.push(off <= this.hw ? 1 : clamp(1 - (off - this.hw) / 0.4)); this.say(off <= this.hw ? 'in the band' : off > this.hw * 2 ? 'off the mark' : 'close', off <= this.hw ? 'ok' : 'bad');
    if (off > this.hw) this.mistakes++; this.level = 0; this.r++; if (this.r >= this.rounds) this.end(this.mean());
  }
  tick(dt) { if (!this.on) return; this.level += this.rate * dt; if (this.level >= 1) { this.on = false; this.level = 0; this.scores.push(0); this.mistakes++; this.say('overdose', 'bad'); this.r++; if (this.r >= this.rounds) this.end(this.mean()); } }
  mean() { return this.scores.reduce((a, b) => a + b, 0) / this.rounds; }
  expire() { this.q = clamp(this.mean() * 0.9); this.sfx = 'done'; }
}

const CLS = { wires: Wires, dials: Dials, tune: Tune, sequence: Sequence, crates: Crates, dose: Dose };
export function makeGame(id, opts = {}) { const C = CLS[id]; if (!C) throw new Error('unknown mini-game ' + id); return new C(opts); }

// ---- result -> the existing duty model
export const needed = (first) => first ? THRESH.first : THRESH.proper;
export const outcomeOf = (res, { first = false } = {}) => res.quality >= needed(first) ? 'proper' : 'rushed';
export function repairLevel(res, { first = false } = {}) {
  const q = res.quality;
  if (q >= needed(first)) return { hp: 1, outcome: 'proper', costPart: false, spark: false };
  if (q >= THRESH.botched || first) return { hp: 0.8, outcome: 'rushed', costPart: false, spark: false };   // holds, but it is a patch: nominal, with little margin
  return { hp: 0.6, outcome: 'botched', costPart: true, spark: true };   // wrong wire: a spare part is spoiled and it sparks
}
/** a bot that plays any game perfectly (tests, docs examples): returns the result */
export function autoplay(g, { skill = 1 } = {}) {
  for (let guard = 0; guard < 4000 && !g.done; guard++) {
    if (g.id === 'wires') { const i = [...g.left.keys()].find(k => !g.joined.has(g.left[k])), j = g.right.indexOf(g.left[i]); g.input({ k: 'selL', i }); g.input({ k: 'selR', i: skill < 1 ? (j + 1) % g.n : j }); }
    else if (g.id === 'sequence') g.input({ k: 'pick', i: g.show.findIndex(x => x.i === g.next) });
    else if (g.id === 'crates') g.input({ k: 'put', side: g.L <= g.R ? 'L' : 'R' });
    else if (g.id === 'tune') { g.input({ k: 'aim', x: g.px, y: g.py }); g.step(0.05); g.input({ k: 'lock' }); }
    else if (g.id === 'dose') { if (!g.on) g.input({ k: 'toggle' }); g.step(0.02); if (g.on && Math.abs(g.level - g.c[g.r]) < 0.015) g.input({ k: 'toggle' }); }
    else if (g.id === 'dials') { for (let i = 0; i < g.m; i++) g.v[i] = g.c[i]; g.step(0.1); }
    if (g.id !== 'tune' && g.id !== 'dose' && g.id !== 'dials') g.step(0.25);
  }
  return g.result();
}
