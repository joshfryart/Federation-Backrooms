// Job mini-games (Systems Nominal): every duty round / mission task done "properly" at a station plays a short, keyboard-driven mini-game
// tied to the tool or console involved, after a one-time instruction card for that tool. Pure logic (no DOM, no three.js), node-testable
// (tools/test-jobgames.mjs); the overlay is js/jobgame-ui.js, the glue is js/main.js startJob().
//   toolFor(spot)                 -> { id, name, kind, how, keys } | null     the station / tool a duty spot uses (null: no mini-game, the job just runs)
//   createGame(kind, seed, opts)  -> game { kind, state: 'play'|'win'|'fail', strikes, maxStrikes, t, limit, key(code, down), tick(dt), view(), result() }
//       opts: { calm }  calm visuals: slower needle / drift, +50 % time (the timing games are about reading, not reflexes)
//   outcome(game)                 -> { quality, timeMul, perfect, label }  what the result does to the job (win: proper and faster; fail: rushed;
//                                    the job is always done, a fail never blocks the run). Cancel (Esc) does nothing at all.
//   learnedStore(get, set)        -> { has(id), mark(id), reset(), list() }  which tools the player has been shown (CFG.learned, fb_cfg)
// Every game ends by itself: a timer (limit) or strikes turn it into a fail, so nothing can wait forever.
import { mulberry32 } from './data.js';

