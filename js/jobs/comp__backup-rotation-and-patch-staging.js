// Computer specialist: backup rotation and patch staging. Each cartridge goes insert -> verify -> rotate into the rack, but every action runs for
// a while and you must not touch the next one until the drive says done. A cartridge that fails verify is ejected, never racked. Then stage the
// patch and purge the stale cache, in that order.
import { define, machine, DIG, ri, rf, txt, box, bar, COL } from './kit.js';

const ACT = ['Insert', 'Verify', 'Rotate to rack', 'Eject', 'Stage patch', 'Purge cache'];
export default define({
  job: { billet: 'comp', label: 'Backup rotation and patch staging', type: 'loop' },
  title: 'Cartridge rotation desk', dept: 'operations', host: 'console', tool: 'Data-core backup drive',
  how: 'Rotate three backup cartridges through the drive (insert, verify, rack), waiting for each operation to finish, then stage the patch and purge the cache.',
  keys: ['1 insert', '2 verify', '3 rack', '4 eject', '5 stage', '6 purge'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'wait-and-commit', input: 'digits', win: 'three cartridges verified and racked (bad ones ejected), then patch staged and cache purged in order',
    fail: 'acting while the drive is still busy, acting out of order, or racking a cartridge that failed verify',
    rule: 'One action at a time: start it, wait for DONE, then the next. Per cartridge 1 insert, 2 verify, then 3 rack if it verified OK or 4 eject if it failed. Last, 5 stage, then 6 purge.' },
  rush: 'Racked the cartridges without waiting for the verify to finish.',
  captions: { busy: 'drive busy chirp', 'out of order': 'operator error tone', 'racked a bad copy': 'checksum alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, badOne = ri(r, 0, 3);   // 3: none fails
    m.carts = [0, 1, 2].map(i => ({ label: `Vol ${String.fromCharCode(65 + ri(r, 0, 20))}-${ri(r, 10, 99)}`, bad: i === badOne, st: 0, verdict: null }));
    m.cur = 0; m.op = null; m.tail = 0; m.rounds = 4; m.round = 0;
    const want = () => { if (m.cur < 3) { const c = m.carts[m.cur]; return c.st === 0 ? 1 : c.st === 1 ? 2 : c.bad ? 4 : 3; } return m.tail === 0 ? 5 : 6; };
    const dur = (a) => a === 2 ? rf(r, 1.4, 2.4) : a === 5 ? 1.5 : 0.7;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d || d > 6) return false;
      if (m.op) { m.fault('busy'); return true; }
      const w = want(); if (d !== w) { m.fault(d === 3 && w === 4 ? 'racked a bad copy' : 'out of order'); return true; }
      m.op = { a: d, t: 0, len: dur(d) }; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || !m.op) return; m.op.t += dt; if (m.op.t < m.op.len) return; const a = m.op.a; m.op = null;
      if (m.cur < 3) { const c = m.carts[m.cur]; if (a === 1) c.st = 1; else if (a === 2) { c.st = 2; c.verdict = c.bad ? 'CHECKSUM FAIL' : 'OK'; } else { c.st = a === 3 ? 3 : 4; m.cur++; m.round++; } }
      else { m.tail++; if (m.tail >= 2) { m.round = 4; m.win(); } }
    };
    m.hint = () => m.op ? [] : [['Digit' + want(), true]];
    m.bad = () => m.op ? 'Digit1' : 'Digit' + (want() === 1 ? 3 : 1);
    m.view = () => ({ carts: m.carts.map(c => [c.label, c.bad]) });
    m.buttons = () => ACT.map((n, i) => ['Digit' + (i + 1), `${i + 1} ${n}`]);
    m.draw = (c, W, H, P) => {
      m.carts.forEach((q, i) => {
        const y = 12 + i * 34, on = i === m.cur; box(c, 10, y, 250, 28, on ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 12);
        txt(c, q.label, 22, y + 18, { size: 12, col: COL.gold }); txt(c, ['in tray', 'in drive', q.verdict || 'verified', 'racked ✓', 'ejected ⏏'][q.st], 110, y + 18, { size: 11, col: q.verdict === 'CHECKSUM FAIL' ? P.bad : q.st >= 3 ? P.good : COL.ink });
      });
      ['Stage patch', 'Purge cache'].forEach((n, k) => txt(c, `${n}${m.tail > k ? ' ✓' : ''}`, 280, 30 + k * 26, { size: 11, col: m.tail > k ? P.good : COL.dim }));
      txt(c, m.op ? `${ACT[m.op.a - 1].toUpperCase()}… ` : 'DRIVE READY', 14, H - 30, { size: 12, col: m.op ? COL.warn : P.good });
      bar(c, 14, H - 22, W - 28, 10, m.op ? m.op.t / m.op.len : 1, { col: m.op ? COL.peri : P.good });
    };
    return m;
  },
});
