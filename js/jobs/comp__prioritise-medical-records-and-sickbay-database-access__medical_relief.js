// Computer specialist: prioritise medical records and sickbay database access. Drag the urgent patient requests above the routine ones (hold
// Space to grab the selected request, Up / Down to carry it). Then open each urgent record in turn (Enter), wait for it to load, and grant access
// (1-3) to the one terminal ID printed on that request card. A grant to any other terminal leaks the record.
import { define, machine, ARROW, DIG, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'comp', label: 'Prioritise medical records and sickbay database access', type: 'task:medical_relief' },
  title: 'Urgent record drag and grant', dept: 'operations', host: 'console', tool: 'Sickbay database access screen',
  how: 'Hold Space to grab a request and Up / Down to drag it; get every URGENT request above the routine ones. Then Enter opens the top urgent record; once it loads, grant it with the digit of the terminal ID on its card.',
  keys: ['Up / Down select', 'Space hold + Up / Down drag', 'Enter open record', '1-3 grant terminal'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'drag then grant', input: 'arrows+space-hold+digits+enter', win: 'every urgent patient request dragged above the routine queue, its record opened and loaded, and access granted to its card terminal',
    fail: 'opening records while a routine request still sits above an urgent one, granting before the record loads, or granting the wrong terminal ID',
    rule: 'Grabbed with Space held, a request moves with the arrows. When all URGENT tags are on top, Enter loads the first ungranted one; after LOADED, press the option matching its card terminal.' },
  rush: 'Granted the whole queue to whatever terminal asked first.',
  captions: { 'routine first': 'queue order warning', unopened: 'record not loaded', 'wrong terminal': 'records leak alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nu = ri(r, 2, 3), load = m.calm ? 0.6 : 0.8;
    const names = shuffle(r, ['Tal', 'Okafor', 'Reyes', 'Shran', 'Novak', 'Ibsen', 'Moro']);
    let q = Array.from({ length: 5 }, (_, i) => ({ who: names[i], urgent: i < nu, term: `SB-${ri(r, 10, 49)}`, granted: false }));
    q = shuffle(r, q); if (q[0].urgent) { const j = q.findIndex(x => !x.urgent); [q[0], q[j]] = [q[j], q[0]]; }
    q.forEach(x => { const t = x.term, a = t.slice(3); x.opts = shuffle(r, [t, `SB-${a[1]}${a[0]}`, `SB-${a[0]}${(+a[1] + ri(r, 1, 8)) % 10}`]); if (new Set(x.opts).size < 3) x.opts[x.opts.indexOf(t) === 0 ? 1 : 0] = `SB-${+a + 50}`; });
    m.q = q; m.sel = 0; m.grab = false; m.open = null; m.rounds = nu; m.round = 0;
    const sorted = () => { const k = m.q.findIndex(x => !x.urgent); return m.q.slice(k).every(x => !x.urgent); };
    const nextU = () => m.q.findIndex(x => x.urgent && !x.granted);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; if (SPACE(code)) { m.grab = !!down; return true; }
      if (!down) return false; const a = ARROW(code), d = DIG(code);
      if (a === 'U' || a === 'D') { const t = m.sel + (a === 'D' ? 1 : -1); if (t < 0 || t >= m.q.length) return true; if (m.grab) [m.q[m.sel], m.q[t]] = [m.q[t], m.q[m.sel]]; m.sel = t; return true; }
      if (ENTER(code)) { if (!sorted()) { m.fault('routine first'); return true; } const k = nextU(); if (k >= 0 && !m.open) m.open = { k, t: 0 }; return true; }
      if (d >= 1 && d <= 3) {
        if (!m.open || m.open.t < load) { m.fault('unopened'); return true; } const x = m.q[m.open.k];
        if (x.opts[d - 1] !== x.term) { m.fault('wrong terminal'); return true; }
        x.granted = true; m.open = null; m.round++; m.ev('grant', { who: x.who }); if (nextU() < 0) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.open) m.open.t += dt; };
    m.hint = () => {
      if (!sorted()) {
        const j = m.q.findIndex(x => !x.urgent), k = m.q.findIndex((x, i) => i > j && x.urgent);
        if (m.sel !== k) return m.grab ? [['Space', false]] : [[k > m.sel ? 'ArrowDown' : 'ArrowUp', true]];
        return m.grab ? [['ArrowUp', true]] : [['Space', true]];
      }
      if (m.grab) return [['Space', false]]; if (!m.open) return [['Enter', true]]; if (m.open.t < load) return [];
      const x = m.q[m.open.k]; return [['Digit' + (x.opts.indexOf(x.term) + 1), true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ q: m.q.map(x => [x.who, x.urgent, x.term]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Grab (hold)'], ['Enter', 'Open'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3']];
    m.draw = (c, W, H, P) => {
      txt(c, 'REQUEST QUEUE', 14, 14, { size: 10, col: COL.dim });
      m.q.forEach((x, i) => {
        const y = 20 + i * 24, on = i === m.sel; box(c, 10, y, 200, 21, on ? (m.grab ? 'rgba(240,147,58,.35)' : 'rgba(240,147,58,.15)') : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        txt(c, `${x.urgent ? '▲ URGENT' : '· routine'}  ${x.who}`, 18, y + 15, { size: 11, col: x.urgent ? COL.warn : COL.dim }); if (x.granted) txt(c, '✓', 196, y + 15, { size: 12, col: P.good });
      });
      if (m.grab) txt(c, 'GRABBED', 14, H - 8, { size: 10, col: COL.orange });
      const o = m.open; if (!o) { txt(c, sorted() ? 'Enter: open the next urgent record' : 'Drag urgent requests to the top', 224, 40, { size: 11, col: COL.dim }); return; }
      const x = m.q[o.k]; txt(c, `${x.who} — card terminal ${x.term}`, 224, 28, { size: 12, col: COL.gold });
      txt(c, o.t < load ? 'loading record…' : '● LOADED', 224, 50, { size: 11, col: o.t < load ? COL.peri : P.good });
      x.opts.forEach((t, k) => txt(c, `${k + 1}  grant ${t}`, 224, 80 + k * 22, { size: 12, col: COL.ink }));
    };
    return m;
  },
});
