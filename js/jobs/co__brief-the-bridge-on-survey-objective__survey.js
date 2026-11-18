// Captain: brief the bridge on the survey objective. The objective line describes the target body; glide the stylus crosshair over the
// sensor plot (hold the arrows), pin the body that fits the description (Enter), then write the duration from that body's sweep figure
// (its number key). Pinning a body that is not the one described, or writing the wrong duration, is a fault. Two objectives make a brief.
import { define, machine, DIG, ARROW, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const KIND = [['ringed gas giant', 'ringed'], ['ice moon', 'icy'], ['rocky planet', 'rocky'], ['asteroid cluster', 'rubble'], ['brown dwarf', 'dim'], ['ocean world', 'wet']];
const NAME = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const SPOT = [[40, 40], [110, 30], [200, 40], [60, 125], [150, 135], [225, 115], [250, 70], [30, 85]];
const ARR = { L: 'ArrowLeft', R: 'ArrowRight', U: 'ArrowUp', D: 'ArrowDown' };

export default define({
  job: { billet: 'co', label: 'Brief the bridge on survey objective', type: 'task:survey' },
  title: 'Survey target pin and duration', dept: 'command', host: 'console', tool: 'Sensor plot and survey brief form',
  how: 'Read the objective, glide the crosshair onto the body it describes and pin it, then write that body’s sweep hours as the duration.',
  keys: ['arrows hold: glide', 'Enter pin', '1-9 duration h'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'pin the target', input: 'arrows-hold+enter+digits', win: 'both survey objectives pinned to the plotted body that fits the description with its sweep hours written',
    fail: 'pinning a body that does not match the objective, or writing a duration that differs from its sweep figure',
    rule: 'Hold the arrows to glide the crosshair over the plot; Enter pins the body under it, which must be the kind the objective names. Then press the digit of its sweep hours.' },
  rush: 'Wrote "survey the system, as long as it takes" and dropped it in the tray.',
  captions: { 'not the objective': 'science officer frowns', 'wrong duration': 'helm queries the time' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sp = m.calm ? 95 : 120, spots = shuffle(r, SPOT), kinds = shuffle(r, KIND), names = shuffle(r, NAME);
    m.bodies = [0, 1, 2, 3, 4].map(i => ({ x: spots[i][0], y: spots[i][1], kind: kinds[i][0], tag: kinds[i][1], name: names[i], h: ri(r, 2, 9) }));
    const pickIx = shuffle(r, [0, 1, 2, 3, 4]); m.goals = [pickIx[0], pickIx[1]]; m.gi = 0; m.phase = 'pin'; m.cx = 140; m.cy = 85; m.rounds = 2; m.round = 0;
    const goal = () => m.bodies[m.goals[m.gi]], under = () => m.bodies.find(b => Math.hypot(b.x - m.cx, b.y - m.cy) < 12);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { m.held[a] = down; return true; } if (!down) return false; const d = DIG(code);
      if (ENTER(code)) { if (m.phase !== 'pin') return true; if (under() !== goal()) { m.fault('not the objective'); return true; } m.phase = 'dur'; return true; }
      if (d && m.phase === 'dur') { if (d !== goal().h) { m.fault('wrong duration'); return true; } m.round++; m.gi++; m.phase = 'pin'; if (m.gi >= 2) m.win(); return true; }
      return !!d;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const v = sp * dt;
      if (m.held.L) m.cx -= v; if (m.held.R) m.cx += v; if (m.held.U) m.cy -= v; if (m.held.D) m.cy += v;
      m.cx = Math.max(8, Math.min(272, m.cx)); m.cy = Math.max(14, Math.min(160, m.cy));
    };
    m.hint = () => {
      if (m.gi >= 2) return []; const g = goal(), dx = g.x - m.cx, dy = g.y - m.cy, out = [];
      if (m.phase === 'dur') return [['ArrowLeft', false], ['ArrowRight', false], ['ArrowUp', false], ['ArrowDown', false], ['Digit' + g.h, true]];
      out.push([ARR.R, dx > 4], [ARR.L, dx < -4], [ARR.D, dy > 4], [ARR.U, dy < -4]);
      if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) out.push(['Enter', true]); return out;
    };
    m.bad = () => m.phase === 'pin' ? 'Enter' : 'Digit' + (goal().h % 9 + 1);
    m.view = () => ({ b: m.bodies.map(b => [b.x, b.y, b.kind, b.h]), goals: m.goals });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶'], ['Enter', 'Pin'], ...[2, 3, 4, 5, 6, 7, 8, 9].map(k => ['Digit' + k, k + ' h'])];
    m.draw = (c, W, H, P) => {
      box(c, 4, 6, 276, 158, 'rgba(10,9,18,.6)', COL.peri, 8);
      m.bodies.forEach(b => { lamp(c, b.x, b.y, 7, COL.lav, b.tag === 'ringed' ? 'diamond' : b.tag === 'icy' ? 'triangle' : b.tag === 'rocky' ? 'square' : 'circle'); txt(c, `${b.name} · ${b.kind}`, b.x + 10, b.y - 2, { size: 8, col: COL.dim }); txt(c, `sweep ${b.h} h`, b.x + 10, b.y + 8, { size: 8, col: COL.pale }); });
      c.strokeStyle = COL.orange; c.lineWidth = 1.5; c.beginPath(); c.arc(m.cx, m.cy, 10, 0, 6.283); c.moveTo(m.cx - 15, m.cy); c.lineTo(m.cx + 15, m.cy); c.moveTo(m.cx, m.cy - 15); c.lineTo(m.cx, m.cy + 15); c.stroke();
      if (m.gi >= 2) return; const g = goal();
      txt(c, `OBJECTIVE ${m.gi + 1} / 2`, 290, 20, { size: 10, col: COL.gold }); txt(c, 'Survey the', 290, 40, { size: 11 }); txt(c, g.kind, 290, 56, { size: 12, col: COL.pale });
      txt(c, 'BRIEF FORM', 290, 86, { size: 10, col: COL.gold }); txt(c, `target: ${m.phase === 'dur' ? g.name : '—'}`, 290, 104, { size: 11 });
      txt(c, `duration: ${m.phase === 'dur' ? '? h' : '—'}`, 290, 122, { size: 11, col: m.phase === 'dur' ? COL.warn : COL.ink });
      txt(c, m.phase === 'pin' ? 'Enter: pin under cross' : 'digit: sweep hours', 290, 148, { size: 9, col: COL.dim });
    };
    return m;
  },
});
