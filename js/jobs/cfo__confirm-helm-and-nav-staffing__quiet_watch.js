// CFO: confirm helm and nav staffing on a quiet watch. Read each bridge seat's name tag against the watch bill and its fatigue flag. Some seats
// are empty or wrongly filled, or held by someone over their hours, and a relief is on the way: wait for the relief to sit down. Mark a seat
// staffed (its number) only when the tag matches the bill exactly (initial too) and the fatigue flag is clear; close the watch with Enter.
import { define, machine, ENTER, DIG, rf, ri, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const SEATS = ['Helm', 'Helm relief', 'Navigation', 'Nav plot', 'Flight ops'], SUR = ['Reyes', 'Tanaka', 'Okafor', 'Lindqvist', 'Haddad', 'Moreau', 'Novak'], INI = 'ABDJKMRST';
export default define({
  job: { billet: 'cfo', label: 'Confirm helm and nav staffing', type: 'task:quiet_watch' },
  title: 'Seat-by-seat watch bill match', dept: 'flight', host: 'console', tool: 'Bridge seat layout and watch bill',
  how: 'Mark a seat staffed (its number) only when the name tag matches the watch bill exactly and the fatigue flag is clear. Wait for reliefs; Enter closes the watch when every seat is green.',
  keys: ['1-5 mark seat staffed', 'Enter close the watch'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'mark staffed', input: 'digits+enter', win: 'every bridge seat marked staffed once its name tag, the watch bill line and its fatigue flag agree, then the watch closed',
    fail: 'marking a seat that is empty, held by the wrong officer or by someone flagged fatigued, or closing the watch with a gap',
    rule: 'Read tag against bill letter by letter (R. Reyes is not T. Reyes) and check the fatigue flag. If either is wrong, wait: the relief arrives and the seat changes. Then press its number.' },
  rush: 'Counted heads on the bridge and marked the bill complete.',
  captions: { 'false staffed': 'roster buzzer', 'gap left': 'empty console tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, SUR);
    m.seats = SEATS.map((s, i) => { const bill = `${pick(r, INI)}. ${names[i]}`; return { s, bill, tag: bill, tired: false, at: 0, marked: false }; });
    const odd = shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 2, 3)); let t = rf(r, 2, 4);
    for (const i of odd) { const z = m.seats[i], k = ri(r, 0, 2); if (k === 0) z.tag = ''; else if (k === 1) z.tag = `${INI[(INI.indexOf(z.bill[0]) + 1 + ri(r, 0, 6)) % INI.length]}. ${z.bill.slice(3)}`; else z.tired = true; z.at = t; t += rf(r, 2, 4.5); }
    m.cur = (z) => m.t >= z.at ? { tag: z.bill, tired: false } : { tag: z.tag, tired: z.tired };
    const ok = (z) => { const c = m.cur(z); return c.tag === z.bill && !c.tired; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 5) { const z = m.seats[d - 1]; if (z.marked) return true; if (!ok(z)) { m.fault('false staffed'); return true; } z.marked = true; m.ev('staffed', { seat: d }); return true; }
      if (ENTER(code)) { if (m.seats.some(z => !z.marked)) { m.fault('gap left'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const i = m.seats.findIndex(z => !z.marked && ok(z) && m.t >= z.at + 0.3); if (i >= 0) return [[`Digit${i + 1}`, true]]; return m.seats.every(z => z.marked) ? [['Enter', true]] : []; };
    m.bad = () => { const i = m.seats.findIndex(z => !z.marked && !ok(z)); return i >= 0 ? `Digit${i + 1}` : 'Enter'; };
    m.view = () => ({ s: m.seats.map(z => [z.bill, z.tag, z.tired]) });
    m.buttons = () => [...[1, 2, 3, 4, 5].map(k => [`Digit${k}`, `Seat ${k}`]), ['Enter', 'Close watch']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SEAT', 20, 16, { size: 10, col: COL.dim }); txt(c, 'WATCH BILL', 140, 16, { size: 10, col: COL.dim }); txt(c, 'NAME TAG', 240, 16, { size: 10, col: COL.dim }); txt(c, 'FATIGUE', 336, 16, { size: 10, col: COL.dim });
      m.seats.forEach((z, k) => {
        const y = 22 + k * 27, cu = m.cur(z); box(c, 12, y, 376, 23, COL.panel, z.marked ? P.good : null, 5);
        txt(c, `${k + 1} ${z.s}`, 20, y + 16, { size: 12 }); txt(c, z.bill, 140, y + 16, { size: 12, col: COL.pale });
        txt(c, cu.tag || '— empty —', 240, y + 16, { size: 12, col: cu.tag ? COL.ink : COL.dim });
        if (cu.tired) { lamp(c, 346, y + 11, 7, P.bad, 'triangle'); txt(c, 'over', 358, y + 16, { size: 10, col: P.bad }); } else txt(c, 'clear', 340, y + 16, { size: 10, col: COL.dim });
        if (z.marked) lamp(c, 120, y + 11, 6, P.good, 'circle');
      });
    };
    return m;
  },
});
