// Quartermaster: issue probes. Probes ride the belt past the tray gate, each with a calibration expiry day. Tap Space as a probe with a
// current calibration crosses the gate; let expired ones go by. Missing a valid probe is a fault too.
import { define, machine, SPACE, ri, rf, shuffle, txt, box, COL } from './kit.js';
const TODAY = 100, TRAVEL = 3.2;

export default define({
  job: { billet: 'qm', label: 'Issue probes and sample containers to science', type: 'task:survey' },
  title: 'Gate the calibrated probes', dept: 'services', host: 'console', tool: 'Probe belt and tray gate',
  how: 'Probes slide right along the belt. Tap Space while a probe is inside the gate box, but only if its calibration expiry is after today (day 100). Let expired probes pass.',
  keys: ['Space load into tray'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'gate the probes', input: 'space', win: 'every probe with a current calibration tapped into the tray as it crosses the gate and every expired one let through',
    fail: 'loading an expired probe, tapping with nothing in the gate, or letting a calibrated probe slide past',
    rule: 'Each probe carries a cal-expiry day. Past today (100) means in date: tap Space inside the gate box. On or before day 100: let it go by untouched.' },
  rush: 'Tipped the whole probe case into the tray and let science find the expired ones.',
  captions: { 'loaded expired': 'cal-expired probe alarm', 'empty grab': 'tray clicks empty', 'missed valid': 'probe slides off belt' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gate = [0.44, 0.56], hw = m.calm ? 0.08 : 0.06;
    const flags = shuffle(r, [true, true, true, false, false, r() < 0.5]);
    m.pr = flags.map((ok, i) => ({ ok, exp: ok ? TODAY + ri(r, 5, 90) : TODAY - ri(r, 0, 60), t0: 0.8 + i * 1.8 + rf(r, 0, 0.3), done: false }));
    const x = (p) => (m.t - p.t0) / TRAVEL, inGate = (p) => !p.done && Math.abs(x(p) - 0.5) <= hw;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const p = m.pr.find(inGate);
      if (!p) m.fault('empty grab'); else { p.done = true; if (!p.ok) m.fault('loaded expired'); } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const p of m.pr) if (!p.done && x(p) > 0.5 + hw) { p.done = true; if (p.ok) m.fault('missed valid'); }
      if (m.state === 'play' && m.pr.every(p => p.done)) m.win(); };
    m.hint = () => { const p = m.pr.find(q => inGate(q) && q.ok && Math.abs(x(q) - 0.5) <= 0.02); return p ? [['Space', true]] : []; };
    m.bad = () => ['Space', true];
    m.view = () => ({ pr: m.pr.map(p => [p.ok, p.exp]) });
    m.buttons = () => [['Space', 'Load']];
    m.draw = (c, W, H, P) => {
      c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(10, 70, 380, 20); c.strokeStyle = COL.gold; c.lineWidth = 2; c.strokeRect(10 + 380 * (0.5 - hw), 56, 380 * hw * 2, 48);
      txt(c, 'GATE', 10 + 380 * 0.5, 50, { size: 10, align: 'center', col: COL.gold }); txt(c, `today day ${TODAY}`, 10, 16, { size: 12, col: COL.pale });
      for (const p of m.pr) { const px = x(p); if (p.done || px < 0 || px > 1) continue; box(c, 10 + px * 380 - 22, 62, 44, 36, COL.panel, p.done ? COL.dim : COL.peri, 4); txt(c, 'cal ' + p.exp, 10 + px * 380, 84, { size: 10, align: 'center' }); }
      txt(c, `loaded ${m.pr.filter(p => p.done && p.ok).length}`, 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
