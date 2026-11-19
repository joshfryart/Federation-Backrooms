// Chief of security: run an intruder lockdown drill. Hold Space to turn the lockdown key until it seats. Then the door tell-tales on the deck
// plan turn red one by one while section leads call in "sealed" on the PA, sometimes before their door has actually shut. Confirm a section
// (its digit) only when its own tell-tale is red. When the drill clock runs out, press Enter to log the doors still green as failed seals.
import { define, machine, SPACE, ENTER, DIG, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const N = 6, SECT = ['Deck 2 fwd', 'Deck 2 aft', 'Deck 3 fwd', 'Deck 3 aft', 'Deck 4 fwd', 'Deck 4 aft'];
export default define({
  job: { billet: 'cos', label: 'Run an intruder lockdown drill', type: 'task:shakedown' },
  title: 'Lockdown key and tell-tales', dept: 'security', host: 'console', tool: 'Bridge lockdown key and deck plan',
  how: 'Hold Space to turn the lockdown key until it seats. Confirm each section (1-6) only once its door tell-tale is red, whatever the lead says. When the drill clock ends, Enter logs the green ones as failed.',
  keys: ['Space hold: turn the key', '1-6 confirm a section', 'Enter close the drill'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'arm and confirm', input: 'space-hold+digits+enter', win: 'the lockdown key seated, every section confirmed only after its tell-tale showed red, and the drill closed with the green doors logged as failed seals',
    fail: 'confirming a section on the lead\'s word while its tell-tale is still green, letting the key snap back, or closing the drill early',
    rule: 'The key seats after a full second of Space. A lead\'s "sealed" call proves nothing: the door must show red (■). After the drill clock, any door still green (○) is a failed seal: Enter.' },
  rush: 'Read the drill order and ticked every section as each lead reported.',
  captions: { 'key slipped': 'key snaps back', 'took the report': 'PA: "Sealed!"', 'closed early': 'drill clock ticking', 'unconfirmed seal': 'checklist beep', 'no key': 'console buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, KEY = 1.0, CLOCK = m.calm ? 9 : 7;
    const stuck = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 1 + Math.floor(r() * 2)));
    m.sec = SECT.map((n, i) => { const red = stuck.has(i) ? 99 : rf(r, 0.4, CLOCK - 1.5); return { n, red, call: stuck.has(i) ? rf(r, 0.5, 3) : Math.max(0.2, red + rf(r, -1.2, 0.6)), ok: false }; });
    m.key0 = 0; m.armed = false; m.dt = 0; m.rounds = N; m.round = 0;
    const isRed = (s) => m.armed && m.dt >= s.red;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (m.armed) return true; m.held.S = down; if (!down) { if (m.key0 >= KEY) { m.armed = true; m.ev('armed'); } else if (m.key0 > 0.1) m.fault('key slipped'); m.key0 = 0; } return true; }
      if (!down) return false; const d = DIG(code);
      if (d && d <= N) { if (!m.armed) { m.fault('no key'); return true; } const s = m.sec[d - 1]; if (s.ok) return true; if (!isRed(s)) { m.fault('took the report'); return true; } s.ok = true; m.round = m.sec.filter(x => x.ok).length; return true; }
      if (ENTER(code)) { if (!m.armed || m.dt < CLOCK) { m.fault('closed early'); return true; } if (m.sec.some(s => isRed(s) && !s.ok)) { m.fault('unconfirmed seal'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (!m.armed && m.held.S) m.key0 += dt; if (m.armed) m.dt += dt; };
    m.hint = () => { if (!m.armed) return [['Space', m.key0 < KEY + 0.05]]; const s = m.sec.findIndex(x => !x.ok && isRed(x)); if (s >= 0) return [['Digit' + (s + 1), true]];
      return m.dt >= CLOCK ? [['Enter', true]] : []; };
    m.bad = () => { if (!m.armed) return 'Digit1'; const s = m.sec.findIndex(x => !x.ok && !isRed(x)); return s >= 0 ? 'Digit' + (s + 1) : 'Enter'; };
    m.view = () => ({ sec: m.sec.map(s => [+s.red.toFixed(2), +s.call.toFixed(2)]) });
    m.buttons = () => [['Space', 'Turn key (hold)'], ...[1, 2, 3, 4, 5, 6].map(n => ['Digit' + n, `Conf ${n}`]), ['Enter', 'Close drill']];
    m.draw = (c, W, H, P) => {
      m.sec.forEach((s, i) => { const x = 16 + (i % 3) * 124, y = 14 + Math.floor(i / 3) * 50; box(c, x, y, 116, 44, s.ok ? 'rgba(79,208,106,.12)' : COL.panel, null, 5);
        txt(c, `${i + 1} ${s.n}`, x + 8, y + 15, { size: 10, col: COL.pale }); const red = isRed(s);
        lamp(c, x + 100, y + 14, 7, !m.armed ? 'rgba(255,255,255,.12)' : red ? P.bad : P.good, red ? 'square' : 'circle');
        txt(c, m.armed && m.dt >= s.call ? 'lead: "sealed"' : '', x + 8, y + 32, { size: 9, col: COL.lav }); if (s.ok) txt(c, 'CONF', x + 108, y + 38, { size: 9, align: 'right', col: COL.gold }); });
      if (!m.armed) { txt(c, 'LOCKDOWN KEY — hold Space', 16, 130, { size: 12, col: COL.warn }); bar(c, 16, 138, 368, 8, m.key0 / KEY, { col: COL.gold, mark: 1 }); }
      else { txt(c, m.dt >= CLOCK ? 'Drill clock done — Enter logs green doors as failed' : `drill clock ${Math.max(0, CLOCK - m.dt).toFixed(1)} s`, 16, 130, { size: 11, col: m.dt >= CLOCK ? COL.warn : COL.ink });
        bar(c, 16, 138, 368, 8, m.dt / CLOCK, { col: COL.peri }); }
    };
    return m;
  },
});
