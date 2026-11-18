// Computer specialist: write the shakedown fault report. Lines from the sweep card and the failover book come up one by one. A real fault is
// typed into the report with the severity the severity card gives its finding (1 critical, 2 major, 3 minor). A PASS line, or a fault whose
// code is already in the report (both cards logged it), is skipped with Space. When the cards are done, send the report (Enter).
import { define, machine, DIG, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const FIND = [['over temp limit', 1], ['packets lost on failover', 1], ['repeat amber segment', 2], ['latency over baseline', 2], ['single amber blip', 3], ['one slow reply', 3]];
const SEV = ['', 'CRITICAL', 'MAJOR', 'MINOR'];
export default define({
  job: { billet: 'comp', label: 'Write the shakedown fault report', type: 'task:shakedown' },
  title: 'Shakedown report severity filing', dept: 'operations', host: 'console', tool: 'Shakedown report form',
  how: 'For each card line: if it is a fault not yet in the report, type it with its severity from the card (1 critical, 2 major, 3 minor). Skip PASS lines and repeated codes with Space. Send with Enter when every line is done.',
  keys: ['1-3 file with severity', 'Space skip line', 'Enter send report'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'file by severity', input: 'digits+space+enter', win: 'every coded fault from the test cards filed once with the severity its finding carries, total matching the cards, report sent',
    fail: 'filing a pass line or a code already listed, skipping a real fault, giving the wrong severity, or sending the report short',
    rule: 'Read each line\'s finding and match it on the severity card, then press that digit. A PASS or a code already in the report list on the right gets Space. Enter only after the last line.' },
  rush: 'Sent a one-line report saying "some faults found, see cards".',
  captions: { 'wrong severity': 'report form warning', 'listed twice': 'duplicate entry tone', 'missed fault': 'fault dropped warning', 'not a fault': 'pass logged as fault', 'sent short': 'report bounced' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nf = ri(r, 4, 5), lines = [];
    for (let k = 0; k < nf; k++) { const f = pick(r, FIND), sys = pick(r, ['Stack', 'Relay']) + ' ' + ri(r, 1, 9); lines.push({ sys, code: `${sys[0]}${ri(r, 1, 9)}-${ri(r, 100, 999)}`, find: f[0], sev: f[1], kind: 'fault' }); }
    const dup = lines[ri(r, 0, nf - 2)]; const ps = Array.from({ length: ri(r, 1, 2) }, () => ({ sys: pick(r, ['Stack', 'Relay', 'Route']) + ' ' + ri(r, 1, 9), code: '', find: 'PASS', sev: 0, kind: 'pass' }));
    let all = shuffle(r, [...lines, ...ps]); const after = all.indexOf(dup); all.splice(ri(r, after + 1, all.length), 0, { ...dup, kind: 'dup' });
    m.lines = all.map((l, k) => ({ ...l, src: k % 2 ? 'failover book' : 'sweep card' })); m.i = 0; m.rep = []; m.rounds = m.lines.length; m.round = 0;
    const L = () => m.lines[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (ENTER(code)) { if (m.i < m.lines.length) m.fault('sent short'); else m.win(); return true; }
      if (m.i >= m.lines.length) return SPACE(code) || (d > 0 && d <= 3);
      const l = L();
      if (SPACE(code)) { if (l.kind === 'fault') m.fault('missed fault'); m.i++; m.round = m.i; return true; }
      if (!d || d > 3) return false;
      if (l.kind === 'pass') { m.fault('not a fault'); return true; } if (l.kind === 'dup') { m.fault('listed twice'); return true; }
      if (d !== l.sev) { m.fault('wrong severity'); return true; }
      m.rep.push(`${l.sys} ${l.code} ${SEV[d]}`); m.i++; m.round = m.i; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.i >= m.lines.length) return [['Enter', true]]; const l = L(); return l.kind === 'fault' ? [['Digit' + l.sev, true]] : [['Space', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ l: m.lines.map(l => [l.code, l.find, l.kind]) });
    m.buttons = () => [['Digit1', '1 Critical'], ['Digit2', '2 Major'], ['Digit3', '3 Minor'], ['Space', 'Skip'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      FIND.forEach(([f, s], k) => txt(c, `${s} ${f}`, 14, 14 + k * 12, { size: 9, col: COL.dim }));
      const l = L(); box(c, 10, 88, 220, 46, 'rgba(255,255,255,.05)', COL.orange, 8);
      if (l) { txt(c, `${m.i + 1}/${m.lines.length} from ${l.src}`, 18, 102, { size: 10, col: COL.dim }); txt(c, `${l.sys} ${l.code || ''}`, 18, 116, { size: 12, col: COL.gold }); txt(c, l.find, 18, 130, { size: 11, col: l.find === 'PASS' ? P.good : COL.warn }); }
      else txt(c, 'Cards done — Enter to send', 18, 116, { size: 12, col: P.good });
      txt(c, `REPORT (${m.rep.length})`, 244, 14, { size: 10, col: COL.dim }); m.rep.slice(-7).forEach((x, k) => txt(c, x, 244, 30 + k * 16, { size: 10 }));
      txt(c, `Card faults: ${m.lines.filter(x => x.kind === 'fault').length}`, 14, H - 6, { size: 10, col: COL.dim });
    };
    return m;
  },
});
