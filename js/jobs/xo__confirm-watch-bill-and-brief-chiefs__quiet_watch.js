// XO: confirm the watch bill and brief the chiefs. For each post, hold the comm open to its chief until they answer: an "aye" confirms
// the named officer, a correction changes the name and must be called again. Some chiefs are slow to answer; dropping the call is not a
// yes. Confirming a post without an aye on the line, or hogging the net after the answer, is a fault.
import { define, machine, ARROW, SPACE, ENTER, shuffle, rf, pick, txt, box, bar, COL } from './kit.js';

const POSTS = [['Conn', 'Flight'], ['Engineering watch', 'Engineering'], ['Sickbay duty', 'Medical'], ['Security watch', 'Security'], ['Ops console', 'Operations']];
const NAMES = ['Lt Haas', 'Ens Moreau', 'Lt Adeyemi', 'Ens Kowal', 'Lt Sato', 'CPO Dunne', 'Ens Rask', 'Lt Neri', 'Ens Lund', 'Lt Oyelaran'];
export default define({
  job: { billet: 'xo', label: 'Confirm watch bill and brief chiefs', type: 'task:quiet_watch' },
  title: 'Watch bill hold-the-line confirm', dept: 'command', host: 'console', tool: 'Bridge watch bill and chief comms',
  how: 'Pick a post, hold Space to keep the comm open until its chief answers, let go, and confirm with Enter only once the chief has said aye to the name on the bill.',
  keys: ['↑ ↓ post', 'Space hold: comm open', 'Enter confirm'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'hold the line', input: 'arrows+space-hold+enter', win: 'every post on the bill confirmed only after its chief said aye to the name, corrections called back',
    fail: 'confirming a post on silence or on a corrected name, or tying up the net after the chief has answered',
    rule: 'Select a post, hold Space: the line stays open until the chief answers (some take seconds). Release once they speak. AYE: Enter confirms. CORRECTION: the bill changes, call again for an aye.' },
  rush: 'Read the bill out on the all-call and took no answers.',
  captions: { 'silence taken as yes': 'dead air', 'net tied up': 'comm squeal', reply: 'chief on comm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, NAMES), corr = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, 1 + Math.floor(r() * 2))), grace = m.calm ? 2.2 : 1.5;
    m.rows = POSTS.map(([post, chief], i) => ({ post, chief, name: nm[i], fix: corr.has(i) ? nm[5 + i] : null, delay: r() < 0.35 ? rf(r, 1.8, 2.6) : rf(r, 0.5, 1.1), st: 'open', call: -1, got: -1 }));
    m.sel = 0; m.rounds = 5; m.round = 0;
    const row = () => m.rows[m.sel];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), x = row();
      if (SPACE(code)) { if (down && x.call < 0 && x.st !== 'ok') { x.call = m.t; x.got = -1; } if (!down) x.call = -1; return true; }
      if (!down) return !!a || ENTER(code); if (x.call >= 0) return !!a || ENTER(code);
      if (a === 'U' || a === 'D') { m.sel = (m.sel + (a === 'D' ? 1 : 4)) % 5; return true; }
      if (ENTER(code)) { if (x.st === 'ok') return true; if (x.st !== 'aye') { m.fault('silence taken as yes'); return true; } x.st = 'ok'; m.round++; if (m.rows.every(y => y.st === 'ok')) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const x = row(); if (x.call < 0) return;
      if (x.got < 0 && m.t - x.call >= x.delay) { x.got = m.t; m.ev('reply', { i: m.sel }); if (x.fix) { x.name = x.fix; x.fix = null; x.st = 'corrected'; } else x.st = 'aye'; }
      if (x.got >= 0 && m.t - x.got > grace) { m.fault('net tied up'); x.call = -1; }
    };
    m.hint = () => { const i = m.rows.findIndex(y => y.st !== 'ok'); if (i < 0) return []; const x = m.rows[i]; if (x.call >= 0) return [['Space', x.got < 0]]; if (i !== m.sel) return [['ArrowDown', true]]; return x.st === 'aye' ? [['Enter', true]] : [['Space', true]]; };
    m.bad = () => { const x = row(); return x.st === 'ok' ? 'ArrowDown' : x.call >= 0 ? ['Space', false] : 'Enter'; };
    m.view = () => ({ rows: m.rows.map(x => [x.name, x.fix, +x.delay.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Hold comm'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      m.rows.forEach((x, i) => {
        const y = 8 + i * 27, s = i === m.sel; box(c, 8, y, W - 16, 24, s ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', s ? COL.orange : null, 8);
        txt(c, x.post, 16, y + 16, { size: 11, col: COL.gold }); txt(c, x.name, 140, y + 16, { size: 11 });
        const say = x.call >= 0 && x.got < 0 ? 'line open…' : x.st === 'aye' ? `${x.chief}: "Aye, ${x.name}."` : x.st === 'corrected' ? `${x.chief}: "No — ${x.name}." call again` : x.st === 'ok' ? '✓ confirmed' : '— not confirmed —';
        txt(c, say, 236, y + 16, { size: 10, col: x.st === 'ok' ? P.good : x.st === 'corrected' ? COL.warn : COL.pale });
        if (x.call >= 0 && x.got < 0) bar(c, 236, y + 19, 150, 3, (m.t - x.call) / 2.6, { col: COL.peri });
      });
      txt(c, 'Hold Space to keep the line open · Enter only on an aye', 12, H - 6, { size: 10, col: COL.dim });
    };
    return m;
  },
});
