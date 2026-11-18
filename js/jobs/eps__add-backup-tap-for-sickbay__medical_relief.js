// EPS tech: add a backup tap for sickbay (medical relief). In the crowded junction box, push each jumper lead into the socket of its own
// colour (aim, hold E); pushing a lead into the wrong socket reverses the polarity. Walk the lead along the cable tray (turn the view) and
// clip it at each hook as it comes level (tap E); a run that passes a hook unclipped sags loose. Finally cut the main feed (tap E) and watch
// the backup lamp hold.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const POS = [0.33, 0, -0.33], SOCK = ['red (+)', 'black (−)', 'green (earth)'];
export default define({
  job: { billet: 'eps', label: 'Add backup tap for sickbay', type: 'task:medical_relief' },
  title: 'Polarity leads and tray clipping', dept: 'engineering', host: 'room', item: 'toolbag', siteName: 'Step', verb: 'Wire',
  how: 'In the box, aim at the socket matching each lead\'s colour and hold E to push it home. Along the tray, turn the view to run the lead and tap E at each hook. Then tap E to cut the main feed.',
  keys: ['view + E hold: seat a lead', 'turn + E tap: clip at a hook', 'E tap: cut main feed'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'seat and clip', input: 'e-hold+look+e-tap+swing', win: 'both leads seated in their own colour sockets, the run clipped at every tray hook and the backup lamp holding on main cut',
    fail: 'pushing a lead into the wrong colour socket, clipping between hooks, or running past a hook unclipped',
    rule: 'Box: three sockets left, middle, right with their colours on the panel; aim at the one matching the lead and hold E. Tray: turning the view feeds the lead along; tap E while the panel says AT HOOK. Then tap E to cut main.' },
  rush: 'Twisted the leads on in whatever order they reached and taped the run to the tray.',
  captions: { reversed: 'spark snap', 'missed hook': 'clip skitters', sagging: 'lead slumps' },
  says: { reversed: 'Wrong socket: that would reverse the polarity. Match the lead colour to the socket.', 'missed hook': 'No hook there: clip only when the lead is level with one.', sagging: 'You ran past a hook unclipped and the lead sags. Back up and clip it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sickbay junction box', prop: 'nursestation' }, { name: 'Cable tray', prop: 'biobed' }, { name: 'Main feed cut-off', prop: 'console' }]), r = m.rnd;
    const seatT = 0.7, wrongT = 0.25, win = m.calm ? 0.06 : 0.045;
    m.sock = shuffle(r, [0, 1, 2]); m.leads = shuffle(r, [0, 1]); m.lead = 0; m.sh = 0; m.wr = 0;
    m.hooks = [0.2, 0.45, 0.7, 0.92].map(h => ({ x: h + rf(r, -0.04, 0.04), clip: false })); m.pos = 0; m.cut = -1;
    const slotOf = (colour) => m.sock.indexOf(colour);
    const hookAt = () => m.hooks.find(h => !h.clip && Math.abs(m.pos - h.x) < win);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) {
        const aim = POS.findIndex(p => Math.abs((inp.look || 0) - p) < 0.1), want = slotOf(m.leads[m.lead]);
        if (inp.hold && aim >= 0 && aim !== want) { m.wr += dt; if (m.wr >= wrongT) { m.fault('reversed'); m.wr = 0; } } else m.wr = 0;
        if (inp.hold && aim === want) { m.sh += dt; if (m.sh >= seatT) { m.lead++; m.sh = 0; if (m.lead >= 2) { m.finish(0); return; } } } else m.sh = 0;
        s.prog = (m.lead + m.sh / seatT) / 2 * 0.95; return;
      }
      if (i === 1) {
        if (inp.press) { const h = hookAt(); if (h) { h.clip = true; if (m.hooks.every(k => k.clip)) { m.finish(1); return; } } else m.fault('missed hook'); }
        else if (!inp.hold) m.pos = Math.min(1, m.pos + 0.4 * Math.min(1.5, Math.abs(inp.swing || 0)) * dt);
        const pass = m.hooks.find(h => !h.clip && m.pos > h.x + win); if (pass) { m.fault('sagging'); m.pos = pass.x - 0.12; }
        s.prog = m.hooks.filter(h => h.clip).length / 4 * 0.95; return;
      }
      if (m.cut < 0) { if (inp.press) m.cut = m.t; s.prog = 0; return; }
      s.prog = clamp((m.t - m.cut) / 1.2) * 0.95; if (m.t - m.cut >= 1.2) m.finish(2);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 };
      if (i === 0) return { at: 0, hold: true, look: POS[slotOf(m.leads[Math.min(1, m.lead)])] };
      if (i === 1) { if (hookAt() && f % 2 === 0) return { at: 1, hold: true, press: true }; return { at: 1, hold: false, swing: hookAt() ? 0 : 1.0 }; }
      const p = m.cut < 0 && f % 2 === 0; return { at: 2, hold: p, press: p };
    };
    m.bad = (f = 0) => m.next === 0 ? { at: 0, hold: true, look: POS[(slotOf(m.leads[m.lead]) + 1) % 3] } : { at: m.next, hold: f % 6 === 0, press: f % 6 === 0, swing: 1 };
    m.view = () => ({ sock: m.sock, leads: m.leads, hooks: m.hooks.map(h => +h.x.toFixed(3)) });
    m.panel = (i) => {
      if (i === 0) return { label: `Lead: ${SOCK[m.leads[Math.min(1, m.lead)]]}`, value: `sockets L ${SOCK[m.sock[0]].split(' ')[0]} · M ${SOCK[m.sock[1]].split(' ')[0]} · R ${SOCK[m.sock[2]].split(' ')[0]}`, bar: m.sh / seatT };
      if (i === 1) return { label: hookAt() ? 'AT HOOK: clip' : 'Running the lead', value: `${m.hooks.filter(h => h.clip).length} / 4 clipped`, bar: m.pos };
      return { label: m.cut < 0 ? 'Main feed ON' : 'Main cut: backup lamp', value: m.cut < 0 ? 'tap to cut' : 'HOLDING', bar: m.cut < 0 ? 0 : clamp((m.t - m.cut) / 1.2) };
    };
    m.prompt = (i) => i === 0 ? 'Aim at the socket matching the lead colour and hold [E] to push it home' : i === 1 ? (hookAt() ? 'Level with a hook: tap [E] to clip' : 'Turn your view to feed the lead along the tray') : 'Tap [E] to cut the main feed and watch the backup lamp';
    return m;
  },
});
