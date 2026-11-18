// Armory officer: serial-number audit. Slide the torch along each phaser grip to read its serial one character at a time and compare it with
// the ledger line. Flag the first character that differs (look-alikes: 8/B, 0/O, 1/I, 5/S, 2/Z); tick only an exact match, and only after you
// have read the whole serial.
import { define, machine, ARROW, SPACE, ENTER, ri, pick, txt, box, COL } from './kit.js';

const CH = 'ABCDEFGHKLMNPRTVWXY3467', LOOK = { '8': 'B', B: '8', '0': 'O', O: '0', '1': 'I', I: '1', '5': 'S', S: '5', '2': 'Z', Z: '2' };
export default define({
  job: { billet: 'armory', label: 'Serial-number audit', type: 'loop' },
  title: 'Serial audit by torchlight', dept: 'security', host: 'console', tool: 'Ledger and hand torch',
  how: 'Slide the torch along the grip (→) to read the serial one character at a time against the ledger. Space flags the first character that differs; Enter ticks an exact match.',
  keys: ['→ / ← slide the torch', 'Space flag here', 'Enter exact match'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'compare digitwise', input: 'arrows+space+enter', win: 'every weapon serial read in full and either ticked as an exact match or flagged at its first wrong character',
    fail: 'flagging a character that matches, ticking a serial with a wrong character, or ticking before reading it all',
    rule: 'Only the character under the torch is lit. Step along with → ; at the first character that differs from the ledger press Space. If all six match, Enter ticks it. Watch the look-alikes 8/B, 0/O, 1/I, 5/S, 2/Z.' },
  rush: 'Counted the phasers on the rack and ticked the ledger page.',
  captions: { 'flagged a match': 'pen scratch', 'ticked a bad serial': 'ledger mismatch beep', 'not read': 'quartermaster coughs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.guns = Array.from({ length: 4 }, () => {
      const look = Object.keys(LOOK), led = Array.from({ length: 6 }, () => r() < 0.35 ? pick(r, look) : pick(r, CH.split(''))).join(''), bad = r() < 0.5, at = bad ? ri(r, 1, 5) : -1;
      const grip = led.split(''); if (bad) grip[at] = LOOK[grip[at]] || pick(r, CH.split('').filter(c => c !== grip[at])); return { led, grip: grip.join(''), at, res: 0 };
    });
    m.g = 0; m.p = 0; m.seen = 0; m.rounds = 4; m.round = 0;
    const G = () => m.guns[m.g], next = () => { m.g++; m.round++; m.p = 0; m.seen = 0; if (m.g >= 4) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), g = G();
      if (a === 'R' || a === 'L') { m.p = Math.max(0, Math.min(5, m.p + (a === 'R' ? 1 : -1))); m.seen = Math.max(m.seen, m.p); return true; }
      if (SPACE(code)) { if (m.p !== g.at) { m.fault('flagged a match'); return true; } g.res = 2; next(); return true; }
      if (ENTER(code)) { if (m.seen < 5) { m.fault('not read'); return true; } if (g.at >= 0) { m.fault('ticked a bad serial'); return true; } g.res = 1; next(); return true; }
      return false;
    };
    m.hint = () => { const g = G(); if (!g) return []; if (g.at >= 0) return [[m.p < g.at ? 'ArrowRight' : m.p > g.at ? 'ArrowLeft' : 'Space', true]]; return [[m.seen < 5 ? 'ArrowRight' : 'Enter', true]]; };
    m.bad = () => { const g = G(); return g.at >= 0 ? 'Enter' : 'Space'; };
    m.view = () => ({ guns: m.guns.map(g => [g.led, g.grip]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Flag'], ['Enter', 'Match']];
    m.draw = (c, W, H, P) => {
      const g = G() || m.guns[3]; txt(c, `PHASER ${Math.min(m.g + 1, 4)} / 4`, 14, 22, { size: 12, col: COL.peri });
      txt(c, 'LEDGER', 14, 52, { size: 10, col: COL.dim }); txt(c, 'GRIP', 14, 104, { size: 10, col: COL.dim });
      for (let k = 0; k < 6; k++) {
        const x = 80 + k * 46; box(c, x, 32, 38, 30, 'rgba(255,255,255,.06)', null, 6); txt(c, g.led[k], x + 19, 55, { size: 20, align: 'center', font: 'monospace' });
        const lit = k === m.p; box(c, x, 84, 38, 30, lit ? 'rgba(244,194,91,.35)' : '#0d0c18', lit ? COL.gold : null, 6); if (lit || k <= m.seen && k === m.p) txt(c, g.grip[k], x + 19, 107, { size: 20, align: 'center', font: 'monospace', col: COL.gold });
      }
      m.guns.forEach((q, i) => txt(c, q.res === 1 ? '✓' : q.res === 2 ? '⚑' : '·', 80 + i * 22, H - 16, { size: 14, col: q.res === 1 ? P.good : q.res === 2 ? COL.warn : COL.dim }));
    };
    return m;
  },
});
