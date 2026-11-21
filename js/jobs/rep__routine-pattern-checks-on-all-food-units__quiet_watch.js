// Replicator tech: routine pattern checks on all food units. Sweep the sensor wand along the unit line (hold Left/Right). Every unit says PASS,
// but the colour bar under each shows how far it sits from the golden mark. Tap Space on any unit whose bar has crept out of the golden band.
import { define, machine, SPACE, ARROW, rf, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Routine pattern checks on all food units', type: 'task:quiet_watch' },
  title: 'Sensor wand drift sweep', dept: 'services', host: 'console', tool: 'Sensor wand and golden card',
  how: 'Hold Right to sweep the wand along the five units. Each says PASS, but its colour bar may sit outside the golden band. Tap Space on a drifting unit while the wand is over it.',
  keys: ['Right hold: sweep wand', 'Left hold: back', 'Space mark drift'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'sweep for drift', input: 'arrows-hold+space', win: 'wand swept the whole unit line with every drifting unit marked and no steady unit marked',
    fail: 'sweeping past a unit whose bar is outside the golden band without marking it, or marking a steady unit',
    rule: 'The wand moves only while an arrow is held. Each unit reads PASS regardless; mark it with Space when its bar is outside the golden band before the wand leaves it.' },
  rush: 'Took the PASS labels at face value and ticked the round sheet.',
  captions: { 'missed drift': 'readout drift tone', 'false drift': 'dull double tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, spd = m.calm ? 0.9 : 1.4; m.x = 0.05; m.rounds = 5; m.round = 0; m.passed = 0;
    const drift = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, 2 + (r() < 0.5 ? 1 : 0)));
    m.units = [0, 1, 2, 3, 4].map(i => ({ drift: drift.has(i), v: drift.has(i) ? (r() < 0.5 ? rf(r, 0.7, 0.85) : rf(r, 0.15, 0.3)) : rf(r, 0.42, 0.58), marked: false }));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && a !== 'L' && a !== 'R') return false;
      if (a) { m.held[a] = down; return true; } if (!down) return true; const u = m.units[Math.min(4, Math.floor(m.x))];
      if (!u.marked) { if (u.drift) u.marked = true; else m.fault('false drift'); } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const dx = ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * spd * dt, was = Math.floor(m.x); m.x = Math.max(0, m.x + dx);
      for (let i = m.passed; i < Math.min(5, Math.floor(m.x)); i++) { m.passed = i + 1; m.round = m.passed; if (m.units[i].drift && !m.units[i].marked) { m.fault('missed drift'); m.units[i].marked = true; } }
      if (m.state === 'play' && m.x >= 5) m.win();
    };
    m.hint = () => { const u = m.units[Math.min(4, Math.floor(m.x))], list = [['ArrowRight', true]]; if (u.drift && !u.marked && m.x % 1 > 0.25) list.push(['Space', true]); return list; };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ units: m.units.map(u => [u.drift, +u.v.toFixed(2)]) });
    m.buttons = () => [['ArrowLeft', '< sweep'], ['ArrowRight', 'sweep >'], ['Space', 'Mark drift']];
    m.draw = (c, W, H, P) => {
      m.units.forEach((u, i) => { const x = 14 + i * 76; box(c, x, 34, 68, 80, 'rgba(255,255,255,.05)', u.marked ? P.bad : COL.dim, 8); txt(c, `U${i + 1} PASS`, x + 8, 52, { size: 12 }); c.fillStyle = 'rgba(79,208,106,.25)'; c.fillRect(x + 8, 62 + 0, 52, 8); c.fillStyle = COL.pale; c.fillRect(x + 8 + u.v * 52 - 2, 58, 4, 16); if (u.marked) txt(c, 'DRIFT', x + 8, 100, { size: 12, col: P.bad }); });
      c.fillStyle = COL.gold; c.fillRect(14 + (m.x / 5) * 380 - 2, 24, 4, 100); txt(c, 'golden band = the shaded stripe', 14, 148, { size: 11, col: COL.dim });
    };
    return m;
  },
});
