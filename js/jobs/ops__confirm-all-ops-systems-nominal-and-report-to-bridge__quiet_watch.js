// Ops: confirm all ops systems nominal and report to the bridge. Lights lie both ways: a green system can still have an open fault line, and
// an amber one may be a latched lamp over a fault that has closed. Open every system's fault line (its digit), tick (Enter) only those whose
// fault line reads CLOSED, then hold Space to read the form back to the bridge until they acknowledge.
import { define, machine, DIG, ENTER, SPACE, ri, rf, pick, shuffle, txt, box, lamp, bar, COL } from './kit.js';

const SYS = ['Power', 'Comms', 'Transport', 'Computer', 'Sensors bus'];
const FAULTS = ['relay 3 chatter logged', 'buffer parity retry', 'EPS tap 4 undervolt', 'core queue backlog', 'carrier drift 0.4 %', 'coolant flow low'];

export default define({
  job: { billet: 'ops', label: 'Confirm all ops systems nominal and report to bridge', type: 'task:quiet_watch' },
  title: 'Fault-line nominal form', dept: 'operations', host: 'console', tool: 'Ops systems status board',
  how: 'Open each system\'s fault line with its number, tick it nominal (Enter) only if the line reads CLOSED, whatever its light says, then hold Space to read the form back until the bridge acknowledges.',
  keys: ['1-5 open fault line', 'Enter tick nominal', 'Space hold: read back'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'open then tick', input: 'digits+enter+space-hold', win: 'every fault line opened, exactly the closed ones ticked nominal, and the form read back to an acknowledgement',
    fail: 'ticking a system unread or over an open fault line, or reading back a form with systems unopened',
    rule: 'Press a system\'s digit and wait for its fault line to load. CLOSED: press Enter to tick it. OPEN: leave it unticked. When every line has been opened, hold Space until the bridge says acknowledged.' },
  rush: 'Read the lights off the board and told the bridge all nominal.',
  captions: { 'ticked unread': 'form clerk queries', 'open fault': 'bridge flags the report', 'incomplete form': 'officer of the watch interrupts' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, load = m.calm ? 0.35 : 0.5, rb = m.calm ? 1.1 : 1.4;
    const n = ri(r, 4, 5), badN = ri(r, 1, 2), bad = new Set(shuffle(r, [...Array(n).keys()]).slice(0, badN));
    m.sys = SYS.slice(0, n).map((name, i) => { const open = bad.has(i); return { name, open, amber: open ? r() < 0.5 : r() < 0.35, fault: open ? pick(r, FAULTS) : '', seen: false, tick: '' }; });
    m.cur = -1; m.ld = 0; m.rb = 0; m.last = -9; m.msg = ''; m.clock = ri(r, 10, 22) * 60 + ri(r, 0, 59); m.wob = rf(r, 0, 1);
    const ok = () => m.sys.every(s => s.seen && (s.open || s.tick));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (down && !m.held.S && !m.sys.every(s => s.seen)) { m.fault('incomplete form'); m.msg = 'Bridge: you have not opened every line'; } m.held.S = down; if (!down) m.rb = 0; return true; }
      if (!down) return !!DIG(code) || ENTER(code); const d = DIG(code);
      if (d && d <= n) { m.cur = d - 1; m.ld = 0; m.last = m.t; return true; }
      if (ENTER(code)) {
        m.last = m.t; const s = m.sys[m.cur];
        if (!s || m.ld < load) { m.fault('ticked unread'); m.msg = 'Open the fault line before you tick'; }
        else if (s.open) { m.fault('open fault'); m.msg = `${s.name}: fault line is still open`; }
        else if (!s.tick) { const c = m.clock + Math.floor(m.t); s.tick = `${String(Math.floor(c / 60) % 24).padStart(2, '0')}${String(c % 60).padStart(2, '0')}`; m.msg = `${s.name} ticked nominal`; }
        return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.cur >= 0) { m.ld += dt; if (m.ld >= load) m.sys[m.cur].seen = true; }
      if (m.held.S && m.sys.every(s => s.seen)) { m.rb += dt; if (m.rb >= rb) { if (ok()) m.win(); else { m.fault('incomplete form'); m.rb = -99; } } }
    };
    m.hint = () => {
      if (m.t - m.last < 0.15) return []; const k = m.sys.findIndex(s => !s.seen || (!s.open && !s.tick));
      if (k < 0) return [['Space', true]]; if (m.cur !== k) return [[`Digit${k + 1}`, true]]; if (m.ld < load + 0.05) return []; return [['Enter', true]];
    };
    m.bad = () => (m.t - m.last < 0.2 ? null : 'Enter');
    m.view = () => ({ sys: m.sys.map(s => [s.name, s.open, s.amber, s.fault]) });
    m.buttons = () => [...m.sys.map((s, i) => [`Digit${i + 1}`, `${i + 1} ${s.name}`]), ['Enter', 'Tick'], ['Space', 'Read back (hold)']];
    m.draw = (c, W, H, P) => {
      m.sys.forEach((s, i) => {
        const y = 8 + i * 24, on = i === m.cur; box(c, 10, y, 226, 20, on ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        lamp(c, 24, y + 10, 7, s.amber ? COL.warn : P.good, s.amber ? 'triangle' : 'circle'); txt(c, `${i + 1}  ${s.name}`, 38, y + 15, { size: 11 });
        txt(c, s.tick ? `✓ ${s.tick}` : s.seen ? (s.open ? 'open' : 'closed') : '·', 228, y + 15, { size: 11, col: s.tick ? P.good : s.open && s.seen ? P.bad : COL.dim, align: 'right' });
      });
      const s = m.sys[m.cur]; box(c, 246, 8, 144, 74, 'rgba(255,255,255,.05)', COL.peri, 8); txt(c, 'FAULT LINE', 254, 24, { size: 10, col: COL.dim });
      if (s) { if (m.ld < load) txt(c, 'reading…', 254, 46, { size: 12, col: COL.warn }); else { txt(c, s.open ? 'OPEN' : 'CLOSED', 254, 46, { size: 14, col: s.open ? P.bad : P.good }); txt(c, s.fault, 254, 66, { size: 10, col: COL.pale }); } }
      txt(c, m.held.S ? 'reading back to the bridge…' : 'handset down', 246, 104, { size: 11, col: m.held.S ? COL.warn : COL.dim });
      bar(c, 246, 112, 144, 8, Math.max(0, m.rb) / rb, { col: COL.peri }); txt(c, m.msg, 14, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
