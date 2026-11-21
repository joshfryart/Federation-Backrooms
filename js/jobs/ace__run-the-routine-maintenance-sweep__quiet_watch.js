// Assistant Chief Engineer: routine maintenance sweep. Each panel's sensor window is dusty, and dust fakes a drift. Hold Left or Right to
// stroke the cloth until the window is clear, then compare the readout with the sweep card: Space logs a real drift (a few units off),
// Enter passes the panel. Logging a drift through dust, or passing a real one, is a fault.
import { define, machine, ARROW, SPACE, ENTER, ri, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Run the routine maintenance sweep', type: 'task:quiet_watch' },
  title: 'Clear the glass, then diff the readout', dept: 'engineering', host: 'console', tool: 'Lint cloth and sweep card',
  how: 'Hold Left or Right to wipe the window clear. Once clear, Space logs a drift against the card; Enter passes the panel.',
  keys: ['Left / Right hold to wipe', 'Space log a drift', 'Enter pass the panel'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'clear the glass', input: 'arrows-hold+space+enter',
    win: 'four panels settled, each wiped clear first, real drifts logged and in-card panels passed',
    fail: 'logging a drift read through dust, logging a panel that matches the card, or passing a panel that really drifts',
    rule: 'Dust adds a false offset to the readout. Hold an arrow to wipe it off, then compare the clean readout with the card: off by 2+ is a drift.' },
  rush: 'Read the dusty windows as they were and noted whatever looked off.',
  captions: { dusty: 'dust smear noted as drift', 'false drift': 'sweep card mismatch', 'passed drift': 'drift missed' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 4; m.round = 0; m.held = {};
    const mk = () => { const card = ri(r, 30, 95), real = r() < 0.5; return { card, true: card + (real ? ri(r, 3, 6) * (r() < 0.5 ? 1 : -1) : ri(r, -1, 1)), dust: 1, off: ri(r, 3, 7) * (r() < 0.5 ? 1 : -1), real }; };
    m.p = mk(); m.show = () => Math.round(m.p.true + m.p.off * m.p.dust);
    const nxt = () => { m.round++; if (m.round >= m.rounds) m.win(); else m.p = mk(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (!down) return false;
      if (SPACE(code)) { if (m.p.dust > 0.05) m.fault('dusty'); else if (!m.p.real) m.fault('false drift'); else nxt(); return true; }
      if (ENTER(code)) { if (m.p.dust > 0.05) m.fault('dusty'); else if (m.p.real) m.fault('passed drift'); else nxt(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.L || m.held.R) m.p.dust = Math.max(0, m.p.dust - dt / (m.calm ? 0.8 : 1.1)); };
    m.hint = () => m.p.dust > 0.05 ? [['ArrowLeft', true]] : [['ArrowLeft', false], [m.p.real ? 'Space' : 'Enter', true]];
    m.bad = () => (m.p.real ? 'Enter' : 'Space');
    m.view = () => ({ p: [m.p.card, m.p.true, m.p.off] });
    m.buttons = () => [['ArrowLeft', '◀ wipe'], ['ArrowRight', 'wipe ▶'], ['Space', 'Log drift'], ['Enter', 'Pass']];
    m.draw = (c) => { box(c, 20, 20, 170, 100, COL.panel, COL.peri); txt(c, 'PANEL READOUT', 30, 38, { size: 10, col: COL.dim }); txt(c, m.show(), 30, 86, { size: 40, col: m.p.dust > 0.05 ? COL.dim : COL.ink });
      c.fillStyle = `rgba(150,140,120,${0.6 * m.p.dust})`; c.fillRect(22, 22, 166, 96); txt(c, `card ${m.p.card}`, 215, 60, { size: 20, col: COL.pale });
      txt(c, m.p.dust > 0.05 ? 'window dusty' : 'window clear', 215, 90, { size: 12, col: m.p.dust > 0.05 ? COL.warn : COL.pale }); bar(c, 215, 100, 160, 8, 1 - m.p.dust, { col: COL.peri });
      txt(c, `panel ${m.round + 1}/${m.rounds}`, 20, 150, { size: 11, col: COL.dim }); };
    return m;
  },
});
