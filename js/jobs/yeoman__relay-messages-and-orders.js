// Yeoman: relay messages and orders. Signals pile up at the bridge comms console, each header carrying a priority tag and a routing code.
// Look the code up on the routing list, turn the channel dial to that department and send. Urgent traffic goes first and fades fast; a
// message sent on the wrong channel lands with the wrong department, and one left too long decays off the queue.
import { define, machine, ARROW, SPACE, ri, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const DEPTS = ['ENG', 'SCI', 'MED', 'SEC', 'OPS', 'CRG'];
const CODES = ['2F', '3K', '4C', '5R', '6V', '7M', '8T', '9X'];
const BODY = ['Coolant report due', 'Away team at pad 2', 'Sample hold request', 'Deck 6 access change', 'Sensor time slot', 'Cargo lift fault', 'Shift handover', 'Orders from Starfleet'];

export default define({
  job: { billet: 'yeoman', label: 'Relay messages and orders', type: 'loop' },
  title: 'Channel dial routing of the comms queue', dept: 'command', host: 'console', tool: 'Comms console channel dial',
  how: 'Pick a message (↑ ↓), read its routing code against the list, turn the channel dial (← →) to that department and send it (Space). Urgent first: they fade fast.',
  keys: ['↑ ↓ pick message', '← → turn the dial', 'Space send'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dial and send', input: 'arrows+space', win: 'every queued signal sent on the channel its routing code names before its carrier fades, urgent traffic ahead of routine',
    fail: 'a message sent on the wrong department channel, routine sent while urgent waits, or a signal left to decay',
    rule: 'Each header shows U or R and a routing code. Find the code on the routing list, turn the dial to that department, press Space. Never send routine while an urgent message is in the queue.' },
  rush: 'Broadcast the whole queue on the all-hands channel.',
  captions: { misrouted: 'wrong-desk chirp', 'urgent held': 'priority buzzer', decayed: 'carrier hiss fades' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 1.6 : 1;
    const codes = shuffle(r, CODES).slice(0, 6); m.route = codes.map((c, i) => [c, DEPTS[i]]); m.route = shuffle(r, m.route);
    const bodies = shuffle(r, BODY); let at = 0;
    m.msgs = Array.from({ length: 6 }, (_, i) => { const urg = i === 0 ? r() < 0.5 : r() < 0.4, [code, dept] = m.route[ri(r, 0, 5)]; at += i < 2 ? 0 : rf(r, 1.4, 2.4) * k;
      return { at, urg, code, dept, body: bodies[i], life: (urg ? 7 : 12) * k, age: 0, done: false }; });
    m.dial = ri(r, 0, 5); m.selI = 0; m.sent = 0; m.rounds = 6; m.round = 0;
    const queue = () => m.msgs.filter(x => !x.done && m.t >= x.at);
    const finish = () => { if (m.msgs.every(x => x.done) && m.state === 'play') m.win(); };
    const sel = () => { const q = queue(); if (!q.length) return null; m.selI = Math.min(m.selI, q.length - 1); return q[m.selI]; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { if (down) { const q = queue(); if (a === 'U') m.selI = Math.max(0, m.selI - 1); else if (a === 'D') m.selI = Math.min(Math.max(0, q.length - 1), m.selI + 1); else m.dial = (m.dial + (a === 'R' ? 1 : 5)) % 6; } return true; }
      if (!SPACE(code)) return false; if (!down) return true; const s = sel(); if (!s) return true;
      if (!s.urg && queue().some(x => x.urg)) m.fault('urgent held'); else if (DEPTS[m.dial] !== s.dept) m.fault('misrouted');
      s.done = true; m.sent++; m.round = m.sent; finish(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const x of queue()) { x.age += dt; if (x.age > x.life) { x.done = true; m.fault('decayed'); m.round = ++m.sent; } } finish(); };
    const best = () => { const q = queue(); if (!q.length) return -1; let b = 0; q.forEach((x, i) => { const y = q[b]; if ((x.urg && !y.urg) || (x.urg === y.urg && x.life - x.age < y.life - y.age)) b = i; }); return b; };
    m.hint = () => { const b = best(); if (b < 0) return []; if (m.selI !== b) return [[m.selI < b ? 'ArrowDown' : 'ArrowUp', true]];
      const want = DEPTS.indexOf(queue()[b].dept); if (m.dial !== want) return [[((want - m.dial + 6) % 6) <= 3 ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Space', true]]; };
    m.bad = () => { const s = sel(); if (!s) return null; return DEPTS[m.dial] === s.dept ? 'ArrowRight' : 'Space'; };
    m.view = () => ({ route: m.route, msgs: m.msgs.map(x => [x.urg, x.code, +x.at.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀ dial'], ['ArrowRight', 'dial ▶'], ['Space', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'QUEUE', 10, 16, { size: 10, col: COL.peri }); const q = queue(); sel();
      q.slice(0, 5).forEach((x, i) => { const y = 22 + i * 24, on = i === m.selI; box(c, 8, y, 230, 21, on ? 'rgba(244,194,91,.18)' : 'rgba(255,255,255,.05)', on ? COL.gold : null, 4);
        lamp(c, 20, y + 10, 7, x.urg ? P.bad : COL.peri, x.urg ? 'triangle' : 'circle'); txt(c, `${x.urg ? 'U' : 'R'} · ${x.code}  ${x.body}`, 32, y + 14, { size: 10 });
        bar(c, 180, y + 7, 52, 7, 1 - x.age / x.life, { col: x.urg ? COL.warn : COL.lav }); });
      if (!q.length) txt(c, 'queue clear: standing by', 14, 40, { size: 11, col: COL.dim });
      txt(c, 'ROUTING LIST', 250, 16, { size: 10, col: COL.peri }); m.route.forEach(([cd, d], i) => txt(c, `${cd} → ${d}`, 252, 32 + i * 14, { size: 11, col: COL.pale }));
      txt(c, 'DIAL', 250, 130, { size: 10, col: COL.dim }); DEPTS.forEach((d, i) => { const on = i === m.dial; box(c, 250 + (i % 3) * 48, 134 + Math.floor(i / 3) * 17, 44, 15, on ? COL.gold : 'rgba(255,255,255,.06)', null, 4);
        txt(c, (on ? '▸' : '') + d, 272 + (i % 3) * 48, 145 + Math.floor(i / 3) * 17, { size: 10, align: 'center', col: on ? COL.dark : COL.ink }); });
      txt(c, `sent ${m.sent} / 6`, 10, H - 8, { size: 11, col: COL.pale });
    };
    return m;
  },
});
