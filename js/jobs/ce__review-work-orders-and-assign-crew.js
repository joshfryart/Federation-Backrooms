// Chief engineer: review work orders and assign crew. Tickets land in the fault queue in arrival order, each tagged LIFE, AIR, POWER or COMFORT
// and needing one trade. Three crews come free and go busy. Select a ticket (Up / Down) and press a crew's number to send them. The rule of the
// desk: never send a crew to a lower-risk ticket while a higher-risk one waits that a free crew of its trade could take now, and never send
// the wrong trade. A life support ticket left waiting beside a free crew is the costly mistake.
import { define, machine, DIG, ARROW, ri, rf, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const RISK = ['LIFE', 'AIR', 'POWER', 'COMFORT'], MARK = ['triangle', 'diamond', 'square', 'circle'], TRADE = ['EPS', 'Environmental', 'Mechanical'];
const WHERE = ['Deck 4 scrubber', 'Sickbay vent', 'Mess hall lights', 'Plasma relay 7', 'Lift B door', 'Cabin heater', 'Hydroponics pump', 'Shuttle bay seal', 'Replicator 2', 'Plant CO2 sensor', 'Cargo plating', 'Bridge EPS tap'];
export default define({
  job: { billet: 'ce', label: 'Review work orders and assign crew', type: 'loop' },
  title: 'Fault queue crew dispatch', dept: 'engineering', host: 'console', tool: 'Fault queue terminal',
  how: 'Select a ticket with Up / Down and press a free crew\'s number (1 – 3) to send them. Always serve the riskiest ticket a free crew of the right trade can take: LIFE before AIR before POWER before COMFORT.',
  keys: ['Up / Down select ticket', '1 – 3 send crew'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'dispatch by risk', input: 'arrows+digits', win: 'six tickets dispatched to free crews of the right trade without ever passing over a higher-risk ticket that could be served',
    fail: 'sending a crew to a lower-risk ticket while a serviceable higher-risk one waits, sending the wrong trade, or leaving a life support ticket beside a free crew',
    rule: 'The queue is in arrival order, not risk order. Pick a ticket with the arrows, press the crew number. Before sending, check no LIFE, AIR or POWER ticket above it in risk could go to a crew that is free right now.' },
  rush: 'Sent crews down the queue top to bottom as they came free.',
  captions: { 'unsafe wait': 'warning chirp', 'wrong trade': 'crew lead groans', 'crew busy': 'busy tone', 'life support waiting': 'environmental alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, patience = m.calm ? 6 : 4.5, need = 6;
    const names = shuffle(r, WHERE), mk = (k, risk) => ({ risk, trade: risk <= 1 ? 1 : risk === 2 ? 0 : ri(r, 0, 2), where: names[k % names.length], at: 0 });
    m.queue = [mk(0, ri(r, 2, 3)), mk(1, 0), mk(2, ri(r, 1, 3)), mk(3, ri(r, 2, 3))];
    m.arrivals = Array.from({ length: 5 }, (_, k) => ({ t: 2 + k * rf(r, 1.8, 2.6), tk: mk(4 + k, ri(r, 0, 3)) }));
    m.crews = shuffle(r, ['Ensign Ruiz', 'Lt Okafor', 'PO Lindqvist']).map((n, k) => ({ n, trade: k, busy: 0 }));
    m.sel = 0; m.done = 0; m.wait = 0; m.rounds = need; m.round = 0;
    const serviceable = (tk) => m.crews.some(c => c.trade === tk.trade && c.busy <= 0);
    m.best = () => { let b = -1; m.queue.forEach((tk, k) => { if (serviceable(tk) && (b < 0 || tk.risk < m.queue[b].risk)) b = k; }); return b; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code);
      if (a === 'U' || a === 'D') { if (m.queue.length) m.sel = (m.sel + (a === 'D' ? 1 : -1) + m.queue.length) % m.queue.length; return true; }
      if (!d || d > 3) return false; const tk = m.queue[m.sel], c = m.crews[d - 1]; if (!tk) return true;
      if (c.busy > 0) { m.fault('crew busy'); return true; }
      if (c.trade !== tk.trade) { m.fault('wrong trade'); return true; }
      if (m.queue.some(o => o !== tk && o.risk < tk.risk && serviceable(o))) { m.fault('unsafe wait'); return true; }
      c.busy = rf(r, 2.5, 4); m.queue.splice(m.sel, 1); m.sel = Math.min(m.sel, Math.max(0, m.queue.length - 1)); m.done++; m.round = m.done; m.wait = 0;
      if (m.done >= need) m.win(); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.crews.forEach(c => { c.busy -= dt; });
      while (m.arrivals.length && m.t >= m.arrivals[0].t) m.queue.push(m.arrivals.shift().tk);
      if (m.queue.some(tk => tk.risk === 0 && serviceable(tk))) { m.wait += dt; if (m.wait > patience) { m.fault('life support waiting'); m.wait = 0; } } else m.wait = 0;
    };
    m.hint = () => { const b = m.best(); if (b < 0) return []; if (b !== m.sel) return [[b > m.sel ? 'ArrowDown' : 'ArrowUp', true]]; const tk = m.queue[b]; return [['Digit' + (m.crews.findIndex(c => c.trade === tk.trade) + 1), true]]; };
    m.bad = () => { const tk = m.queue[m.sel]; if (!tk) return null; return 'Digit' + (m.crews.findIndex(c => c.trade !== tk.trade) + 1); };
    m.view = () => ({ q: m.queue.map(tk => [tk.risk, tk.trade, tk.where]), arr: m.arrivals.map(a => [a.tk.risk, +a.t.toFixed(1)]), crews: m.crews.map(c => c.n) });
    m.buttons = () => [['ArrowUp', '▲ ticket'], ['ArrowDown', '▼ ticket'], ...m.crews.map((c, k) => ['Digit' + (k + 1), `${k + 1} ${c.n.split(' ').pop()}`])];
    m.draw = (c, W, H, P) => {
      txt(c, 'FAULT QUEUE (arrival order)', 12, 14, { size: 10, col: COL.peri });
      m.queue.slice(0, 7).forEach((tk, k) => { const y = 20 + k * 20, on = k === m.sel; box(c, 10, y, 240, 18, on ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        lamp(c, 20, y + 9, 6, tk.risk === 0 ? P.bad : tk.risk === 1 ? COL.warn : tk.risk === 2 ? COL.gold : COL.dim, MARK[tk.risk]);
        txt(c, RISK[tk.risk], 30, y + 13, { size: 9, col: COL.ink }); txt(c, tk.where, 82, y + 13, { size: 10 }); txt(c, TRADE[tk.trade].slice(0, 5), 246, y + 13, { size: 9, align: 'right', col: COL.dim }); });
      txt(c, 'CREWS', 262, 14, { size: 10, col: COL.peri });
      m.crews.forEach((q, k) => { const y = 20 + k * 34, free = q.busy <= 0; box(c, 260, y, 130, 30, free ? 'rgba(79,208,106,.14)' : 'rgba(255,255,255,.04)', free ? P.good : null, 8);
        txt(c, `${k + 1} ${q.n}`, 268, y + 13, { size: 10 }); txt(c, `${TRADE[q.trade]} · ${free ? 'FREE' : 'busy ' + q.busy.toFixed(0) + ' s'}`, 268, y + 25, { size: 9, col: free ? COL.ink : COL.dim }); });
      txt(c, `dispatched ${m.done}/${need}`, 262, H - 12, { size: 11, col: COL.gold });
    };
    return m;
  },
});
