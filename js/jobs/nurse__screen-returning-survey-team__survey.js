// Nurse: screen the returning survey team. Team members cross the sickbay door one by one and each dosimeter reading shows as they pass the
// gate. Send anyone above the line to a biobed (Up); clear anyone at or below it (Down). Each person is only in the gate for a short while.
import { define, machine, ARROW, ri, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Screen returning survey team', type: 'task:survey' },
  title: 'Dosimeter gate screening', dept: 'medical', host: 'console', tool: 'Sickbay door sensor',
  how: 'Each returning member stops in the gate for a moment. Press Up to send them to a biobed if their dosimeter reads above the line, or Down to clear them. Do not let anyone walk through unscreened.',
  keys: ['Up to biobed', 'Down clear'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'gate and sort', input: 'arrows', win: 'six returning members each sorted to biobed or cleared while in the gate by their reading against the line',
    fail: 'clearing a member above the line, sending one below it or letting someone walk through the gate unscreened',
    rule: 'Each member shows a dosimeter reading in the gate for a few seconds. Above the printed line press Up, otherwise press Down, before they walk on.' },
  rush: 'Waved the team through and asked them to report symptoms later.',
  captions: { 'cleared hot': 'dosimeter chirp', 'needless bed': 'dull double tone', unscreened: 'door cycles shut' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, stay = m.calm ? 2.6 : 1.8; m.line = ri(r, 4, 7); m.k = 0; m.clk = 0; m.rounds = 6; m.round = 0;
    m.team = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, rd: i % 3 === 1 ? m.line + ri(r, 1, 3) : r() < 0.2 ? m.line + 1 : m.line - ri(r, 1, 3) }));
    m.team.forEach(t => { t.rd = Math.max(0, t.rd); });
    const done = () => { m.k++; m.round = m.k; m.clk = 0; if (m.k >= 6) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (a !== 'U' && a !== 'D') return false; if (!down) return true; const t = m.team[m.k]; if (!t) return true;
      if ((a === 'U') === (t.rd > m.line)) done(); else m.fault(a === 'U' ? 'needless bed' : 'cleared hot'); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.clk += dt; if (m.clk >= stay) { m.fault('unscreened'); if (m.state === 'play') done(); } };
    m.hint = () => { const t = m.team[m.k]; return t ? [[t.rd > m.line ? 'ArrowUp' : 'ArrowDown', true]] : []; };
    m.bad = () => 'ArrowDown';
    m.view = () => ({ line: m.line, team: m.team.map(t => t.rd) });
    m.buttons = () => [['ArrowUp', 'To biobed'], ['ArrowDown', 'Clear']];
    m.draw = (c, W, H, P) => {
      txt(c, `Screen line: ${m.line} mSv`, 14, 22, { size: 14, col: COL.gold });
      m.team.forEach((t, i) => { box(c, 14 + i * 63, 40, 54, 26, i < m.k ? 'rgba(255,255,255,.04)' : i === m.k ? 'rgba(240,147,58,.25)' : 'rgba(255,255,255,.1)', i === m.k ? COL.orange : null, 6); txt(c, '#' + t.id, 22 + i * 63, 58, { col: i < m.k ? COL.dim : COL.ink }); });
      const t = m.team[m.k]; if (t) { txt(c, `Member #${t.id}   reading ${t.rd}`, 14, 100, { size: 18 }); txt(c, t.rd > m.line ? '▲ above the line' : '▼ at or below', 14, 124, { size: 12, col: t.rd > m.line ? P.bad : P.good }); }
      c.fillStyle = P.bad; c.fillRect(14, 142, Math.max(0, (1 - m.clk / stay)) * (W - 28), 8);
    };
    return m;
  },
});
