// Chief of security, quiet watch: test the brig force field. Four zones of the field. Press a zone's digit to power-cycle it: its lamp goes dark. A live
// zone relights within a second; a dead one stays dark. Once a zone has settled, give the verdict: Enter if it relit, Space if it stayed dark.
import { define, machine, DIG, box, lamp, txt, COL } from './kit.js';

const Z = 4;
export default define({
  job: { billet: 'cos', label: 'Test brig force field and sensors', type: 'task:quiet_watch' },
  title: 'Field zone cycle verdict', dept: 'security', host: 'console', tool: 'Brig field board',
  how: 'Press a zone digit to power-cycle it. Once its lamp settles, press Enter if it relit, or Space if it stayed dark. Do all four zones.',
  keys: ['1 – 4 cycle a zone', 'Enter: relit (live)', 'Space: stayed dark (dead)'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'cycle and verdict', input: 'digits+space+enter', win: 'every brig field zone cycled once and given the right live or dead verdict',
    fail: 'calling a dark zone live, a relit zone dead, or giving a verdict before the lamp has settled',
    rule: 'Digit 1 to 4 cycles a zone and its lamp goes dark for a second. Wait for it to settle: lit means live, so press Enter; still dark means dead, so press Space. Wrong or early verdicts are faults.' },
  rush: 'Glanced at the four lamps and wrote all four down as fine.',
  captions: { 'wrong verdict': 'buzzer', 'early verdict': 'buzzer' }, says: {},
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dead = Math.floor(r() * Z);
    m.z = Array.from({ length: Z }, (_, k) => ({ dead: k === dead, state: 'idle', t: 0 })); m.focus = -1;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      const d = DIG(code);
      if (d) { const z = m.z[d - 1]; if (z && z.state === 'idle') { z.state = 'dark'; z.t = 0; m.focus = d - 1; } return true; }
      const isEnter = code === 'Enter' || code === 'NumpadEnter', isSpace = code === 'Space';
      if (!isEnter && !isSpace) return false;
      const f = m.z[m.focus]; if (!f || f.state === 'signed') return true;
      if (f.state === 'dark') { m.fault('early verdict'); return true; }
      if ((isSpace && f.dead) || (isEnter && !f.dead)) { f.state = 'signed'; m.ev('verdict', { zone: m.focus }); if (m.z.every(z => z.state === 'signed')) m.win(); }
      else m.fault('wrong verdict');
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const z of m.z) if (z.state === 'dark') { z.t += dt; if (z.t >= 1) z.state = z.dead ? 'dead' : 'lit'; } };
    m.hint = () => {
      const k = m.z.findIndex(z => z.state !== 'signed'); if (k < 0) return [];
      const z = m.z[k];
      if (z.state === 'idle') return [[`Digit${k + 1}`, true]];
      if (z.state === 'dark') return [];
      return [[z.dead ? 'Space' : 'Enter', true]];
    };
    m.bad = () => {
      const f = m.z[m.focus]; if (f && f.state === 'lit') return 'Space';
      if (f && f.state === 'dead') return 'Enter';
      const k = m.z.findIndex(z => z.state === 'idle'); return k >= 0 ? `Digit${k + 1}` : 'Enter';
    };
    m.tag = Math.floor(r() * 1000);
    m.view = () => ({ dead: m.z.findIndex(z => z.dead), tag: m.tag });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'relit'], ['Space', 'dark']];
    m.draw = (c, W, H, P) => {
      m.z.forEach((z, k) => {
        const x = 40 + k * 88, y = 40;
        const col = z.state === 'signed' ? COL.dim : z.state === 'lit' ? P.good : z.state === 'dead' ? P.bad : COL.gold;
        box(c, x, y, 70, 70, 'rgba(255,255,255,.05)', k === m.focus ? COL.gold : null, 8);
        lamp(c, x + 35, y + 30, 14, col, z.dead && z.state !== 'idle' ? 'square' : 'circle');
        txt(c, `Zone ${k + 1}`, x + 35, y + 60, { size: 10, align: 'center', col: COL.dim });
      });
      txt(c, m.focus >= 0 ? `Zone ${m.focus + 1}: ${m.z[m.focus].state}` : 'Press a zone digit to cycle it', 200, 150, { size: 12, align: 'center' });
    };
    return m;
  },
});
