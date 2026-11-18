// Comms officer, shakedown: alert-tone and fault-warning drill. Fire each alert key (its digit) and let the tone play right through the
// headset; its pitch contour is drawn beside the drill card's contour for that alert. Mark it good (Space) only if the tone matches the card
// AND the warning light came on; mark it wrong on the drill sheet (Enter) if the tone is wrong, silent or the light stayed dark. Judging
// before the tone has finished is judging by the light alone.
import { define, machine, DIG, SPACE, ENTER, shuffle, ri, txt, box, lamp, COL } from './kit.js';

const ALERTS = [['Red alert', [1, 3, 1, 3, 1, 3]], ['Yellow alert', [2, 2, 0, 2, 2, 0]], ['Fault warning', [3, 1, 3, 1, 0, 0]], ['Intruder alert', [0, 1, 2, 3, 0, 1]], ['Hull breach', [3, 3, 3, 0, 0, 0]]];

export default define({
  job: { billet: 'comms', label: 'Alert-tone and fault-warning drill', type: 'task:shakedown' },
  title: 'Alert contour drill against the card', dept: 'operations', host: 'console', tool: 'Alert panel, headset and drill card',
  how: 'Fire each alert with its digit, let the tone finish, and compare its pitch contour and the warning light with the drill card: Space if both are right, Enter to mark it wrong.',
  keys: ['1-5 fire alert', 'Space tone and light good', 'Enter mark wrong'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'fire and compare', input: 'digits+space+enter', win: 'every alert fired and heard to the end, its tone contour and light checked against the drill card and marked right',
    fail: 'passing an alert on its light alone before the tone ends, passing a wrong or silent tone, or failing a good one',
    rule: 'Press an alert digit; six notes draw a contour next to the card\'s. After the last note: Space if every note and the light match, Enter if any note differs, it is silent, or the light is dark.' },
  rush: 'Watched the warning lights blink in turn and ticked the drill sheet.',
  captions: { 'judged early': 'sheet ticked mid-tone', 'passed bad alert': 'wrong tone sounds', 'false defect': 'drill sheet crossed out', note: 'alert tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nt = m.calm ? 0.28 : 0.22, bad = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 2, 3)));
    m.al = ALERTS.map(([n, card], i) => { let play = card.slice(), light = true, fault = null;
      if (bad.has(i)) { fault = ['tone', 'silent', 'light'][ri(r, 0, 2)]; if (fault === 'tone') { const j = ri(r, 0, 5); play[j] = (play[j] + ri(r, 1, 3)) % 4; } if (fault === 'silent') play = null; if (fault === 'light') light = false; }
      return { n, card, play, light, fault, mark: 0 }; });
    m.cur = -1; m.st = 0; m.done = 0; m.rounds = 5; m.round = 0;
    const playing = () => m.cur >= 0 && m.t - m.st < 6 * nt + 0.15;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 5) { if (playing() || m.al[d - 1].mark) return true; m.cur = d - 1; m.st = m.t; return true; }
      if (SPACE(code) || ENTER(code)) { if (m.cur < 0) return true; const a = m.al[m.cur]; if (playing()) { m.fault('judged early'); return true; }
        const ok = SPACE(code); if (ok && a.fault) m.fault('passed bad alert'); else if (!ok && !a.fault) m.fault('false defect');
        a.mark = ok ? 1 : 2; m.cur = -1; m.done++; m.round = m.done; if (m.done >= 5) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.cur < 0) { const j = m.al.findIndex(a => !a.mark); return j < 0 ? [] : [['Digit' + (j + 1), true]]; } if (playing()) return []; return [[m.al[m.cur].fault ? 'Enter' : 'Space', true]]; };
    m.bad = () => m.cur < 0 ? 'Digit' + (m.al.findIndex(a => !a.mark) + 1) : 'Space';
    m.view = () => ({ a: m.al.map(a => [a.fault, a.play]) });
    m.buttons = () => [...m.al.map((a, i) => ['Digit' + (i + 1), String(i + 1)]), ['Space', 'Good'], ['Enter', 'Mark wrong']];
    const contour = (c, x, y, notes, upto, col) => { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); notes.slice(0, upto).forEach((p, k) => { const px = x + k * 18, py = y - p * 9; k ? c.lineTo(px, py) : c.moveTo(px, py); c.lineTo(px + 14, py); }); c.stroke(); };
    m.draw = (c, W, H, P) => {
      m.al.forEach((a, i) => { const y = 10 + i * 24, s = i === m.cur; box(c, 6, y, 150, 20, s ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.05)', s ? COL.orange : null, 6);
        txt(c, `${i + 1} ${a.n}`, 12, y + 14, { size: 10, col: a.mark ? COL.dim : COL.ink }); if (a.mark) txt(c, a.mark === 1 ? '✓' : '✗', 150, y + 14, { size: 11, align: 'right', col: a.mark === 1 ? P.good : COL.warn }); });
      if (m.cur < 0) { txt(c, 'Fire an alert (1-5)', 200, 80, { size: 12, col: COL.pale }); return; } const a = m.al[m.cur], n = Math.min(6, Math.floor((m.t - m.st) / nt) + 1);
      txt(c, 'CARD', 170, 22, { size: 9, col: COL.dim }); contour(c, 210, 50, a.card, 6, COL.dim);
      txt(c, 'HEADSET', 170, 92, { size: 9, col: COL.dim }); if (a.play) contour(c, 210, 120, a.play, n, COL.gold); else txt(c, '… silence …', 210, 112, { size: 11, col: COL.dim });
      lamp(c, 370, 30, 10, a.light ? P.bad : COL.dark, a.light ? 'triangle' : 'circle'); txt(c, a.light ? 'light ON' : 'light dark', 370, 54, { size: 9, align: 'center', col: COL.dim });
      txt(c, playing() ? 'tone playing…' : 'Space good · Enter mark wrong', 170, 155, { size: 10, col: COL.pale });
    };
    return m;
  },
});