// ---- the four mini-game kinds: rules + the keys they use (none of J/H/K/L/Q/P/B, which the menu router keeps)
export const KINDS = {
  sequence: { title: 'Console sequence', limit: 14, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Key in the highlighted code, one symbol at a time.' },
  wires: { title: 'Junction wiring', limit: 18, strikes: 3, keys: ['↑', '↓', '1', '2', '3', '4'], rule: 'For each loose lead on the left, press the number of the terminal with the same colour and mark.' },
  dial: { title: 'Pressure valve', limit: 16, strikes: 3, keys: ['Space'], rule: 'Press Space while the needle is inside the band. Three good bleeds and it holds.' },
  calibrate: { title: 'Calibration', limit: 16, strikes: 0, keys: ['←', '→', 'A', 'D'], rule: 'Hold ← / → to keep the marker on the drifting reading until the meter fills.' },
};
// ---- the station / tool each duty spot uses (duties.json `spot`): name, mini-game, one-line how-to
const TOOL = (id, name, kind, how) => ({ id, name, kind, how, keys: KINDS[kind].keys });
export const TOOLS = {
  console: TOOL('console', 'Station console (LCARS panel)', 'sequence', 'Consoles take a short access code. The panel lights the next symbol; press its number.'),
  desk: TOOL('desk', 'Desk terminal', 'sequence', 'Log entries are signed with a code. Press the number under each lit symbol in order.'),
  captain_chair: TOOL('captain_chair', 'Command chair arm panel', 'sequence', 'The arm panel takes an authorisation code: press the numbers of the lit symbols in order.'),
  holocube: TOOL('holocube', 'Holo-emitter control', 'sequence', 'Program the emitter by keying the lit pattern on the control strip.'),
  pad: TOOL('pad', 'Transporter pad controls', 'sequence', 'Lock the pad: key the lit coil sequence on the pad console.'),
  lift: TOOL('lift', 'Turbolift service panel', 'sequence', 'The service panel wants its diagnostic code: press the lit symbols in order.'),
  junction: TOOL('junction', 'Maintenance junction (ODN relay)', 'wires', 'Pull the panel, then re-seat each loose lead into the terminal with the same colour and mark.'),
  door: TOOL('door', 'Door control panel', 'wires', 'Behind the door panel: match each lead to the terminal with the same colour and mark.'),
  corridor: TOOL('corridor', 'Corridor relay box', 'wires', 'Open the wall relay box and match each lead to its terminal.'),
  warpcore: TOOL('warpcore', 'Warp core coolant valve', 'dial', 'Bleed coolant pressure: tap Space when the needle crosses the band. Too early or late spikes it.'),
  replicator: TOOL('replicator', 'Replicator matter-stream valve', 'dial', 'Purge the matter stream: tap Space while the needle is in the band.'),
  stove: TOOL('stove', 'Galley range gas valve', 'dial', 'Set the burner: tap Space while the needle is in the band.'),
  sink: TOOL('sink', 'Reclamation valve', 'dial', 'Flush the reclamation line: tap Space while the needle is in the band.'),
  workbench: TOOL('workbench', 'Workbench calibrator', 'calibrate', 'Bench-test the part: hold ← / → to keep the marker on the reading until the meter fills.'),
  biobed: TOOL('biobed', 'Biobed sensor cluster', 'calibrate', 'Calibrate the bed sensors: hold ← / → to track the reading until the meter fills.'),
  locker: TOOL('locker', 'Equipment locker inventory scanner', 'calibrate', 'Sweep the scanner: hold ← / → to stay on the tag reading until the meter fills.'),
  tree: TOOL('tree', 'Hydroponic nutrient feed', 'calibrate', 'Trim the nutrient mix: hold ← / → to follow the reading until the meter fills.'),
  table: TOOL('table', 'Table display', 'calibrate', 'Align the display: hold ← / → to keep on the reading until the meter fills.'),
  counter: TOOL('counter', 'Counter scale', 'calibrate', 'Zero the scale: hold ← / → to stay on the reading until the meter fills.'),
};
TOOLS['command chair'] = TOOLS.captain_chair;
export function toolFor(spot) { return (spot && TOOLS[spot]) || null; }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIG = (code) => { const m = /^(?:Digit|Numpad)([1-9])$/.exec(code || ''); return m ? +m[1] : 0; };

// ---- games
export function createGame(kind, seed = 1, opts = {}) {
  const K = KINDS[kind]; if (!K) throw new Error('no mini-game ' + kind);
  const rnd = mulberry32((seed >>> 0) || 1), calm = !!opts.calm, slow = calm ? 0.6 : 1;
  const g = { kind, title: K.title, rule: K.rule, state: 'play', strikes: 0, maxStrikes: K.strikes, t: 0, limit: K.limit * (calm ? 1.5 : 1), events: [], held: {} };
  const ev = (type, extra = {}) => { g.events.push({ type, t: +g.t.toFixed(2), ...extra }); if (g.events.length > 40) g.events.shift(); };
  const strike = (why) => { g.strikes++; ev('strike', { why }); if (g.maxStrikes && g.strikes >= g.maxStrikes) end('fail', 'strikes'); };
  const end = (state, why) => { if (g.state !== 'play') return; g.state = state; g.why = why; ev(state, { why }); };
  g.cancel = () => end('cancel', 'cancelled');
  g.result = () => ({ state: g.state, strikes: g.strikes, t: +g.t.toFixed(2), why: g.why || null });
  if (kind === 'sequence') {
    g.code = Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 4)); g.pos = 0;
    g.key = (code, down = true) => { if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 4) return false; if (d === g.code[g.pos]) { g.pos++; ev('hit', { d }); if (g.pos >= g.code.length) end('win', 'code'); } else strike('wrong key'); return true; };
    g.solve = () => g.code[g.pos];   // the right key now (tests / auto-play)
    g.view = () => ({ code: g.code, pos: g.pos });
  } else if (kind === 'wires') {
    const n = 4, perm = [0, 1, 2, 3]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    if (perm.every((p, i) => p === i)) [perm[0], perm[1]] = [perm[1], perm[0]];   // never already wired
    g.right = perm;   // right[k] = which lead colour sits at terminal k
    g.done = [false, false, false, false]; g.sel = 0;
    const next = () => { const i = g.done.findIndex(x => !x); g.sel = i < 0 ? 0 : i; };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false;
      if (code === 'ArrowUp' || code === 'KeyW') { let s = g.sel; for (let k = 0; k < n; k++) { s = (s + n - 1) % n; if (!g.done[s]) break; } g.sel = s; return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { let s = g.sel; for (let k = 0; k < n; k++) { s = (s + 1) % n; if (!g.done[s]) break; } g.sel = s; return true; }
      const d = DIG(code); if (!d || d > n) return false;
      if (g.right[d - 1] === g.sel && !g.done[g.sel]) { g.done[g.sel] = true; ev('hit', { lead: g.sel, term: d }); if (g.done.every(Boolean)) end('win', 'wired'); else next(); } else strike('spark');
      return true;
    };
    g.solve = () => 1 + g.right.indexOf(g.sel);
    g.view = () => ({ right: g.right, done: g.done, sel: g.sel });
  } else if (kind === 'dial') {
    g.need = 3; g.hits = 0; g.x = 0; g.dir = 1; g.speed = (0.55 + rnd() * 0.15) * slow; g.band = [0, 0];
    const place = () => { const w = (0.22 - g.hits * 0.04) * (calm ? 1.3 : 1), c = 0.25 + rnd() * 0.5; g.band = [clamp(c - w / 2, 0.02, 0.98 - w), 0]; g.band[1] = g.band[0] + w; };
    place();
    g.key = (code, down = true) => { if (!down || g.state !== 'play' || (code !== 'Space' && code !== 'Enter')) return false; if (g.x >= g.band[0] && g.x <= g.band[1]) { g.hits++; ev('hit', { x: +g.x.toFixed(3) }); if (g.hits >= g.need) end('win', 'held'); else { place(); g.speed *= 1.12; } } else strike('spike'); return true; };
    g.step = (dt) => { g.x += g.dir * g.speed * dt; if (g.x > 1) { g.x = 2 - g.x; g.dir = -1; } if (g.x < 0) { g.x = -g.x; g.dir = 1; } };
    g.inBand = () => g.x >= g.band[0] && g.x <= g.band[1];
    g.view = () => ({ x: g.x, band: g.band, hits: g.hits, need: g.need });
  } else if (kind === 'calibrate') {
    g.need = 3; g.fill = 0; g.m = 0; g.target = 0.5; g.tw = (calm ? 0.16 : 0.11); g.ph = rnd() * 6.28; g.f1 = (0.35 + rnd() * 0.2) * slow; g.f2 = (0.9 + rnd() * 0.3) * slow;   // the marker starts parked at the left stop: the reading (0.17..0.83) never drifts onto it, so doing nothing never calibrates
    g.key = (code, down = true) => { const k = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[code]; if (!k) return false; g.held[k] = !!down; return true; };
    g.step = (dt) => {
      g.target = clamp(0.5 + 0.25 * Math.sin(g.t * g.f1 * 2 + g.ph) + 0.08 * Math.sin(g.t * g.f2 * 2 + g.ph * 2), 0.17, 0.83);
      g.m = clamp(g.m + ((g.held.R ? 1 : 0) - (g.held.L ? 1 : 0)) * 0.55 * dt, 0, 1);
      if (Math.abs(g.m - g.target) <= g.tw) g.fill += dt; else g.fill = Math.max(0, g.fill - dt * 0.35);
      if (g.fill >= g.need) end('win', 'calibrated');
    };
    g.inBand = () => Math.abs(g.m - g.target) <= g.tw;
    g.view = () => ({ m: g.m, target: g.target, tw: g.tw, fill: g.fill, need: g.need });
  }
  g.tick = (dt) => { if (g.state !== 'play') return; g.t += dt; g.step?.(dt); if (g.state === 'play' && g.t >= g.limit) end('fail', 'time'); };
  return g;
}

// ---- what the result does to the job: a win is a proper job done 40 % faster (a clean, no-strike win: 50 %); a fail still gets the job done,
// rushed (the duty's own rushed debt / score; a mission task counts as rushed). Cancel is not an outcome: the job stays due.
export function outcome(game) {
  const r = game.result ? game.result() : game;
  if (r.state === 'win') { const perfect = r.strikes === 0; return { quality: 'proper', timeMul: perfect ? 0.5 : 0.6, perfect, label: perfect ? 'Clean work' : 'Done properly' }; }
  if (r.state === 'fail') return { quality: 'rushed', timeMul: 1, perfect: false, label: r.why === 'time' ? 'Ran out of time — the job is logged as rushed' : 'Fumbled it — the job is logged as rushed' };
  return null;
}

// ---- which tools the player has been shown (persisted in the settings blob, CFG.learned in fb_cfg)
export function learnedStore(get, set) {
  const cur = () => { const v = get(); return v && typeof v === 'object' ? v : {}; };
  return { has: (id) => !!cur()[id], mark: (id) => { const v = { ...cur(), [id]: 1 }; set(v); return v; }, reset: () => set({}), list: () => Object.keys(cur()) };
}
