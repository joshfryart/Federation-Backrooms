// XO: alert and comm net check. Key each relay and station's test, then listen: a working station answers with its name; a faulty one
// lights its lamp and says nothing. Mark a spoken answer as answered, and mark silence as unanswered only after you have listened for the
// full count. Taking a lit lamp for an answer, or giving up before the count runs out, is a fault.
import { define, machine, DIG, SPACE, ENTER, shuffle, rf, txt, box, lamp, bar, COL } from './kit.js';

const ST = [['Red alert relay', 'Relay one, green flash, alarm sounding.'], ['Engineering', 'Engineering, Chief here.'], ['Sickbay', 'Sickbay, reading you.'], ['Security', 'Security office, loud and clear.'], ['Bulkhead panel D4', 'Panel D4 echo, test test.']];
export default define({
  job: { billet: 'xo', label: 'Alert and comm net check', type: 'loop' },
  title: 'Comm net ping and listen', dept: 'command', host: 'console', tool: 'Bridge test keys and comm badge',
  how: 'Key a station\'s test, then listen: Space when it answers by name, Enter for unanswered once the listening bar has run out in silence.',
  keys: ['1 – 5 test key', 'Space answered', 'Enter unanswered'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'ping and listen', input: 'digits+space+enter', win: 'every relay and station keyed and marked by whether a voice really answered',
    fail: 'counting a lit lamp as an answer, or writing a station off before the listening count runs out',
    rule: 'Press a station number: its lamp lights and the listening bar fills. Space if a voice answers with the station name; Enter for unanswered, only after the bar is full with no voice.' },
  rush: 'Watched the five lamps light and ticked the net as answered.',
  captions: { 'lamp taken as answer': 'comm hiss', 'not listened': 'pad tick', 'wrong mark': 'pad buzz', answer: 'voice on comm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dead = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, 1 + Math.floor(r() * 2))), listen = m.calm ? 2.4 : 2;
    m.st = ST.map(([name, say], i) => ({ name, say, dead: dead.has(i), delay: rf(r, 0.5, 1.4), at: 0, mark: 0 }));
    m.open = -1; m.rounds = 5; m.round = 0;
    const o = () => m.st[m.open], heard = (s) => !s.dead && m.t - s.at >= s.delay, waited = (s) => m.t - s.at >= listen;
    const close = (s, k) => { s.mark = k; m.open = -1; m.round++; if (m.st.every(x => x.mark)) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d) { if (d > 5) return false; const s = m.st[d - 1]; if (m.open < 0 && !s.mark) { s.at = m.t; m.open = d - 1; m.ev('ping', { i: d - 1 }); } return true; }
      if (!SPACE(code) && !ENTER(code)) return false; const s = o(); if (!s) return true;
      if (SPACE(code)) { if (!heard(s)) { m.fault(s.dead ? 'lamp taken as answer' : 'wrong mark'); if (s.dead) close(s, 2); return true; } close(s, 1); return true; }
      if (heard(s)) { m.fault('wrong mark'); return true; } if (!waited(s)) { m.fault('not listened'); return true; } close(s, 2); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const s = o(); if (!s) { const i = m.st.findIndex(x => !x.mark); return i < 0 ? [] : [['Digit' + (i + 1), true]]; } if (heard(s)) return [['Space', true]]; return waited(s) ? [['Enter', true]] : []; };
    m.bad = () => { const s = o(); if (!s) { const i = m.st.findIndex(x => !x.mark); return i < 0 ? null : 'Digit' + (i + 1); } return heard(s) ? 'Enter' : 'Space'; };
    m.view = () => ({ st: m.st.map(s => [s.dead, +s.delay.toFixed(2)]) });
    m.buttons = () => [...ST.map((s, i) => ['Digit' + (i + 1), String(i + 1)]), ['Space', 'Answered'], ['Enter', 'Unanswered']];
    m.draw = (c, W, H, P) => {
      m.st.forEach((s, i) => {
        const y = 8 + i * 25, op = i === m.open; box(c, 8, y, W - 16, 22, op ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', op ? COL.orange : null, 8);
        const lit = op || s.mark; lamp(c, 22, y + 11, 7, lit ? COL.gold : '#2a2748', lit ? 'diamond' : 'circle'); txt(c, `${i + 1} ${s.name}`, 36, y + 15, { size: 11 });
        if (s.mark) txt(c, s.mark === 1 ? '✓ answered' : '✗ unanswered', W - 14, y + 15, { size: 11, col: s.mark === 1 ? P.good : P.bad, align: 'right' });
        else if (op) { if (heard(s)) txt(c, `"${s.say}"`, 170, y + 15, { size: 10, col: COL.pale }); else bar(c, 200, y + 6, 180, 10, Math.min(1, (m.t - s.at) / listen), { col: COL.peri, mark: 1 }); }
      });
      txt(c, m.open < 0 ? 'Key a station test (1 – 5)' : 'Listening… Space answered · Enter unanswered when the bar is full', 12, H - 8, { size: 10, col: COL.dim });
    };
    return m;
  },
});
