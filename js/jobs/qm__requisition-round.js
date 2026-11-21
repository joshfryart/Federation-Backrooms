// Quartermaster: requisition round. Four slips come in. Check the signer against the officer roster: authorised slips get the item pulled
// (its bin digit) and handed over (Enter); unsigned or unlisted slips are refused (Space) and nothing is pulled.
import { define, machine, DIG, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';
const ITEMS = ['Bandages', 'Probe tips', 'Coolant', 'Batteries', 'Ration bars', 'Fuses'], OFF = ['Kovac', 'Reyes', 'Okafor', 'Lindqvist', 'Tan', 'Marsh'];

export default define({
  job: { billet: 'qm', label: 'Requisition round', type: 'loop' },
  title: 'Signature gate at the stores hatch', dept: 'services', host: 'console', tool: 'Requisition pad and roster',
  how: 'If the signer is on the roster: press the item\'s bin digit, then Enter to hand it over. If unsigned or not on the roster: press Space to refuse and pull nothing.',
  keys: ['1-6 pull from bin', 'Enter hand over', 'Space refuse'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'pull or refuse', input: 'digits+space+enter', win: 'four requisition slips each handed over from the right bin when the signer is listed, or refused when not',
    fail: 'issuing against an unlisted or missing signature, pulling the wrong bin, or refusing a listed officer',
    rule: 'Compare each slip\'s signer with the roster. Listed: bin digit, then Enter. Unsigned or unlisted: Space. Pulling stock for a bad slip is itself a fault.' },
  rush: 'Handed out whatever each slip asked for without looking at who signed it.',
  captions: { forged: 'forged-signature flag', 'wrong bin': 'wrong stock pulled', refused: 'officer insulted' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, roster = shuffle(r, OFF).slice(0, 3), others = OFF.filter(o => !roster.includes(o));
    m.roster = roster; m.slips = [0, 1, 2, 3].map(i => { const ok = i === 1 || r() < 0.5; return { ok, who: ok ? pick(r, roster) : r() < 0.3 ? '(unsigned)' : pick(r, others), item: ri(r, 1, 6), pulled: false }; });
    m.k = 0; m.round = 0; m.rounds = 4;
    const done = () => { m.k++; m.round = m.k; if (m.k >= 4) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const s = m.slips[m.k]; if (!s) return true; const d = DIG(code);
      if (d >= 1 && d <= 6) { if (!s.ok) m.fault('forged'); else if (d !== s.item) m.fault('wrong bin'); else s.pulled = true; }
      else if (ENTER(code)) { if (!s.ok) { m.fault('forged'); done(); } else if (!s.pulled) m.fault('wrong bin'); else done(); }
      else if (SPACE(code)) { if (s.ok) m.fault('refused'); else done(); } else return false; return true;
    };
    m.hint = () => { const s = m.slips[m.k]; if (!s) return []; return !s.ok ? [['Space', true]] : s.pulled ? [['Enter', true]] : [['Digit' + s.item, true]]; };
    m.bad = () => { const s = m.slips[m.k]; return s ? (s.ok ? 'Space' : 'Enter') : null; };
    m.view = () => ({ roster: m.roster, slips: m.slips.map(s => [s.who, s.item]) });
    m.buttons = () => [['Enter', 'Hand over'], ['Space', 'Refuse']];
    m.draw = (c, W, H, P) => {
      const s = m.slips[Math.min(m.k, 3)]; txt(c, 'ROSTER  ' + m.roster.join(' · '), 10, 18, { size: 11, col: COL.pale });
      box(c, 10, 30, 220, 90, COL.panel, COL.gold); txt(c, `Slip ${m.k + 1}/4`, 20, 50, { size: 12 }); txt(c, 'Item: ' + ITEMS[s.item - 1], 20, 72, { size: 13 }); txt(c, 'Signed: ' + s.who, 20, 96, { size: 13, col: COL.warn });
      ITEMS.forEach((it, i) => txt(c, `${i + 1} ${it}`, 250, 40 + i * 16, { size: 11, col: s.pulled && s.item === i + 1 ? P.good : COL.dim }));
      txt(c, s.pulled ? 'pulled: Enter to hand over' : 'bin digit to pull, Space to refuse', 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
