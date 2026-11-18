// Transporter chief: recover the samples and the team. For each roster line, hold the recall switch while the pad sensor counts arrivals one by
// one, and let go when the count matches the line. Letting go early strands someone in the buffer; holding long after the last one strains
// the pattern buffer.
import { define, machine, SPACE, ri, rf, pick, txt, box, bar, COL } from './kit.js';

const LINES = [['Away team', 'crew'], ['Sample cases', 'cases'], ['Survey drones', 'drones'], ['Geology kit', 'crates'], ['Botany team', 'crew']];
export default define({
  job: { billet: 'tchief', label: 'Recover samples and team', type: 'task:survey' },
  title: 'Recall switch count-in', dept: 'operations', host: 'console', tool: 'Transporter recall switch',
  how: 'Hold Space on the recall switch: the pad counts each arrival. Release the moment the count matches the roster line, then the next line.',
  keys: ['Space hold: recall'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'count-in', input: 'space-hold', win: 'every roster line recalled with the switch released right on its count',
    fail: 'releasing before the count is complete, or holding the recall open long after the last arrival',
    rule: 'Hold Space to keep the recall energised; arrivals tick in at uneven intervals. Let go as soon as the count equals the line\'s number; earlier strands someone, more than a second after strains the buffer.' },
  rush: 'Held the switch until the pad went quiet and logged the line counts afterwards.',
  captions: { stranded: 'buffer warning chime', 'buffer strain': 'pattern buffer whine' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, grace = m.calm ? 1.4 : 1.0;
    m.lines = Array.from({ length: 3 }, () => { const [name, unit] = pick(r, LINES); return { name, unit, need: ri(r, 2, 4), got: 0, gaps: Array.from({ length: 4 }, () => rf(r, 0.5, 1.1)) }; });
    m.k = 0; m.wait = 0; m.over = 0; m.rounds = 3; m.round = 0;
    const L = () => m.lines[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false; const was = m.held.S; m.held.S = down;
      if (was && !down) { const l = L(); if (l.got < l.need) { if (l.got > 0) { m.fault('stranded'); l.got = 0; } } else { m.k++; m.round++; m.wait = 0; m.over = 0; if (m.k >= 3) m.win(); } }
      if (!was && down) m.wait = 0;
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const l = L(); if (!l || !m.held.S) return;
      if (l.got < l.need) { m.wait += dt; if (m.wait >= l.gaps[l.got]) { m.wait = 0; l.got++; m.ev('arrive', { n: l.got }); } }
      else { m.over += dt; if (m.over > grace) { m.fault('buffer strain'); m.over = 0; l.got = 0; m.held.S = false; } }
    };
    m.hint = () => { const l = L(); if (!l) return []; return [['Space', l.got < l.need]]; };
    m.bad = () => { const l = L(); return !m.held.S ? 'Space' : l.got >= 1 ? ['Space', false] : null; };
    m.view = () => ({ lines: m.lines.map(l => [l.name, l.need, l.gaps.map(g => +g.toFixed(2))]) });
    m.buttons = () => [['Space', 'Recall (hold)']];
    m.draw = (c, W, H, P) => {
      m.lines.forEach((l, i) => {
        const y = 12 + i * 34, on = i === m.k; box(c, 10, y, W - 20, 28, on ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 12);
        txt(c, `${l.name}: ${l.need} ${l.unit}`, 22, y + 18, { size: 12, col: COL.gold });
        for (let k = 0; k < l.need; k++) { c.fillStyle = k < l.got ? P.good : 'rgba(255,255,255,.15)'; c.fillRect(220 + k * 26, y + 7, 20, 14); }
        if (i < m.k) txt(c, '✓', W - 20, y + 19, { size: 14, col: P.good, align: 'right' });
      });
      const l = L(); txt(c, m.held.S ? (l && l.got >= l.need ? 'COUNT MATCHED — RELEASE' : 'RECALL ENERGISED') : 'switch open', 14, H - 30, { size: 12, col: m.held.S ? COL.warn : COL.dim });
      bar(c, 14, H - 22, W - 28, 10, l && l.got >= l.need ? m.over / grace : 0, { col: P.bad });
    };
    return m;
  },
});
