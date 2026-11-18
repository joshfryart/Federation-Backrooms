// Lab technician, survey: send the summary to the bridge. The bridge layout takes a fixed number of words. Each finding line carries its
// figure plus padding words you can trim (←) or restore (→); a finding the results sheet marks AWAITING must carry a caveat tag (Space), which
// costs words of its own. Fit the summary inside the word budget without dropping a caveat or hedging a confirmed fact, then send (Enter).
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const FIND = [['Spore count', '340 /ml'], ['Silica fraction', '62 %'], ['Organic carbon', '0.8 mg'], ['Water ice', '11 %'], ['Trace iridium', '4 ppm'], ['Amino signal', 'weak'], ['Halite crystals', 'present'], ['Isotope ratio', '1.07']];
const PAD = ['clearly', 'in all three runs', 'as expected', 'notably', 'within normal limits', 'per the sheet', 'quite'];
export default define({
  job: { billet: 'lab', label: 'Send summary to bridge', type: 'task:survey' },
  title: 'Fit the summary, keep the caveats', dept: 'sciences', host: 'console', tool: 'Lab console summary form',
  how: 'Select a finding (↑ ↓), trim padding words (←) or restore them (→), and tag every AWAITING finding with a caveat (Space). Send (Enter) once the summary fits the word budget.',
  keys: ['↑ ↓ select finding', '← trim / → restore words', 'Space caveat', 'Enter send'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'trim and caveat', input: 'arrows+space+enter', win: 'summary cut to the bridge word budget with every unconfirmed finding carrying its caveat and no confirmed fact hedged',
    fail: 'sending with a caveat dropped, a confirmed result hedged, or the message over its word budget',
    rule: 'Each line shows its word cost. Trim padding words with ← until the total fits the budget; never remove a caveat to make room. Space toggles a caveat on the selected line; AWAITING lines need one, CONFIRMED lines must not.' },
  rush: 'Sent the headline numbers without the caveats: they read as certain on the bridge.',
  captions: { 'caveat dropped': 'bridge query tone', 'hedged fact': 'bridge query tone', overlength: 'layout rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, picks = shuffle(r, FIND).slice(0, 5), pend = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 3)));
    m.lines = picks.map((f, k) => { const pad = shuffle(r, PAD).slice(0, ri(r, 1, 3)); return { name: f[0], val: f[1], core: 3, pad, keep: pad.length, pending: pend.has(k), cav: !pend.has(k) && r() < 0.25 }; });
    const words = (l) => l.core + l.pad.slice(0, l.keep).reduce((a, p) => a + p.split(' ').length, 0) + (l.cav ? 2 : 0);
    m.total = () => m.lines.reduce((a, l) => a + words(l), 0);
    const need = m.lines.reduce((a, l) => a + l.core + (l.pending ? 2 : 0), 0); m.budget = need + ri(r, 1, 3) + (m.calm ? 1 : 0);
    m.sel = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), l = m.lines[m.sel];
      if (a === 'U') { m.sel = (m.sel + 4) % 5; return true; } if (a === 'D') { m.sel = (m.sel + 1) % 5; return true; }
      if (a === 'L') { l.keep = Math.max(0, l.keep - 1); return true; } if (a === 'R') { l.keep = Math.min(l.pad.length, l.keep + 1); return true; }
      if (SPACE(code)) { l.cav = !l.cav; return true; }
      if (ENTER(code)) {
        if (m.lines.some(x => x.pending && !x.cav)) { m.fault('caveat dropped'); return true; }
        if (m.lines.some(x => !x.pending && x.cav)) { m.fault('hedged fact'); return true; }
        if (m.total() > m.budget) { m.fault('overlength'); return true; }
        m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    const goTo = (k) => [[k < m.sel ? 'ArrowUp' : 'ArrowDown', true]];
    m.hint = () => {
      if (m.state !== 'play') return [];
      const k1 = m.lines.findIndex(l => l.pending !== l.cav); if (k1 >= 0) return k1 === m.sel ? [['Space', true]] : goTo(k1);
      if (m.total() > m.budget) { const k2 = m.lines.findIndex(l => l.keep > 0); return k2 === m.sel ? [['ArrowLeft', true]] : goTo(k2); }
      return [['Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ l: m.lines.map(l => [l.name, l.pending, l.pad.length]), b: m.budget });
    m.buttons = () => [['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowLeft', 'Trim'], ['ArrowRight', 'Restore'], ['Space', 'Caveat'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      m.lines.forEach((l, k) => {
        const y = 12 + k * 24; if (k === m.sel) box(c, 6, y - 2, 388, 22, COL.panel, COL.gold, 4);
        txt(c, l.pending ? 'AWAITING' : 'CONFIRMED', 12, y + 13, { size: 9, col: l.pending ? COL.warn : P.good });
        const s = `${l.name} ${l.val}${l.keep ? ' ' + l.pad.slice(0, l.keep).join(' ') : ''}`; txt(c, s.length > 36 ? s.slice(0, 35) + '…' : s, 78, y + 14, { size: 11 });
        if (l.cav) { box(c, 316, y + 2, 50, 15, null, COL.lav, 3); txt(c, 'caveat', 341, y + 13, { size: 9, col: COL.lav, align: 'center' }); }
        txt(c, `${words(l)}w`, 390, y + 14, { size: 10, col: COL.dim, align: 'right' });
      });
      const over = m.total() > m.budget; txt(c, `words ${m.total()} / ${m.budget}${over ? '  OVER' : ''}`, 12, 140, { size: 13, col: over ? COL.warn : P.good });
    };
    return m;
  },
});
