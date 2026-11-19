// Environmental tech: post-test report with fault list (shakedown). Go down the test log line by line and fill the fault list form. A PASS line
// gets no row (1). A fault gets a row at its severity (2 minor, 3 major), and so does a fault FIXED ON THE SPOT: it still happened. Each fault
// comes with its ticket: if the ticket number on the card does not match the log digit for digit, query it (4) instead. Sign and send (Enter).
import { define, machine, DIG, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const SYS = ['Scrubber bank', 'Fan bank', 'Coolant pump', 'Water pump', 'Zone lights', 'Dampers', 'Emergency lights', 'Humidity trim'];
export default define({
  job: { billet: 'env', label: 'Post-test report with fault list', type: 'task:shakedown' },
  title: 'Fault list rows from the test log', dept: 'engineering', host: 'console', tool: 'Post-test fault list form',
  how: 'For each test log line: 1 no row (PASS), 2 minor row, 3 major row (fixed-on-the-spot faults still need their row), 4 query a ticket whose number does not match the log. Enter signs and sends the report at the end.',
  keys: ['1 no row', '2 minor row', '3 major row', '4 query ticket', 'Enter sign + send'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'file the rows', input: 'digits+enter', win: 'every test log line carried onto the fault list at its severity, fixed-on-the-spot faults included, mismatched tickets queried, then signed',
    fail: 'leaving a fixed-on-the-spot fault off the list, filing the wrong severity, filing against a mismatched ticket, or signing with lines left',
    rule: 'Read the log line and the ticket card side by side. FIXED ON SPOT still files at its original severity. Ticket digits differ from the log: press 4. Enter only after the last line.' },
  rush: 'Listed the faults that were still open and signed it; the ones fixed on the spot never made the report.',
  captions: { 'left off': 'ACE pen tap', 'wrong severity': 'form flagged', 'bad ticket': 'form flagged', 'false query': 'form flagged', 'unsigned rows': 'form rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.lines = shuffle(r, SYS).slice(0, 6).map(sys => {
      const kind = pick(r, ['pass', 'fault', 'fixed', 'fixed', 'fault']), sev = ri(r, 2, 3), tk = String(ri(r, 300, 899));
      let card = tk; if (kind !== 'pass' && r() < 0.25) { const d = tk.split(''); [d[1], d[2]] = d[1] === d[2] ? [d[1], String((+d[2] + 1) % 10)] : [d[2], d[1]]; card = d.join(''); }
      return { sys, kind, sev, tk, card };
    });
    if (!m.lines.some(l => l.kind === 'fixed')) m.lines[ri(r, 0, 5)].kind = 'fixed';
    m.i = 0; m.dw = 0; m.cd = 0; m.rows = []; m.rounds = 6; m.round = 0;
    m.want = (l) => l.kind === 'pass' ? 1 : l.card !== l.tk ? 4 : l.sev;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (ENTER(code)) { m.cd = 0.3; if (m.i >= m.lines.length) m.win(); else m.fault('unsigned rows'); return true; }
      if (d < 1 || d > 4) return false; m.cd = 0.25; const l = m.lines[m.i]; if (!l) return true; const w = m.want(l);
      if (d !== w) { m.fault(w === 4 ? 'bad ticket' : d === 4 ? 'false query' : d === 1 ? 'left off' : w === 1 ? 'wrong severity' : 'wrong severity'); return true; }
      if (d === 2 || d === 3) m.rows.push(`${l.sys} · sev ${d === 3 ? 'major' : 'minor'} · tkt ${l.tk}`); else if (d === 4) m.rows.push(`${l.sys} · ticket queried`);
      m.i++; m.round = m.i; m.dw = 0; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cd -= dt; m.dw += dt; };
    m.hint = () => { if (m.cd > 0 || m.dw < 0.35) return []; const l = m.lines[m.i]; return l ? [[`Digit${m.want(l)}`, true]] : [['Enter', true]]; };
    m.bad = () => { if (m.cd > 0) return null; const l = m.lines[m.i]; if (!l) return 'Enter'; return l.kind === 'fixed' ? 'Digit1' : l.kind === 'pass' ? 'Digit3' : 'Digit1'; };
    m.view = () => ({ l: m.lines.map(l => [l.sys, l.kind, l.sev, l.tk, l.card]) });
    m.buttons = () => [['Digit1', '1 No row'], ['Digit2', '2 Minor'], ['Digit3', '3 Major'], ['Digit4', '4 Query tkt'], ['Enter', 'Sign + send']];
    m.draw = (c, W, H, P) => {
      const l = m.lines[m.i]; box(c, 10, 10, 218, 84, COL.panel, COL.gold, 6);
      if (l) {
        txt(c, `TEST LOG  ${m.i + 1} / ${m.lines.length}`, 20, 28, { size: 10, col: COL.dim }); txt(c, l.sys, 20, 48, { size: 14 });
        txt(c, l.kind === 'pass' ? 'PASS' : `${l.kind === 'fixed' ? 'FIXED ON SPOT — was ' : 'FAULT — '}${l.sev === 3 ? 'major' : 'minor'}`, 20, 68, { size: 12, col: l.kind === 'pass' ? P.good : P.bad });
        if (l.kind !== 'pass') txt(c, `log ticket ${l.tk}`, 20, 86, { size: 12, col: COL.pale });
        if (l.kind !== 'pass') { box(c, 238, 10, 150, 50, '#2a2540', COL.lav, 4); txt(c, 'TICKET CARD', 248, 28, { size: 10, col: COL.lav }); txt(c, `No. ${l.card}`, 248, 50, { size: 16 }); }
      } else txt(c, 'All lines filed — Enter to sign', 20, 56, { size: 13, col: P.good });
      txt(c, 'FAULT LIST', 12, 112, { size: 10, col: COL.dim }); m.rows.slice(-3).forEach((s, k) => txt(c, s, 12, 128 + k * 14, { size: 10, col: COL.ink }));
    };
    return m;
  },
});
