// Transporter chief: beam cargo to the hold. Hold the batch switch (Space) and the crates on the pad dematerialise one after another while
// the pad tally counts down. Now and then the next crate's pattern flickers on the pad monitor: a crate sent while it flickers lands on the
// wrong deck, so come off the switch until it steadies. When the tally reads zero and the bay has confirmed the count, log the batch (Enter).
import { define, machine, SPACE, ENTER, ri, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

const DECKS = ['Hold 2, deck 9', 'Hold 1, deck 11', 'Hold 3, deck 12', 'Aft hold, deck 14'];
export default define({
  job: { billet: 'tchief', label: 'Beam cargo to hold', type: 'task:cargo_run' },
  title: 'Batch switch with pattern flicker', dept: 'operations', host: 'console', tool: 'Batch transfer switch and pad tally',
  how: 'Hold Space to run the batch: crates beam out one by one. Let go whenever the next crate\'s pattern flickers, hold again once it is steady. At zero, wait for the bay to confirm, then press Enter to log.',
  keys: ['Space hold: batch transfer', 'Enter log the batch'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'beam the batch', input: 'space-hold+enter', win: 'two cargo batches emptied from the pad with no crate sent while its pattern flickered and each logged only after the bay confirmed the count',
    fail: 'sending a crate through a pattern flicker so it lands on the wrong deck, or logging a batch before the tally and bay agree',
    rule: 'While Space is held a crate leaves every half second. If the NEXT CRATE lamp flickers, release until it is steady. When the tally is zero and BAY CONFIRMS shows, press Enter.' },
  rush: 'Ran the whole batch on one hold and logged it from the manifest.',
  captions: { 'wrong deck': 'misroute alarm', 'logged short': 'log reject tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = 0.5, conf = 0.6, grace = m.calm ? 0.4 : 0.25;
    m.batches = Array.from({ length: 2 }, () => ({ deck: pick(r, DECKS), n: ri(r, 5, 7), left: 0, bay: 0 })); m.batches.forEach(b => { b.left = b.n; });
    m.flick = []; { let t = rf(r, 0.8, 1.6); while (t < m.limit) { const d = rf(r, 0.7, 1.2); m.flick.push([+t.toFixed(2), +(t + d).toFixed(2)]); t += d + rf(r, 1.0, 2.2); } }
    m.k = 0; m.prog = 0; m.rounds = 2; m.round = 0;
    const B = () => m.batches[m.k];
    m.flickAge = () => { const w = m.flick.find(([a, b]) => m.t >= a && m.t < b); return w ? m.t - w[0] : -1; };
    m.flickering = () => m.flickAge() >= 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { m.held.S = down; return true; }
      if (ENTER(code)) { if (!down) return true; const b = B(); if (!b) return true; if (b.left > 0 || b.bay < conf) { m.fault('logged short'); return true; } m.ev('log', { k: m.k }); m.k++; m.round++; m.prog = 0; if (m.k >= 2) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const b = B(); if (!b) return;
      if (b.left === 0) { b.bay += dt; return; }
      if (!m.held.S) return; m.prog += dt;
      if (m.prog >= gap) { const fa = m.flickAge(); if (fa >= 0 && fa < grace) { m.prog = gap; return; } m.prog = 0; if (fa >= 0) { m.fault('wrong deck'); } else { b.left--; m.ev('beam', { left: b.left }); } }
    };
    m.hint = () => { const b = B(); if (!b) return []; if (b.left === 0) return b.bay >= conf ? [['Space', false], ['Enter', true]] : [['Space', false]]; return [['Space', !m.flickering()]]; };
    m.bad = () => (m.held.S ? 'Enter' : ['Space', true]);
    m.view = () => ({ b: m.batches.map(b => [b.deck, b.n]), f: m.flick.slice(0, 4) });
    m.buttons = () => [['Space', 'Batch (hold)'], ['Enter', 'Log batch']];
    m.draw = (c, W, H, P) => {
      const b = B(); if (!b) { txt(c, 'Both batches landed and logged', W / 2, H / 2, { align: 'center', col: P.good }); return; }
      txt(c, `BATCH ${m.k + 1}/2 → ${b.deck}`, 14, 20, { size: 12, col: COL.gold });
      txt(c, 'PAD TALLY', 14, 44, { size: 10, col: COL.dim });
      for (let i = 0; i < b.n; i++) box(c, 14 + i * 34, 52, 28, 28, i < b.left ? 'rgba(244,194,91,.35)' : 'rgba(255,255,255,.05)', i === b.left - 1 ? COL.orange : null, 4);
      txt(c, String(b.left), W - 20, 74, { size: 22, align: 'right', col: COL.ink });
      const fl = b.left > 0 && m.flickering(); lamp(c, 26, 104, 10, fl ? P.bad : P.good, fl ? 'triangle' : 'circle');
      txt(c, b.left === 0 ? 'pad empty' : fl ? 'NEXT CRATE PATTERN FLICKERING — off the switch' : 'next crate pattern steady', 44, 108, { size: 11, col: fl ? COL.warn : COL.dim });
      txt(c, m.held.S ? 'TRANSFER RUNNING' : 'switch released', 14, 136, { size: 11, col: m.held.S ? COL.orange : COL.dim });
      if (b.left === 0) { txt(c, b.bay >= conf ? 'BAY CONFIRMS COUNT — log it' : 'waiting for bay count…', W - 14, 136, { size: 11, align: 'right', col: b.bay >= conf ? P.good : COL.warn }); }
      bar(c, 14, 146, W - 28, 8, m.prog / gap, { col: COL.peri });
    };
    return m;
  },
});
