// Cargo: verify the manifest and tie-down for an outbound load. For each manifest line pick the crate whose tag matches it exactly (three crates
// carry near-identical tags). Then read its strap gauge: tight earns the stamp (Enter), a loose strap is held back (Space).
import { define, machine, DIG, ENTER, SPACE, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Verify manifest and tie-down for outbound load', type: 'task:cargo_run' },
  title: 'Match the tag, test the strap', dept: 'services', host: 'console', tool: 'Outbound manifest and tag scanner',
  how: 'Press the digit of the crate whose tag matches the manifest line exactly. Then check its strap gauge: tight, press Enter to stamp; loose, press Space to hold it back.',
  keys: ['1-3 pick the crate', 'Enter stamp (strap tight)', 'Space hold back (strap loose)'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tag then strap', input: 'digits+enter+space',
    win: 'three manifest lines each matched to the one crate whose tag agrees, then stamped or held by the strap reading',
    fail: 'picking a look-alike crate, stamping a loose strap, or holding back a tight one',
    rule: 'The manifest line shows a code; three crates show near-identical tags that differ by one character. Press the matching crate\'s digit. Its strap gauge then decides: tight means Enter, loose means Space.' },
  rush: 'Signed the manifest sheet after glancing at the crates.',
  captions: { 'wrong crate': 'scanner mismatch', 'unsafe stamp': 'stamp refused', 'false hold': 'hold released' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, L = 'ABCDEFGH';
    m.lines = [0, 1, 2].map(() => { const base = [pick(r, L), pick(r, L), ri(r, 1000, 9999)], id = `${base[0]}${base[1]}-${base[2]}`, right = ri(r, 0, 2);
      const tags = [0, 1, 2].map(k => k === right ? id : `${base[0]}${base[1]}-${(base[2] + ri(r, 1, 8) * (r() < 0.5 ? 1 : 10) * (k + 1)) % 9000 + 1000}`);
      return { id, tags, right, tight: r() < 0.5, g: 0.2 + r() * 0.15, picked: false }; });
    m.lines[ri(r, 0, 2)].tight = false; m.i = 0; m.rounds = 3; m.round = 0;
    const L0 = () => m.lines[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const l = L0(), d = DIG(code); if (!l) return false;
      if (d >= 1 && d <= 3 && !l.picked) { if (d - 1 === l.right) l.picked = true; else m.fault('wrong crate'); return true; }
      if (l.picked && (ENTER(code) || SPACE(code))) { if (ENTER(code) !== l.tight) m.fault(l.tight ? 'false hold' : 'unsafe stamp'); else { m.i++; m.round = m.i; if (m.i >= 3) m.win(); } return true; }
      return false;
    };
    m.hint = () => { const l = L0(); return !l ? [] : !l.picked ? [['Digit' + (l.right + 1), true]] : [[l.tight ? 'Enter' : 'Space', true]]; };
    m.bad = () => { const l = L0(); return !l.picked ? 'Digit' + ((l.right + 1) % 3 + 1) : l.tight ? 'Space' : 'Enter'; };
    m.view = () => ({ lines: m.lines.map(l => [l.id, l.tags, l.tight]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Enter', 'Stamp'], ['Space', 'Hold']];
    m.draw = (c, W, H, P) => {
      const l = m.lines[Math.min(m.i, 2)]; txt(c, `MANIFEST LINE ${Math.min(3, m.i + 1)}: ${l.id}`, 12, 20, { size: 14, col: COL.gold });
      l.tags.forEach((t, k) => { const x = 14 + k * 128; box(c, x, 34, 118, 46, 'rgba(255,255,255,.06)', l.picked && k === l.right ? P.good : COL.dim, 6); txt(c, `${k + 1}  ${t}`, x + 8, 62, { size: 13 }); });
      if (l.picked) { txt(c, 'STRAP GAUGE', 14, 108, { size: 11, col: COL.peri }); bar(c, 14, 116, 220, 14, l.tight ? 0.8 : l.g, { band: [0.55, 1], good: P.good }); txt(c, l.tight ? 'tight: Enter stamps' : 'loose: Space holds', 250, 128, { size: 12, col: l.tight ? P.good : P.bad }); }
    };
    return m;
  },
});
