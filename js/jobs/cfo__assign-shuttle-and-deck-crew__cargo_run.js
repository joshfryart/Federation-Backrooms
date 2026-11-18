// CFO: assign shuttle and deck crew for the cargo run. Crew tokens come off the roster one at a time and sink down the crew board toward the
// pad. Steer each token (← / →) over the loading station that needs its skill and drop it there (Space). A crew member still on rest, or one
// whose station is already filled, goes back to the bunk room (↓). A token that reaches the bottom unhandled drops wherever it is.
import { define, machine, SPACE, ARROW, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const SK = ['Pilot', 'Loader', 'Rigger', 'Fuel', 'Spotter'], NM = ['Abara', 'Brandt', 'Cho', 'Diaz', 'Eke', 'Furlan', 'Gupta', 'Holm', 'Ivers', 'Jansen'];
export default define({
  job: { billet: 'cfo', label: 'Assign shuttle and deck crew', type: 'task:cargo_run' },
  title: 'Crew token drop onto loading stations', dept: 'flight', host: 'console', tool: 'Crew board by the shuttle pad',
  how: 'Steer each sinking crew token (← / →) over the empty station that needs its skill and drop it with Space. Send rested-out or surplus crew back with ↓ before the token reaches the pad.',
  keys: ['← / → steer', 'Space drop', '↓ send back'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'drop crew', input: 'arrows+space', win: 'every loading station filled by a rested crew member with its skill before the load starts, off-rest and surplus crew sent back',
    fail: 'dropping crew onto a filled or wrong-skill station, putting an off-rest pilot to work, or letting a token sink onto the pad unhandled',
    rule: 'Each token shows a skill and a rest tag. Steer it over the empty station of that skill and press Space; if it is on rest or its station is taken, press ↓. Tokens sink on a timer.' },
  rush: 'Sent whoever was in the bunk room out to the pad and let them sort it out.',
  captions: { 'wrong station': 'board buzzer', 'off rest': 'medical flag', sank: 'token clatters onto the pad', 'sent back fit crew': 'station stays empty' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, fall = m.calm ? 5.5 : 4.2, nm = shuffle(r, NM);
    const q = SK.map((s, i) => ({ n: nm[i], s, rest: true })); const xs = shuffle(r, [0, 1, 2, 3, 4]);
    q.push({ n: nm[5], s: SK[xs[0]], rest: false }, { n: nm[6], s: SK[xs[1]], rest: false }); if (r() < 0.6) q.push({ n: nm[7], s: SK[xs[2]], rest: true });
    m.q = shuffle(r, q); m.k = 0; m.x = 2; m.y = 0; m.fill = SK.map(() => null); m.rounds = m.q.length; m.round = 1;
    const T = () => m.q[m.k], needed = (t) => t.rest && m.fill[SK.indexOf(t.s)] === null;
    const next = () => { m.k++; m.x = 2; m.y = 0; m.round = Math.min(m.rounds, m.k + 1); if (m.k >= m.q.length) { if (m.fill.every(Boolean)) m.win(); else m.fail('station unmanned'); } };
    const drop = (at) => { const t = T(); if (!t.rest) m.fault('off rest'); else if (SK[at] !== t.s || m.fill[at]) m.fault('wrong station'); else m.fill[at] = t; next(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L') { m.x = Math.max(0, m.x - 1); return true; } if (a === 'R') { m.x = Math.min(4, m.x + 1); return true; }
      if (a === 'D') { if (needed(T())) m.fault('sent back fit crew'); next(); return true; } if (a) return true;
      if (SPACE(code)) { drop(m.x); return true; } return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.y += dt / fall; if (m.y >= 1) { m.fault('sank'); if (m.state === 'play') drop(m.x); } };
    m.hint = () => { const t = T(); if (!t || m.y < 0.12) return []; if (!needed(t)) return [['ArrowDown', true]]; const at = SK.indexOf(t.s); return [[at < m.x ? 'ArrowLeft' : at > m.x ? 'ArrowRight' : 'Space', true]]; };
    m.bad = () => { const t = T(); return t && !t.rest ? 'Space' : null; };
    m.view = () => ({ q: m.q.map(t => [t.n, t.s, t.rest]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Drop'], ['ArrowDown', '▼ Back to bunks']];
    m.draw = (c, W, H, P) => {
      SK.forEach((s, i) => { const x = 14 + i * 76, f = m.fill[i]; box(c, x, 128, 70, 34, COL.panel, f ? P.good : 'rgba(255,255,255,.2)', 5); txt(c, s, x + 6, 142, { size: 11, col: COL.pale }); txt(c, f ? f.n : 'empty', x + 6, 157, { size: 11, col: f ? COL.ink : COL.dim }); });
      const t = T(); if (!t) return; const x = 14 + m.x * 76, y = 8 + m.y * 92;
      box(c, x, y, 70, 30, COL.dark, COL.gold, 5); txt(c, t.n, x + 5, y + 13, { size: 11 }); txt(c, t.s, x + 5, y + 26, { size: 10, col: COL.pale });
      lamp(c, x + 60, y + 15, 6, t.rest ? P.good : P.bad, t.rest ? 'circle' : 'triangle'); txt(c, t.rest ? '' : 'ON REST', x + 74, y + 18, { size: 10, col: P.bad });
    };
    return m;
  },
});
