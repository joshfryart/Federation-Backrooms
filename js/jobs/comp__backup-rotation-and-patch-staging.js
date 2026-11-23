// Computer specialist: backup rotation and patch staging. Two drives work in parallel and each cartridge takes a while to verify. Press 1 or 2 to load
// the next cartridge into that drive; do not touch a drive while it is busy. When it finishes, a cartridge that verified OK is racked with the same
// number, and one that failed is ejected with Space. After all four are done, 3 stages the patch, and only when that finishes 4 purges the stale cache.
import { define, machine, DIG, SPACE, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'comp', label: 'Backup rotation and patch staging', type: 'loop' },
  title: 'Keep both drives verifying', dept: 'operations', host: 'console', tool: 'Twin backup drives',
  how: 'Press 1 or 2 to load a cartridge into an idle drive; when it is done press the same number to rack a good one or Space to eject a failed one. Then 3 stages the patch and 4 purges.',
  keys: ['1 / 2: load or rack the drive', 'Space: eject a failed cartridge', '3 stage patch, then 4 purge cache'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'run two drives', input: 'digits+space',
    win: 'four cartridges verified across two drives in parallel and racked or ejected as their results showed, then the patch staged and the cache purged',
    fail: 'touching a busy drive, racking a failed cartridge, ejecting a good one, or purging before the patch is staged',
    rule: 'Each drive verifies a cartridge for about two seconds. Idle drive + its number loads; done and OK + its number racks; done and failed + Space ejects. Last: 3 stage, wait, then 4 purge.' },
  rush: 'Racked the cartridges without waiting for the verify to finish.',
  captions: { busy: 'drive still busy', 'bad rack': 'failed cartridge racked', 'bad eject': 'good cartridge ejected', order: 'cache purged before the patch staged', empty: 'no cartridge left to load' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, run = m.calm ? 2.8 : 2.2, ST = m.calm ? 2 : 1.5; m.q = [0, 1, 2, 3].map(() => r() < 0.35); if (m.q.every(x => !x)) m.q[1] = true; if (m.q.every(x => x)) m.q[2] = false;
    m.q = m.q.map(bad => bad); m.drv = [{ s: 'idle', t: 0, bad: false }, { s: 'idle', t: 0, bad: false }]; m.next = 0; m.cleared = 0; m.stage = 'carts'; m.st = 0; m.racked = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), sp = SPACE(code); if (!down) return d >= 1 && d <= 4 || sp; if (!(d >= 1 && d <= 4) && !sp) return false;
      if (sp) { const x = m.drv.findIndex(v => v.s === 'done' && v.bad); if (x >= 0) { m.drv[x].s = 'idle'; m.cleared++; } else m.fault('bad eject'); return true; }
      if (d >= 3) { if (m.stage === 'carts' || m.stage === 'run') { m.fault('order'); return true; } if (d === 3 && m.stage === 'ready3') { m.stage = 'run'; m.st = ST; m.which = 3; } else if (d === 4 && m.stage === 'ready4') { m.stage = 'run'; m.st = ST; m.which = 4; } else m.fault('order'); return true; }
      const v = m.drv[d - 1]; if (v.s === 'run') { m.fault('busy'); return true; }
      if (v.s === 'idle') { if (m.next >= m.q.length) { m.fault('empty'); return true; } v.s = 'run'; v.t = run; v.bad = m.q[m.next++]; return true; }
      if (v.bad) { m.fault('bad rack'); return true; } v.s = 'idle'; m.cleared++; m.racked++; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; for (const v of m.drv) if (v.s === 'run') { v.t -= dt; if (v.t <= 0) v.s = 'done'; }
      if (m.stage === 'carts' && m.cleared >= 4) m.stage = 'ready3';
      if (m.stage === 'run') { m.st -= dt; if (m.st <= 0) { if (m.which === 4) m.win(); else m.stage = 'ready4'; } }
    };
    m.hint = () => {
      if (m.state !== 'play') return []; if (m.stage === 'ready3') return [['Digit3', true]]; if (m.stage === 'ready4') return [['Digit4', true]]; if (m.stage !== 'carts') return [];
      const e = m.drv.findIndex(v => v.s === 'done' && v.bad); if (e >= 0) return [['Space', true]]; const k = m.drv.findIndex(v => v.s === 'done'); if (k >= 0) return [['Digit' + (k + 1), true]];
      const i = m.drv.findIndex(v => v.s === 'idle'); if (i >= 0 && m.next < m.q.length) return [['Digit' + (i + 1), true]]; return [];
    };
    m.bad = () => 'Digit4';
    m.view = () => ({ q: m.q.map(b => (b ? 1 : 0)) });
    m.buttons = () => [['Digit1', 'Drive 1'], ['Digit2', 'Drive 2'], ['Space', 'Eject'], ['Digit3', '3 Stage'], ['Digit4', '4 Purge']];
    m.draw = (c, W, H, P) => {
      m.drv.forEach((v, i) => { const x = 14 + i * 190; box(c, x, 12, 176, 72, COL.panel, v.s === 'done' ? (v.bad ? P.bad : P.good) : COL.dim, 6); txt(c, `${i + 1}  DRIVE`, x + 8, 28, { size: 11, col: COL.gold });
        txt(c, v.s === 'idle' ? 'empty' : v.s === 'run' ? 'verifying…' : v.bad ? 'FAILED: eject' : 'OK: rack', x + 8, 52, { size: 13, col: v.s === 'done' ? (v.bad ? P.bad : P.good) : COL.ink }); if (v.s === 'run') bar(c, x + 8, 62, 160, 8, 1 - v.t / run, {}); });
      txt(c, `cartridges left ${m.q.length - m.next}   done ${m.cleared}/4   racked ${m.racked}`, 14, 108, { size: 11, col: COL.dim });
      txt(c, m.stage === 'carts' ? '3 stage patch / 4 purge cache: after the cartridges' : m.stage === 'ready3' ? 'press 3: stage the patch' : m.stage === 'ready4' ? 'patch staged: press 4 to purge' : 'running…', 14, 146, { size: 12, col: m.stage === 'carts' ? COL.dim : COL.gold });
    };
    return m;
  },
});
