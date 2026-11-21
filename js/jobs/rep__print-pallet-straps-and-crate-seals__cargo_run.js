// Replicator tech: print pallet straps and crate seals. Hold Right or Left to run the length setting up or down to the manifest figure, then press
// Space to print. When the strap comes out a cutting marker slides along it: press Space as it crosses the marked line.
import { define, machine, SPACE, ARROW, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Print pallet straps and crate seals', type: 'task:cargo_run' },
  title: 'Set the length, cut at the mark', dept: 'services', host: 'console', tool: 'Strap length dial and shears',
  how: 'Hold Right or Left to dial the strap length to the manifest figure and press Space to print. Then press Space again when the shear marker crosses the line on the strap.',
  keys: ['Left/Right hold: length', 'Space print / cut'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'dial length, cut', input: 'arrows-hold+space', win: 'three straps each printed at the manifest length and cut with the shears as the marker crossed the line',
    fail: 'printing at a length off the manifest figure by more than one unit or cutting with the marker off the line',
    rule: 'Hold an arrow to run the length setting (it speeds up the longer you hold) and Space prints it. After the print, Space cuts as the marker crosses the band.' },
  rush: 'Printed the standard strap length and cut it roughly by eye.',
  captions: { 'wrong length': 'replicator reject tone', 'off the line': 'shears bite off-mark' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, per = m.calm ? 2.4 : 1.6, band = m.calm ? 0.1 : 0.06; m.k = 0; m.len = 20; m.hold = 0; m.st = 0; m.clk = 0; m.rounds = 3; m.round = 0;
    m.job_ = [0, 1, 2].map(() => ({ want: ri(r, 24, 58), mark: ri(r, 3, 7) / 10 }));
    const J = () => m.job_[Math.min(m.k, 2)]; m.cpos = () => { const p = (m.clk / per) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && a !== 'L' && a !== 'R') return false;
      if (a) { m.held[a] = down; if (!down) m.hold = 0; return true; } if (!down) return true;
      if (m.st === 0) { if (Math.abs(m.len - J().want) <= 1) { m.st = 1; m.clk = 0; } else m.fault('wrong length'); }
      else if (m.st === 2) { if (Math.abs(m.cpos() - J().mark) <= band) { m.k++; m.round = m.k; m.st = 0; m.len = 20; if (m.k >= 3) m.win(); } else m.fault('off the line'); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0);
      if (m.st === 0 && d) { m.hold += dt; m.len = Math.max(5, Math.min(80, m.len + d * (m.hold > 1.2 ? 14 : 6) * dt)); }
      if (m.st === 1) { m.clk += dt; if (m.clk >= 1.0) { m.st = 2; m.clk = 0; } } else if (m.st === 2) m.clk += dt;
    };
    m.hint = () => { const j = J(); if (m.st === 0) { const e = j.want - m.len; return Math.abs(e) <= 0.6 ? [['ArrowRight', false], ['ArrowLeft', false], ['Space', true]] : [['ArrowRight', e > 0], ['ArrowLeft', e < 0]]; } if (m.st === 2 && Math.abs(m.cpos() - j.mark) <= band * 0.5) return [['Space', true]]; return []; };
    m.bad = () => m.st === 0 ? 'Space' : null;
    m.view = () => ({ job: m.job_.map(j => [j.want, j.mark]) });
    m.buttons = () => [['ArrowLeft', 'Shorter'], ['ArrowRight', 'Longer'], ['Space', 'Print / Cut']];
    m.draw = (c, W, H, P) => {
      const j = J(); txt(c, `Manifest strap ${Math.min(m.k + 1, 3)}: ${j.want} cm`, 14, 22, { size: 14, col: COL.gold }); txt(c, `length ${m.len.toFixed(0)} cm`, 14, 56, { size: 18, col: m.st === 0 && Math.abs(m.len - j.want) <= 1 ? P.good : COL.ink });
      if (m.st >= 1) { box(c, 14, 80, W - 28, 24, 'rgba(255,255,255,.08)', null, 4); c.fillStyle = COL.pale; c.fillRect(14 + j.mark * (W - 28) - 2, 76, 4, 32); if (m.st === 2) { c.fillStyle = COL.gold; c.fillRect(14 + m.cpos() * (W - 28) - 1, 70, 3, 44); } }
      txt(c, m.st === 0 ? 'dial the length, then Space to print' : m.st === 1 ? 'printing...' : 'Space as the marker crosses the line', 14, 140, { size: 12, col: COL.dim });
    };
    return m;
  },
});
