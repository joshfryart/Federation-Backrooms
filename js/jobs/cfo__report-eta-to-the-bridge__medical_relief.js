// CFO: report ETA to the bridge. Build the ETA on the card: chronometer time plus remaining travel plus the dock allowance plus the medical team's
// transfer allowance. Set the card's figure (← / → tens of minutes, ↑ / ↓ single minutes) and read it into the channel (Enter). Sickbay then reads
// back the receiving time: note it (Enter) only if it is your figure; if they misheard, repeat the ETA (↑) until they have it right.
import { define, machine, ENTER, ARROW, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Report ETA to the bridge', type: 'task:medical_relief' },
  title: 'ETA sum and sickbay read-back', dept: 'flight', host: 'console', tool: 'ETA card and comms panel',
  how: 'Add clock + travel + dock + transfer and set the ETA card (← / → tens, ↑ / ↓ minutes), Enter to read it out. When sickbay reads back, Enter only if it matches; ↑ repeats the ETA if they misheard.',
  keys: ['← / → ±10 min', '↑ / ↓ ±1 min', 'Enter read out / note'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'sum the eta', input: 'arrows+enter', win: 'the ETA card holds clock time plus travel, dock and transfer allowances and sickbay has read the same receiving time back',
    fail: 'reading out a wrong total, or noting a misheard sickbay read-back as confirmed',
    rule: 'ETA = chronometer + travel left + dock + transfer. Dial it in and Enter. Compare sickbay\'s read-back digit by digit: Enter if equal, ↑ to say it again if not.' },
  rush: 'Read the helm travel time out as the ETA and left sickbay to work out the rest.',
  captions: { 'wrong eta': 'bridge corrects the figure', misheard: 'sickbay preps for the wrong time', 'needless repeat': 'sickbay: we have it' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.clk = ri(r, 0, 23) * 60 + ri(r, 0, 59); m.trav = ri(r, 18, 95); m.dock = ri(r, 4, 12); m.xfer = ri(r, 6, 20); m.eta = m.clk + m.trav + m.dock + m.xfer;
    m.card = m.clk + m.trav; m.phase = 'card'; m.wait = 0; m.heard = null; m.mis = ri(r, 0, 2);
    const hm = (x) => { x = ((Math.round(x) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
    const fluff = () => { const s = hm(m.eta), k = ri(r, 0, 2); return k === 0 ? hm(m.eta + 10) : k === 1 ? hm(m.eta - 1) : `${s[0]}${s[1]}:${s[4]}${s[3]}` === s ? hm(m.eta + 1) : `${s[0]}${s[1]}:${s[4]}${s[3]}`; };
    m.hm = hm;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (m.phase === 'card') {
        if (a) { m.card += a === 'R' ? 10 : a === 'L' ? -10 : a === 'U' ? 1 : -1; return true; }
        if (ENTER(code)) { if (m.card !== m.eta) { m.fault('wrong eta'); return true; } m.phase = 'readback'; m.wait = 1; return true; }
        return false;
      }
      if (m.wait > 0) return !!a || ENTER(code);
      const right = m.heard === hm(m.eta);
      if (a === 'U') { if (right) m.fault('needless repeat'); m.wait = 1; return true; } if (a) return true;
      if (ENTER(code)) { if (!right) { m.fault('misheard'); m.wait = 1; return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'readback' && m.wait > 0) { m.wait -= dt; if (m.wait <= 0) { m.heard = m.mis > 0 ? fluff() : hm(m.eta); m.mis--; } } };
    m.hint = () => {
      if (m.phase === 'card') { const d = m.eta - m.card; return [[d >= 10 ? 'ArrowRight' : d <= -10 ? 'ArrowLeft' : d > 0 ? 'ArrowUp' : d < 0 ? 'ArrowDown' : 'Enter', true]]; }
      if (m.wait > 0) return []; return [[m.heard === hm(m.eta) ? 'Enter' : 'ArrowUp', true]];
    };
    m.bad = () => m.phase === 'card' ? 'Enter' : (m.wait > 0 ? null : 'Enter');
    m.view = () => ({ c: m.clk, t: m.trav, d: m.dock, x: m.xfer, mis: m.mis });
    m.buttons = () => [['ArrowLeft', '−10'], ['ArrowRight', '+10'], ['ArrowDown', '−1'], ['ArrowUp', '+1 / repeat'], ['Enter', 'Read out / note']];
    m.draw = (c, W, H, P) => {
      [['Chronometer', hm(m.clk)], ['Travel left', `${m.trav} min`], ['Dock allowance', `${m.dock} min`], ['Medical transfer', `${m.xfer} min`]].forEach(([k, v], i) => { txt(c, k, 18, 22 + i * 20, { size: 11, col: COL.dim }); txt(c, v, 130, 22 + i * 20, { size: 13 }); });
      box(c, 230, 10, 156, 70, COL.panel, m.phase === 'card' ? COL.gold : null, 6); txt(c, 'ETA CARD', 240, 26, { size: 10, col: COL.dim }); txt(c, hm(m.card), 240, 62, { size: 28, col: m.phase === 'card' ? COL.ink : COL.pale });
      if (m.phase === 'readback') { txt(c, 'SICKBAY READ-BACK', 18, 112, { size: 10, col: COL.dim }); txt(c, m.wait > 0 ? 'listening…' : `"Receiving at ${m.heard}"`, 18, 138, { size: 16, col: COL.pale }); txt(c, 'Enter: note it · ↑ repeat ETA', 230, 138, { size: 11, col: COL.dim }); }
      else txt(c, 'clock + travel + dock + transfer', 18, 120, { size: 11, col: COL.dim });
    };
    return m;
  },
});
