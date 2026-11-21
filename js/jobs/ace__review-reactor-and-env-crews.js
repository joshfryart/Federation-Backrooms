// Assistant Chief Engineer: review reactor and env crews. The crew chief says every section is finished, but the work order is only worth
// signing once each flagged gauge has been read at the junction against the printed value. Read a line (1-5) to see the real gauge, note the
// gaps (Space), and only then sign (Enter). Signing on the crew's word alone, or with a gap un-noted, is the failure.
import { define, machine, DIG, SPACE, ENTER, ri, pick, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Review reactor and env crews', type: 'loop' },
  title: 'Read the junction before signing', dept: 'engineering', host: 'console', tool: 'Work-order clipboard',
  how: 'The chief says all sections are done. Read each line (1-5) to see its real gauge, mark gaps with Space, then sign with Enter.',
  keys: ['1-5 read a line', 'Space note a gap on that line', 'Enter sign the order'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'read before signing', input: 'digits+space+enter',
    win: 'order signed after every line was read at the junction and exactly the short gauges were noted as gaps',
    fail: 'signing a line never read, noting a good gauge as a gap, or signing over a gap left un-noted',
    rule: 'Crew say done. Each line hides its real gauge until read. A gauge not equal to the ordered value is a gap. Read all, note gaps, then sign.' },
  rush: 'Took the chief at his word and signed the order unread.',
  captions: { 'signed on word': 'badge reader rejects the signature', 'wrong note': 'order bounced back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 5, items = ['Valve 1 handle', 'Pressure gauge', 'Valve 2 handle', 'Coolant gauge', 'Vent damper', 'Scrubber gauge'];
    m.ln = Array.from({ length: N }, (_, i) => { const o = ri(r, 40, 90); return { name: items[i], o, a: o, read: false, note: false }; });
    for (let k = 0; k < ri(r, 1, 2); k++) { const l = pick(r, m.ln); l.a = l.o - ri(r, 4, 12); }
    m.sel = 0; m.gaps = () => m.ln.filter(l => l.a !== l.o).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), l = m.ln[m.sel];
      if (d >= 1 && d <= N) { m.sel = d - 1; m.ln[m.sel].read = true; return true; }
      if (SPACE(code)) { if (!l.read) m.fault('signed on word'); else if (l.a === l.o) m.fault('wrong note'); else l.note = true; return true; }
      if (ENTER(code)) { if (m.ln.some(x => !x.read)) m.fault('signed on word'); else if (m.ln.some(x => x.note !== (x.a !== x.o))) m.fault('wrong note'); else m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const u = m.ln.findIndex(x => !x.read); if (u >= 0) return [['Digit' + (u + 1), true]]; const g = m.ln.findIndex(x => x.a !== x.o && !x.note);
      return g >= 0 ? [['Digit' + (g + 1), true], ['Space', true]] : [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ ln: m.ln.map(l => [l.o, l.a]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Space', 'Note gap'], ['Enter', 'Sign']];
    m.draw = (c) => { txt(c, 'Crew chief: "all sections finished"', 12, 14, { size: 11, col: COL.dim });
      m.ln.forEach((l, i) => { const y = 22 + i * 28; box(c, 10, y, 380, 24, COL.panel, m.sel === i ? COL.gold : null); txt(c, `${i + 1} ${l.name}`, 18, y + 16, { size: 11 });
        txt(c, `order ${l.o}`, 160, y + 16, { size: 11, col: COL.dim }); txt(c, l.read ? `read ${l.a}` : 'unread', 240, y + 16, { size: 11, col: l.read ? COL.pale : COL.dim });
        if (l.note) txt(c, '▲ GAP', 330, y + 16, { size: 11, col: COL.warn }); }); };
    return m;
  },
});
