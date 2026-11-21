// Assistant Chief Engineer: catch up the repair backlog. Each minor-fault ticket is a hum or flicker with a blown fuse behind the panel. Match
// the amp rating the circuit needs to a fuse in the spares tin (1-4), push it home, then watch the status light: the hum goes quiet almost at once,
// but a fix only counts after the light has stayed steady for the full count. Closing the ticket early is a fault.
import { define, machine, DIG, ENTER, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Catch up the repair backlog', type: 'task:quiet_watch' },
  title: 'Match the amp, soak the light', dept: 'engineering', host: 'console', tool: 'Spares fuse tin',
  how: 'Pick the spare (1-4) whose amp rating matches the circuit, then wait for the status light to hold steady through the full count before Enter closes the ticket.',
  keys: ['1-4 fit that fuse', 'Enter close the ticket'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'match the amp', input: 'digits+enter',
    win: 'three tickets closed, each with the rated fuse seated and the status light steady for the whole count',
    fail: 'fitting a fuse of the wrong rating, or closing a ticket before the status light finished its steady count',
    rule: 'The circuit names its amp rating; the tin holds four ratings. Fit the match, then let the light count to 3 steady before closing.' },
  rush: 'Swapped in whatever fuse was nearest and closed the ticket when the hum stopped.',
  captions: { 'wrong rating': 'fuse pops', 'closed early': 'hum returns' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 2.4 : 3; m.rounds = 3; m.round = 0;
    const mk = () => { const amps = shuffle(r, [2, 3, 5, 7, 10, 15]).slice(0, 4); return { amps, ans: ri(r, 0, 3), ckt: pick(r, ['C-4 relay panel', 'Deck 6 lamp bank', 'Aux pump drive', 'Comm junction']), fit: -1, soak: 0 }; };
    m.tk = mk(); m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), k = m.tk;
      if (d >= 1 && d <= 4) { if (k.fit >= 0) return true; if (d - 1 !== k.ans) m.fault('wrong rating'); else { k.fit = d - 1; k.soak = 0; } return true; }
      if (ENTER(code) && k.fit >= 0) { if (k.soak < need) { m.fault('closed early'); k.soak = 0; } else { m.round++; if (m.round >= m.rounds) m.win(); else m.tk = mk(); } return true; }
      return ENTER(code);
    };
    m.tick = (dt) => { if (m.live(dt) && m.tk.fit >= 0) m.tk.soak = Math.min(need + 1, m.tk.soak + dt); };
    m.hint = () => { const k = m.tk; return k.fit < 0 ? [['Digit' + (k.ans + 1), true]] : k.soak >= need ? [['Enter', true]] : []; };
    m.bad = () => { const k = m.tk; return 'Digit' + (((k.ans + 1) % 4) + 1); };
    m.view = () => ({ tk: [m.tk.amps, m.tk.ans, m.tk.ckt] });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'Close']];
    m.draw = (c) => { const k = m.tk; txt(c, `Ticket ${m.round + 1}/3  hum at ${k.ckt}`, 14, 20, { size: 13 }); txt(c, `circuit rating ${k.amps[k.ans]} A`, 14, 42, { size: 14, col: COL.gold });
      k.amps.forEach((a, i) => { box(c, 14 + i * 92, 56, 84, 36, COL.panel, k.fit === i ? COL.gold : COL.peri); txt(c, `${i + 1}  ${a} A`, 26 + i * 92, 80, { size: 14 }); });
      txt(c, k.fit < 0 ? 'panel open, no fuse fitted' : k.soak >= need ? 'light steady - close it' : 'hum gone... counting steady', 14, 116, { size: 12, col: COL.pale }); bar(c, 14, 126, 280, 10, k.fit < 0 ? 0 : k.soak / need, { col: COL.peri }); };
    return m;
  },
});
