// Comms officer, cargo run: send the delivery manifest confirmation. The cargo clipboard scrolls past the reading line one entry at a time.
// Tick (Space) every CRATE line, so the crate total is counted fresh rather than copied from the last manifest, and tick every SEAL line
// whose number matches a seal on the form. A seal one figure off must be left unticked. Notes get nothing. The form sends on the last line.
import { define, machine, SPACE, ri, pick, shuffle, txt, box, COL } from './kit.js';

const GOODS = ['medical stores', 'hull plate', 'ration packs', 'coolant drums', 'survey buoys', 'spare isolinear'];
const NOTES = ['NOTE handle upright', 'NOTE keep below 4 °C', 'NOTE two-person lift', 'NOTE fragile'];

export default define({
  job: { billet: 'comms', label: 'Send the delivery manifest confirmation', type: 'task:cargo_run' },
  title: 'Manifest crate tally and seal tick', dept: 'operations', host: 'console', tool: 'Cargo clipboard and confirmation form',
  how: 'As each clipboard line reaches the reading line press Space for every crate line and for every seal that matches the form exactly; leave notes and mismatched seals alone.',
  keys: ['Space tick the line'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tick and tally', input: 'space', win: 'the crate total counted line by line and only exactly matching seals ticked before the confirmation goes',
    fail: 'skipping a crate or a matching seal as it passes, or ticking a note or a seal one figure off',
    rule: 'Lines roll past the reading line. Space on CRATE lines always, on SEAL lines only if the number is in the form\'s seal list figure for figure, never on NOTE lines.' },
  rush: 'Copied the crate count from the last manifest and pressed send.',
  captions: { miscount: 'pencil scratch', 'missed line': 'line slides past' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dwell = m.calm ? 1.2 : 0.95;
    const seals = Array.from({ length: 4 }, () => String(ri(r, 1000, 9999))), lines = [];
    for (let i = 0; i < ri(r, 5, 6); i++) lines.push({ s: `CRATE ${ri(r, 10, 99)}-${ri(r, 100, 999)} ${pick(r, GOODS)}`, tick: true });
    seals.forEach((s, i) => { let shown = s; if (i % 2 === 1 || r() < 0.25) { const p = ri(r, 0, 3); shown = s.slice(0, p) + ((+s[p] + ri(r, 1, 8)) % 10) + s.slice(p + 1); } lines.push({ s: `SEAL ${shown}`, tick: shown === s }); });
    for (let i = 0; i < 2; i++) lines.push({ s: pick(r, NOTES), tick: false });
    m.lines = shuffle(r, lines); m.seals = seals; m.last = ri(r, 3, 9); m.tally = 0; m.done = 0; m.rounds = m.lines.length; m.round = 0;
    m.lines.forEach(l => { l.got = false; });
    const at = () => Math.floor(m.t / dwell) - 1;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const k = at(), l = m.lines[k]; if (!l || l.got) return true;
      l.got = true; if (!l.tick) { m.fault('miscount'); return true; } if (l.s.startsWith('CRATE')) m.tally++; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const k = at(); m.round = Math.max(0, Math.min(k + 1, m.lines.length));
      while (m.done < Math.min(k, m.lines.length)) { const l = m.lines[m.done]; if (l.tick && !l.got) m.fault('missed line'); m.done++; }
      if (k >= m.lines.length && m.state === 'play') m.win();
    };
    m.hint = () => { const k = at(), l = m.lines[k]; return l && l.tick && !l.got && m.t - (k + 1) * dwell > 0.25 ? [['Space', true]] : []; };
    m.bad = () => { const l = m.lines[at()]; return l && !l.tick ? 'Space' : null; };
    m.view = () => ({ l: m.lines.map(l => l.s), s: m.seals });
    m.buttons = () => [['Space', 'Tick']];
    m.draw = (c, W, H, P) => {
      const k = at(), off = (m.t / dwell) % 1; c.save(); c.beginPath(); c.rect(6, 6, 250, 158); c.clip();
      for (let j = -2; j <= 3; j++) { const l = m.lines[k + j]; if (!l) continue; const y = 84 + (j - off + 0.5) * 24;
        txt(c, l.s, 14, y, { size: 11, col: j === 0 ? COL.ink : COL.dim }); if (l.got) txt(c, '✓', 240, y, { size: 12, col: l.tick ? P.good : P.bad, align: 'right' }); }
      c.restore(); box(c, 8, 70, 246, 22, null, COL.orange, 4); txt(c, 'reading line', 254, 66, { size: 8, col: COL.orange, align: 'right' });
      box(c, 266, 8, 126, 154, 'rgba(255,255,255,.05)', COL.peri, 6); txt(c, 'CONFIRMATION FORM', 272, 24, { size: 9, col: COL.gold });
      txt(c, `crates: ${m.tally}`, 272, 44, { size: 12 }); txt(c, `(last manifest ${m.last})`, 272, 58, { size: 9, col: COL.dim });
      txt(c, 'seals on form:', 272, 80, { size: 9, col: COL.dim }); m.seals.forEach((s, i) => txt(c, s, 272, 96 + i * 15, { size: 12, col: COL.pale }));
    };
    return m;
  },
});
