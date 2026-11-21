// Replicator tech: industrial replicator job queue. For each ticket step the cartridge rack to the ticket's pattern code and load it (Enter), let
// the print finish, then read the caliper: accept (Enter) a part inside tolerance or reject (Up) one outside it.
import { define, machine, ENTER, ARROW, ri, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Industrial replicator job queue', type: 'loop' },
  title: 'Ticket, cartridge, caliper', dept: 'services', host: 'console', tool: 'Cartridge rack and calipers',
  how: 'Press Left or Right to move along the cartridge rack to the code on the ticket, press Enter to load it. When the print is out, Enter accepts a part inside the band and Up rejects one outside it.',
  keys: ['Left/Right rack', 'Enter load / accept', 'Up reject'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'load and gauge', input: 'arrows+enter', win: 'three tickets each loaded with the cartridge of the ticket code, then the part accepted in tolerance or rejected out of it',
    fail: 'loading the wrong cartridge, accepting an out-of-tolerance part or rejecting a good one',
    rule: 'Step the rack to the ticket code and press Enter. After the print finishes, the caliper reading against the tolerance band decides Enter (accept) or Up (reject).' },
  rush: 'Printed whichever cartridge was already seated and handed it over unmeasured.',
  captions: { 'wrong cartridge': 'cartridge slot grinds', 'bad part passed': 'caliper snap', 'good part rejected': 'reject bin clunk' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ptime = m.calm ? 2.4 : 1.6; m.k = 0; m.st = 0; m.cur_ = 0; m.clk = 0; m.rounds = 3; m.round = 0;
    const code = () => 'ABCDEFGHJK'[ri(r, 0, 9)] + '-' + ri(r, 11, 98);
    m.tix = Array.from({ length: 3 }, (_, i) => { const want = code(), rack = shuffle(r, [want, code(), code(), want[0] + '-' + (ri(r, 11, 98))]); return { want, rack, slot: rack.indexOf(want), dim: i === 1 ? 10.9 : 10 + ri(r, -3, 3) / 20, ok: i !== 1 }; });
    const T = () => m.tix[Math.min(m.k, 2)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!ENTER(code) && a !== 'L' && a !== 'R' && a !== 'U') return false; if (!down) return true; const t = T();
      if (m.st === 0) { if (a === 'L') m.cur_ = Math.max(0, m.cur_ - 1); else if (a === 'R') m.cur_ = Math.min(3, m.cur_ + 1); else if (ENTER(code)) { if (m.cur_ === t.slot) { m.st = 1; m.clk = 0; } else m.fault('wrong cartridge'); } }
      else if (m.st === 2 && (ENTER(code) || a === 'U')) { if (ENTER(code) && !t.ok) m.fault('bad part passed'); else if (a === 'U' && t.ok) m.fault('good part rejected'); else { m.k++; m.round = m.k; m.st = 0; m.cur_ = 0; if (m.k >= 3) m.win(); } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.st === 1) { m.clk += dt; if (m.clk >= ptime) m.st = 2; } };
    m.hint = () => { const t = T(); if (m.st === 0) return [[m.cur_ === t.slot ? 'Enter' : m.cur_ < t.slot ? 'ArrowRight' : 'ArrowLeft', true]]; if (m.st === 2) return [[t.ok ? 'Enter' : 'ArrowUp', true]]; return []; };
    m.bad = () => m.st === 0 ? (m.cur_ === T().slot ? 'ArrowRight' : 'Enter') : m.st === 2 ? 'Enter' : null;
    m.view = () => ({ tix: m.tix.map(t => [t.want, t.rack, t.dim]) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['Enter', 'Load / Accept'], ['ArrowUp', 'Reject']];
    m.draw = (c, W, H, P) => {
      const t = T(); txt(c, `Ticket ${Math.min(m.k + 1, 3)}: pattern ${t.want}`, 14, 22, { size: 14, col: COL.gold });
      t.rack.forEach((x, i) => { box(c, 14 + i * 94, 36, 84, 30, i === m.cur_ ? 'rgba(240,147,58,.25)' : 'rgba(255,255,255,.05)', i === m.cur_ ? COL.orange : null, 6); txt(c, x, 30 + i * 94 + 28, 56, { size: 14 }); });
      if (m.st === 1) bar(c, 14, 90, W - 28, 12, m.clk / ptime, { col: COL.peri }); txt(c, m.st === 1 ? 'printing...' : m.st === 2 ? `caliper ${t.dim.toFixed(2)} mm  (band 9.90 to 10.10)` : 'load the matching cartridge', 14, 128, { size: 12, col: m.st === 2 ? (t.ok ? P.good : P.bad) : COL.dim });
    };
    return m;
  },
});
