// Transporter chief: process beam requests. Key each request's coordinate digits into the targeting grid in order (one wrong digit and the
// grid is cleared: a transposed digit puts someone in a wall), then work the two-hand energize switch: hold Space only while the lock lamp is
// lit. The transfer builds while the lock holds; when the lock drops out you must come off the switch at once or the pattern scatters.
import { define, machine, DIG, SPACE, ri, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

const WHO = ['Lt. Okafor', 'Ens. Varga', 'Survey pair', 'Cmdr. Hale', 'Geology team', 'Dr. Imre'];
export default define({
  job: { billet: 'tchief', label: 'Process beam requests', type: 'loop' },
  title: 'Targeting grid and two-hand energize', dept: 'operations', host: 'console', tool: 'Transporter targeting grid',
  how: 'Type the request\'s four coordinate digits into the grid in order, then hold Space to energize only while the lock lamp is lit; come off it the moment the lock drops.',
  keys: ['1-9 coordinate digits', 'Space hold: energize'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'key and energize', input: 'digits+space-hold', win: 'three beam requests delivered with every coordinate digit keyed exactly and the energize switch held only under a live lock',
    fail: 'keying a wrong or transposed coordinate digit, energizing before the grid is set, or staying on the switch through a lock dropout',
    rule: 'Key the coordinate digits left to right. Then hold Space: the transfer fills only while the lock lamp is lit. When it goes dark, let go within a moment and wait for it to return.' },
  rush: 'Beamed off the request slip without reading the grid back.',
  captions: { 'wrong digit': 'grid reject tone', 'no target': 'energize interlock buzz', scattered: 'pattern scatter alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, grace = m.calm ? 0.45 : 0.3, need = 1.2;
    m.reqs = Array.from({ length: 3 }, () => ({ who: pick(r, WHO), n: ri(r, 1, 4), code: Array.from({ length: 4 }, () => ri(r, 1, 9)), typed: 0, prog: 0,
      sched: Array.from({ length: 12 }, (_, k) => k % 2 ? rf(r, 0.4, 0.7) : rf(r, 0.9, 1.6)) }));
    m.k = 0; m.rounds = 3; m.round = 0; m.pt = 0; m.offHeld = 0;
    const R = () => m.reqs[m.k];
    m.lock = () => { const q = R(); if (!q) return false; let t = m.pt; for (let k = 0; k < q.sched.length; k++) { if (t < q.sched[k]) return k % 2 === 0; t -= q.sched[k]; } return true; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const q = R(); if (!q) return false; const d = DIG(code);
      if (d) { if (!down) return true; if (q.typed >= 4) return true; if (d === q.code[q.typed]) { q.typed++; if (q.typed === 4) m.pt = 0; } else { m.fault('wrong digit'); q.typed = 0; } return true; }
      if (SPACE(code)) { if (down && !m.held.S && q.typed < 4) m.fault('no target'); m.held.S = down && q.typed >= 4; return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const q = R(); if (!q || q.typed < 4) return; m.pt += dt; const on = m.lock();
      if (m.held.S && on) { q.prog += dt; m.offHeld = 0; if (q.prog >= need) { m.ev('arrive', { k: m.k }); m.k++; m.round++; m.held.S = false; if (m.k >= 3) m.win(); } }
      else if (m.held.S && !on) { m.offHeld += dt; if (m.offHeld > grace) { m.fault('scattered'); q.prog = 0; m.offHeld = 0; m.held.S = false; } }
    };
    m.hint = () => { const q = R(); if (!q) return []; if (q.typed < 4) return [['Digit' + q.code[q.typed], true]]; return [['Space', m.lock()]]; };
    m.bad = () => { const q = R(); if (!q) return null; return q.typed < 4 ? 'Digit' + (q.code[q.typed] % 9 + 1) : null; };
    m.view = () => ({ reqs: m.reqs.map(q => [q.who, q.n, q.code.join('')]) });
    m.buttons = () => [...Array.from({ length: 9 }, (_, i) => ['Digit' + (i + 1), String(i + 1)]), ['Space', 'Energize (hold)']];
    m.draw = (c, W, H, P) => {
      const q = R(); if (!q) { txt(c, 'All requests delivered', W / 2, H / 2, { align: 'center', col: P.good }); return; }
      box(c, 10, 10, 180, 70, 'rgba(255,255,255,.05)', COL.peri, 10);
      txt(c, `REQUEST ${m.k + 1}/3`, 20, 28, { size: 11, col: COL.dim }); txt(c, `${q.who} · ${q.n} to beam`, 20, 46, { size: 12, col: COL.gold });
      txt(c, 'Coords ' + q.code.join(' '), 20, 68, { size: 15, col: COL.ink, font: 'monospace' });
      txt(c, 'TARGETING GRID', 210, 24, { size: 11, col: COL.dim });
      for (let i = 0; i < 4; i++) { box(c, 210 + i * 44, 32, 36, 40, i < q.typed ? 'rgba(79,208,106,.18)' : 'rgba(255,255,255,.06)', i === q.typed ? COL.orange : null, 6); if (i < q.typed) txt(c, q.code[i], 228 + i * 44, 59, { size: 18, align: 'center', font: 'monospace' }); }
      const on = q.typed >= 4 && m.lock(); lamp(c, 30, 116, 12, on ? P.good : P.bad, on ? 'circle' : 'triangle');
      txt(c, q.typed < 4 ? 'lock: set the grid first' : on ? 'LOCK HELD' : 'LOCK DROPPED — off the switch', 50, 121, { size: 12, col: on ? P.good : COL.warn });
      txt(c, m.held.S ? 'ENERGIZING' : 'switch off', W - 14, 121, { size: 12, align: 'right', col: m.held.S ? COL.orange : COL.dim });
      txt(c, 'transfer', 14, 146, { size: 10, col: COL.dim }); bar(c, 70, 138, W - 84, 12, q.prog / need, { col: COL.peri });
    };
    return m;
  },
});
