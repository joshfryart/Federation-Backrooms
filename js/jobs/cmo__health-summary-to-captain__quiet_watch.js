// CMO: health summary to the captain (quiet watch). The sickbay board carries eight lines: routine figures, and the three facts that could
// change the captain's decision (any outbreak, the unfit count, the free beds), each listed twice: once as a bare number and once with
// its unit and time stamp. Fill the three priority slots (digit) with the stamped versions, outbreak first, then unfit, then beds, and
// read it to the captain (Enter).
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const ROUT = ['Replicator nutrition audit complete', 'Dental recalls: 3 booked', 'Sickbay linen stock at 82 %', 'Annual physicals 41 % done', 'Hypospray recalibration due', 'Counsellor sessions up 2 this week', 'Biobed 4 sensor replaced'];
export default define({
  job: { billet: 'cmo', label: 'Health summary to captain', type: 'task:quiet_watch' },
  title: 'Three-fact captain summary', dept: 'medical', host: 'console', tool: 'Readiness board and summary form',
  how: 'Pick the three decision facts from the board (1 – 8) in order outbreak, unfit, beds, taking the line that carries a unit and a time stamp, then read the summary to the captain (Enter).',
  keys: ['1 – 8 put line in next slot', 'Enter read to captain'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'summarise', input: 'digits+enter', win: 'two summaries delivered holding only the outbreak, unfit and bed facts in that order, each stamped with unit and time',
    fail: 'filling a slot with a routine figure, a bare unstamped number, the wrong order, or delivering with a slot empty',
    rule: 'Eight board lines; three slots. Only outbreak, unfit and bed facts change a decision, in that order. Each appears twice: take the one with a unit and a time stamp. Digit fills a slot, Enter delivers.' },
  rush: 'Read the whole board out line by line until the captain waved you off.',
  captions: { 'buried in figures': 'captain sighs', 'bare number': 'captain asks: as of when?', 'out of order': 'captain frowns', 'left out a bad trend': 'captain asks: anything else?' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const mk = () => { const hh = String(ri(r, 6, 22)).padStart(2, '0') + String(ri(r, 0, 5) * 10).padStart(2, '0'), ill = ri(r, 3, 9), unfit = ri(r, 2, 7), beds = ri(r, 2, 9), routs = shuffle(r, ROUT).slice(0, 2);
      const facts = [{ kind: 'outbreak', p: 0, ok: true, s: `Gastric outbreak: ${ill} cases, deck 6 · ${hh}` }, { kind: 'outbreak', p: 0, ok: false, s: `Outbreak cases ${ill}` },
        { kind: 'unfit', p: 1, ok: true, s: `${unfit} crew unfit for duty · ${hh}` }, { kind: 'unfit', p: 1, ok: false, s: `Unfit: ${unfit}` },
        { kind: 'beds', p: 2, ok: true, s: `${beds} of 12 beds free · ${hh}` }, { kind: 'beds', p: 2, ok: false, s: `Beds ${beds}` },
        ...routs.map(s => ({ kind: 'routine', p: -1, ok: false, s }))];
      return { lines: shuffle(r, facts), slots: [] }; };
    m.boards = [mk(), mk()]; m.k = 0; m.rounds = 2; m.round = 0; m.flash = '';
    const B = () => m.boards[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!(d >= 1 && d <= 8) && !ENTER(code)) return false; if (!down) return true; const b = B();
      if (d) { if (b.slots.length >= 3) return true; const l = b.lines[d - 1]; if (b.slots.includes(d - 1)) return true;
        if (l.kind === 'routine') { m.fault('buried in figures'); m.flash = 'routine figure: it changes no decision'; return true; }
        if (l.p !== b.slots.length) { m.fault('out of order'); m.flash = 'outbreak, then unfit, then beds'; return true; }
        if (!l.ok) { m.fault('bare number'); m.flash = 'no unit or time stamp on that line'; return true; }
        b.slots.push(d - 1); m.flash = ''; return true; }
      if (b.slots.length < 3) { m.fault('left out a bad trend'); m.flash = 'a priority slot is empty'; return true; }
      m.round++; m.flash = 'captain nods'; if (++m.k >= 2) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const b = B(); if (!b) return []; if (b.slots.length >= 3) return [['Enter', true]]; const j = b.lines.findIndex(l => l.ok && l.p === b.slots.length); return [['Digit' + (j + 1), true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ b: m.boards.map(b => b.lines.map(l => l.s)) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ['Digit' + n, String(n)]), ['Enter', 'Read it']];
    m.draw = (c, W, H, P) => {
      const b = B() || m.boards[1];
      b.lines.forEach((l, j) => { const y = 16 + j * 18, used = b.slots.includes(j); txt(c, `${j + 1}`, 10, y, { size: 11, col: COL.gold }); txt(c, (used ? '✓ ' : '') + l.s, 24, y, { size: 11, col: used ? COL.dim : COL.ink }); });
      ['1 · outbreak', '2 · unfit', '3 · beds'].forEach((s, q) => { const y = 14 + q * 40, f = b.slots[q]; box(c, 270, y, 120, 34, COL.panel, f != null ? P.good : 'rgba(255,255,255,.2)');
        txt(c, s, 276, y + 13, { size: 10, col: COL.dim }); txt(c, f != null ? '✓ line ' + (f + 1) : 'empty', 276, y + 27, { size: 11, col: f != null ? P.good : COL.dim }); });
      txt(c, `briefs ${m.round} / 2`, 10, 164, { size: 11, col: COL.dim }); txt(c, m.flash, 390, 164, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
