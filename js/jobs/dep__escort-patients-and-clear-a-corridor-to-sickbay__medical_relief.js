// Deputy security chief, medical relief: walk ahead of a stretcher and keep the lane to sickbay clear. People drift into the lane; when one is
// within reach ahead of the stretcher, ask them to step aside (Space). Some are dazed and need asking twice. Asking when nobody is close
// enough just shoves the crowd. At each junction door, hold it open (hold Up) while the stretcher passes; let go while it is in the frame and
// the door closes on it. Anyone still in the lane, or a door nobody holds, stops the stretcher and the corridor jams.
import { define, machine, SPACE, ARROW, rf, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Escort patients and clear a corridor to sickbay', type: 'task:medical_relief' },
  title: 'Stretcher lane clearing', dept: 'security', host: 'console', tool: 'Corridor to sickbay',
  how: 'Press Space to ask the person in the lane ahead to step aside once they are within reach (some need asking twice). Hold Up to hold each junction door open while the stretcher goes through.',
  keys: ['Space ask the person ahead to step aside', 'Up hold: hold the junction door'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'clear the lane', input: 'space+arrows-hold', win: 'the stretcher rolls all the way to sickbay without stopping for a person in the lane or a closed door',
    fail: 'a person left standing in the lane or a door let go so the stretcher jams, or shoving the crowd when nobody is in reach',
    rule: 'People in the lane show a reach marker once they are close ahead: Space asks them aside (a ! means ask again). At a door hold Up until the stretcher is past the frame.' },
  rush: 'Barged a path with the stretcher and apologised to the bruised.',
  captions: { jam: 'stretcher stops short', shoved: 'crowd jostles', 'door shut': 'door bumps the stretcher' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, L = 24, reach = 5;
    m.v = m.calm ? 1.0 : 1.3; m.x = 0; m.stop = 0; m.cool = 0; m.L = L;
    m.doors = [rf(r, 7, 9.5), rf(r, 15, 18)].map(d => ({ d }));
    m.ppl = []; let p = rf(r, 3.5, 5); while (p < L - 2) { if (m.doors.every(o => Math.abs(o.d - p) > 2)) m.ppl.push({ p, asks: r() < 0.35 ? 2 : 1, out: false }); p += rf(r, 2.6, 4.2); }
    m.rounds = m.ppl.length; m.round = 0;
    const near = () => m.ppl.find(q => !q.out && q.p > m.x && q.p - m.x <= reach);
    const door = () => m.doors.find(o => m.x > o.d - 2.2 && m.x < o.d + 1.2);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (ARROW(code) === 'U') { const was = m.held.U; m.held.U = down; if (was && !down) { const o = door(); if (o && m.x > o.d - 1 && m.x < o.d + 1) m.fault('door shut'); } return true; }
      if (!SPACE(code)) return false; if (!down || m.cool > 0) return true;
      const q = near(); m.cool = 0.25; if (!q) { m.fault('shoved'); return true; }
      q.asks--; if (q.asks <= 0) { q.out = true; m.round++; } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cool = Math.max(0, m.cool - dt);
      const blockP = m.ppl.find(q => !q.out && q.p > m.x && q.p - m.x < 0.6), o = m.doors.find(o => m.x > o.d - 1.6 && m.x < o.d - 1.2), blockD = o && !m.held.U;
      if (blockP || blockD) { m.stop += dt; if (m.stop > 0.9) { m.fault('jam'); m.stop = 0; } return; }
      m.stop = 0; m.x += m.v * dt; if (m.x >= L) m.win();
    };
    m.hint = () => { const out = [], o = door(); out.push(['ArrowUp', !!o]); const q = near(); if (q && m.cool <= 0) out.push(['Space', true]); return out; };
    m.bad = () => 'Space';
    m.view = () => ({ ppl: m.ppl.map(q => [+q.p.toFixed(1), q.asks]), doors: m.doors.map(o => +o.d.toFixed(1)) });
    m.buttons = () => [['Space', 'Step aside, please'], ['ArrowUp', 'Hold door']];
    m.draw = (c, W, H, P) => {
      const s = (v) => 30 + (v - m.x + 4) * 22, y = 84;
      box(c, 10, y - 26, 380, 52, 'rgba(255,255,255,.04)', 'rgba(255,255,255,.12)', 4);
      m.doors.forEach(o => { const X = s(o.d); if (X < 0 || X > 400) return; const open = m.held.U && door() === o; c.fillStyle = open ? P.good : COL.lav; c.fillRect(X - 2, y - 26, 4, open ? 10 : 52); txt(c, open ? 'HELD' : 'DOOR', X, y - 32, { size: 9, align: 'center', col: open ? P.good : COL.lav }); });
      m.ppl.forEach(q => { const X = s(q.p); if (X < 0 || X > 400) return; const inR = !q.out && q.p > m.x && q.p - m.x <= reach; lamp(c, X, q.out ? y - 20 : y, 8, q.out ? COL.dim : inR ? COL.warn : COL.ink, q.out ? 'circle' : 'triangle'); if (!q.out && q.asks > 1) txt(c, '!', X + 10, y - 6, { size: 12, col: COL.warn }); });
      box(c, s(m.x) - 26, y - 8, 26, 16, COL.peri, null, 3); txt(c, '+', s(m.x) - 13, y + 5, { size: 12, align: 'center', col: COL.dark });
      c.strokeStyle = 'rgba(244,194,91,.4)'; c.strokeRect(s(m.x), y - 22, reach * 22, 44);
      txt(c, `Sickbay in ${Math.max(0, L - m.x).toFixed(0)} m`, 14, 160, { size: 11, col: COL.pale }); if (m.stop > 0) txt(c, 'STOPPED', 386, 160, { size: 11, align: 'right', col: P.bad });
    };
    return m;
  },
});
