// Transporter tech: submit the shakedown fault list. Four fault cards came off the test stations' clip trays, their codes deliberately alike
// (4719 next to 4791). Type each card's four-digit code into the form; a line is checked against the cards when its fourth digit goes in.
// Critical cards (marked CRIT) must sit at the top of the list, so type them first. Then hold the submit key until the receipt tone.
// A code that matches no card is a mistype that would send the chief to the wrong station; letting go of submit early sends nothing.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Submit fault list', type: 'task:shakedown' },
  title: 'Fault card transcription and submit', dept: 'operations', host: 'console', tool: 'Fault list form',
  how: 'Type each card’s four-digit fault code (criticals first), then hold Space until the receipt tone. The codes look alike: copy them digit by digit.',
  keys: ['1-9 type the code', 'Space hold submit'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'transcribe cards', input: 'digits+space-hold', win: 'every fault card code transcribed exactly with critical cards at the top, then the list held through to the receipt tone',
    fail: 'a typed code that matches no card, a routine card entered above a critical one, or releasing submit before the receipt',
    rule: 'Type the four digits of a CRIT card first, then the routine cards, one line per card. Codes differ by a swapped pair, so check each digit. With all cards entered hold Space until the receipt bar fills.' },
  rush: 'Typed the fault codes from memory and hit submit.',
  captions: { mistyped: 'form rejects the line', 'critical not on top': 'error buzz', 'not sent': 'submit cancelled' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, SEND = m.calm ? 1.6 : 1.2;
    const base = [ri(r, 2, 9), ri(r, 1, 9), ri(r, 1, 9), ri(r, 1, 9)]; const codes = new Set([base.join('')]);
    while (codes.size < 4) { const a = base.slice(), i = ri(r, 0, 2); if (r() < 0.6) [a[i], a[i + 1]] = [a[i + 1], a[i]]; else a[ri(r, 1, 3)] = ri(r, 1, 9); if (a[0] === 1) a[0] = 2; codes.add(a.join('')); }
    const st = shuffle(r, ['Pad 1', 'Pad 2', 'Emitter ring', 'Buffer', 'Console', 'Coil bank']);
    m.cards = shuffle(r, [...codes]).map((c, i) => ({ c, st: st[i], crit: false, done: false }));
    m.cards[ri(r, 0, 3)].crit = true; if (r() < 0.5) m.cards[ri(r, 0, 3)].crit = true;
    m.buf = ''; m.list = []; m.send = 0; m.rounds = 4; m.round = 0;
    const next = () => m.cards.find(c => !c.done && c.crit) || m.cards.find(c => !c.done);
    m.key = (code, down = true) => {
      const d = DIG(code); if (SPACE(code)) { if (m.state === 'play') { if (!down && m.held.S && m.send > 0 && m.send < SEND) { m.fault('not sent'); m.send = 0; } m.held.S = !!down && m.list.length === 4; } return true; }
      if (!d) return false; if (m.state !== 'play' || !down || m.list.length >= 4) return true;
      m.buf += d; if (m.buf.length < 4) return true; const c = m.cards.find(x => !x.done && x.c === m.buf); m.buf = '';
      if (!c) { m.fault('mistyped'); return true; } if (!c.crit && m.cards.some(x => x.crit && !x.done)) { m.fault('critical not on top'); return true; }
      c.done = true; m.list.push(c); m.round++; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S) { m.send += dt; if (m.send >= SEND) m.win(); } };
    m.hint = () => { if (m.list.length === 4) return [['Space', true]]; const c = next(); return [['Digit' + c.c[m.buf.length], true]]; };
    m.bad = () => 'Digit1';
    m.view = () => ({ cards: m.cards.map(c => [c.c, c.crit]) });
    m.buttons = () => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ['Digit' + i, String(i)]).concat([['Space', 'Submit (hold)']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'FAULT CARDS', 16, 16, { size: 10, col: COL.dim });
      m.cards.forEach((k, i) => { const y = 22 + i * 30; box(c, 16, y, 170, 26, k.done ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)', k.crit ? P.bad : null, 4);
        txt(c, k.c, 26, y + 18, { size: 14, col: k.done ? COL.dim : COL.ink, font: 'monospace' }); txt(c, k.st, 82, y + 17, { size: 10, col: COL.dim }); if (k.crit) txt(c, '▲ CRIT', 180, y + 17, { size: 10, col: P.bad, align: 'right' }); });
      txt(c, 'FORM', 210, 16, { size: 10, col: COL.dim });
      m.list.forEach((k, i) => txt(c, `${i + 1}. ${k.c}  ${k.st}${k.crit ? '  ▲' : ''}`, 210, 34 + i * 18, { size: 11, col: k.crit ? P.bad : COL.ink, font: 'monospace' }));
      if (m.list.length < 4) txt(c, `${m.list.length + 1}. ${m.buf.padEnd(4, '_')}`, 210, 34 + m.list.length * 18, { size: 11, col: COL.gold, font: 'monospace' });
      else { txt(c, m.held.S ? 'SUBMITTING…' : 'hold Space to submit', 210, 128, { size: 11, col: m.held.S ? COL.warn : COL.pale }); bar(c, 210, 138, 170, 10, m.send / SEND, { col: P.good }); }
    };
    return m;
  },
});
