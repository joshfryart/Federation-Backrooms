// Lab technician: run the queued samples. Each tube comes off the queue tray with a barcode; the queue card maps the barcode to its queue
// number, and the spectrometer tray's slots carry queue numbers in a shuffled order. Slot the tube (digit) into the slot whose number matches
// the card, so tube and rack agree. Then the trace draws peak by peak: once it is complete, compare every peak to its band on the card and
// save it (Space) if all are in, or flag it for a re-run (Enter) if any peak sits outside. A swapped slot or a wrong verdict is a fault.
import { define, machine, DIG, SPACE, ENTER, ri, rf, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Run queued samples', type: 'loop' },
  title: 'Barcode to slot, peaks to band', dept: 'sciences', host: 'console', tool: 'Spectrometer tray and queue card',
  how: 'Read the tube barcode, find its queue number on the card and slot it (1-5) into the tray slot with that number. When the trace is drawn, save it (Space) if every peak sits in its band, or flag a re-run (Enter).',
  keys: ['1-5 slot the tube', 'Space save result', 'Enter flag re-run'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'slot and band-check', input: 'digits+space+enter', win: 'every queued tube racked in the slot its card number names and its finished spectrum saved or sent back for re-run correctly',
    fail: 'racking a tube in another sample\'s slot, judging a half-drawn trace, or saving a spectrum with a peak out of band',
    rule: 'Look up the barcode on the queue card, press the tray slot carrying that queue number, wait for the trace to finish, then Space if all peaks sit in their bands or Enter if any does not.' },
  rush: 'Dropped the tubes in whatever slot was free and saved every trace unread.',
  captions: { swapped: 'rack buzzer', 'half-drawn': 'trace still drawing', 'wrong result': 'error chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, draw = m.calm ? 1.4 : 1.0;
    const qn = shuffle(r, [11, 12, 13, 14, 15, 16, 17, 18, 19]).slice(0, 5);
    m.card = qn.map(q => ({ q, bc: `${ri(r, 2, 9)}${ri(r, 0, 9)}${ri(r, 0, 9)}-${ri(r, 10, 99)}` }));
    m.tray = shuffle(r, qn);   // slot i (1..5) carries queue number tray[i-1]
    const order = shuffle(r, [0, 1, 2, 3, 4]).slice(0, 4), badN = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.tubes = order.map((ci, k) => {
      const bands = [0, 1, 2].map(() => { const lo = rf(r, 0.25, 0.55); return [lo, lo + 0.22]; });
      const peaks = bands.map(b => rf(r, b[0] + 0.03, b[1] - 0.03)), odd = badN.has(k);
      if (odd) { const j = ri(r, 0, 2); peaks[j] = r() < 0.5 ? bands[j][0] - rf(r, 0.07, 0.14) : bands[j][1] + rf(r, 0.07, 0.14); }
      return { ci, bands, peaks, odd };
    });
    m.i = 0; m.phase = 'slot'; m.dt = 0; m.rounds = 4; m.round = 1;
    const tube = () => m.tubes[m.i], next = () => { m.i++; m.round = Math.min(4, m.i + 1); m.phase = 'slot'; m.dt = 0; if (m.i >= m.tubes.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), tb = tube();
      if (d >= 1 && d <= 5) { if (m.phase !== 'slot') return true; if (m.tray[d - 1] !== m.card[tb.ci].q) { m.fault('swapped'); return true; } m.slot = d; m.phase = 'run'; m.dt = 0; return true; }
      if (SPACE(code) || ENTER(code)) {
        if (m.phase === 'slot') return true;
        if (m.phase === 'run' && m.dt < draw) { m.fault('half-drawn'); return true; }
        if (SPACE(code) === tb.odd) { m.fault('wrong result'); return true; }
        m.ev(tb.odd ? 'flag' : 'save'); next(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'run') m.dt += dt; };
    m.hint = () => { const tb = tube(); if (!tb) return []; if (m.phase === 'slot') return [[`Digit${m.tray.indexOf(m.card[tb.ci].q) + 1}`, true]]; return m.dt >= draw + 0.15 ? [[tb.odd ? 'Enter' : 'Space', true]] : []; };
    m.bad = () => { const tb = tube(); if (!tb) return null; if (m.phase === 'slot') return `Digit${((m.tray.indexOf(m.card[tb.ci].q) + 1) % 5) + 1}`; return 'Space'; };
    m.view = () => ({ card: m.card, tray: m.tray, odd: m.tubes.map(t => t.odd) });
    m.buttons = () => [1, 2, 3, 4, 5].map(n => [`Digit${n}`, `Slot ${n}`]).concat([['Space', 'Save'], ['Enter', 'Re-run']]);
    m.draw = (c, W, H, P) => {
      const tb = tube(); if (!tb) return;
      txt(c, 'QUEUE CARD', 10, 16, { size: 10, col: COL.dim });
      m.card.forEach((e, k) => txt(c, `${e.bc}  → Q${e.q}`, 10, 32 + k * 14, { size: 11, col: k === tb.ci ? COL.gold : COL.ink }));
      box(c, 10, 108, 120, 28, COL.panel, COL.gold); txt(c, `TUBE ${tb && m.card[tb.ci].bc}`, 18, 127, { size: 13, col: COL.gold });
      txt(c, 'TRAY', 150, 16, { size: 10, col: COL.dim });
      m.tray.forEach((q, k) => { const on = m.phase !== 'slot' && m.slot === k + 1; box(c, 150 + k * 48, 22, 42, 22, on ? COL.peri : COL.panel, COL.dim); txt(c, `${k + 1}: Q${q}`, 154 + k * 48, 38, { size: 10 }); });
      if (m.phase === 'slot') { txt(c, 'Slot the tube to match its queue number', 150, 90, { size: 12, col: COL.pale }); return; }
      const f = Math.min(1, m.dt / draw), x0 = 160, base = 160, sc = 100;
      tb.bands.forEach((b, j) => {
        const x = x0 + j * 75; c.strokeStyle = P.good; c.lineWidth = 1.5; c.strokeRect(x - 12, base - b[1] * sc, 24, (b[1] - b[0]) * sc);
        const show = Math.min(1, Math.max(0, f * 3 - j)); if (show <= 0) return; const h = tb.peaks[j] * sc * show, out = show >= 1 && (tb.peaks[j] < b[0] || tb.peaks[j] > b[1]);
        c.fillStyle = out ? P.bad : COL.gold; c.fillRect(x - 3, base - h, 6, h); if (out) txt(c, '!', x + 14, base - h + 4, { size: 14, col: P.bad });
      });
      txt(c, f < 1 ? 'trace drawing…' : 'trace complete', 330, 60, { size: 11, col: f < 1 ? COL.dim : COL.ink, align: 'center' });
    };
    return m;
  },
});
