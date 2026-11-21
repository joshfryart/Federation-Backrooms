// Cook: receive food crates. Sacks come down the dock belt one at a time. Each has a bin label (1-3) and some are WET. While one is in the
// shelving zone press its bin digit; press Space for a wet sack to bin it as spoilage. Let one slide past and it is missed.
import { define, machine, DIG, SPACE, ri, rf, txt, COL } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Receive and shelve incoming food crates', type: 'task:cargo_run' },
  title: 'Shelve or bin each sack on the belt', dept: 'services', host: 'console', tool: 'Dock belt and shelf bins',
  how: 'Each sack shows a bin number. Press that digit while it is at the shelves. A sack marked WET goes to the spoilage bin with Space instead.',
  keys: ['1-3 shelve in that bin', 'Space spoilage bin (wet sack)'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'shelve or bin', input: 'digits+space', win: 'six sacks sorted off the belt to their own bin or the spoilage bin',
    fail: 'shelving a wet sack, using the wrong bin, or letting a sack ride past unsorted',
    rule: 'Sacks pass the shelves for about two seconds each. Press the digit printed on it, or Space if it is marked WET. Anything missed counts against you.' },
  rush: 'Stacked the sacks wherever there was room and left the damp ones in.',
  captions: { wrong: 'wrong-bin thud', missed: 'sack rolls off the belt' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, life = m.calm ? 3 : 2.4; m.n = 6; m.round = 0; m.sacks = [];
    for (let i = 0; i < m.n; i++) m.sacks.push({ a: 1 + i * 2.7, bin: ri(r, 1, 3), wet: r() < 0.35, done: false });
    const cur = () => m.sacks.find(s => !s.done && m.t >= s.a && m.t < s.a + life);
    const res = () => { m.round++; if (m.round >= m.n) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const s = cur(), d = DIG(code); if (!s || (!d && !SPACE(code)) || d > 3) return false;
      s.done = true; if (SPACE(code) ? s.wet : (!s.wet && d === s.bin)) { res(); return true; } m.fault('wrong'); res(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const s of m.sacks) if (!s.done && m.t >= s.a + life) { s.done = true; m.fault('missed'); res(); } };
    m.hint = () => { const s = cur(); return s && m.t - s.a > 0.4 ? [[s.wet ? 'Space' : 'Digit' + s.bin, true]] : []; };
    m.bad = () => { const s = cur(); return s ? (s.wet ? 'Digit1' : 'Space') : null; };
    m.view = () => ({ s: m.sacks.map(s => [s.bin, s.wet]) });
    m.buttons = () => [['Digit1', 'Bin 1'], ['Digit2', 'Bin 2'], ['Digit3', 'Bin 3'], ['Space', 'Spoilage']];
    m.draw = (c, W, H, P) => { c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(0, 84, 400, 10); const s = cur();
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.strokeRect(150, 30, 100, 90);
      for (const k of m.sacks) if (!k.done && m.t >= k.a - 1.2 && m.t < k.a + life) { const x = 400 - ((m.t - (k.a - 1.2)) / (life + 1.2)) * 440; c.fillStyle = k.wet ? P.bad : COL.pale; c.fillRect(x, 54, 34, 30); txt(c, k.wet ? 'WET' : k.bin, x + 17, 74, { size: 12, align: 'center', col: '#111' }); }
      txt(c, s ? (s.wet ? 'WET: Space' : `bin ${s.bin}`) : 'waiting', 200, 140, { size: 14, align: 'center' }); txt(c, `${m.round} / ${m.n} sorted`, 16, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
