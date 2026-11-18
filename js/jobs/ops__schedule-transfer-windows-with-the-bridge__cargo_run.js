// Ops: schedule transfer windows with the bridge. Pencil each cargo transfer onto a dock window (its digit): the window's conflict marker only
// shows once it is pencilled, so check it for a medical transfer. The window must also be big enough for the load, and an urgent load must go
// before 1400. Then hold Space on the handset until the bridge officer reads the window back: hanging up early or booking a bad window is a fault.
import { define, machine, DIG, SPACE, ri, rf, pick, shuffle, txt, box, COL } from './kit.js';

const SZ = ['S', 'M', 'L'], LOADS = ['relief pallets', 'water bladders', 'generator skid', 'medical crates', 'shelter kits', 'ration crates'];

export default define({
  job: { billet: 'ops', label: 'Schedule transfer windows with the bridge', type: 'task:cargo_run' },
  title: 'Dock window booking by handset', dept: 'operations', host: 'console', tool: 'Transfer window grid and handset',
  how: 'Pencil each transfer onto a window with its number, check the conflict marker that appears for a medical transfer, make sure the size fits and urgent loads go before 1400, then hold Space until the bridge reads the window back.',
  keys: ['1-6 pencil a window', 'Space hold: confirm with the bridge'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'pencil and confirm', input: 'digits+space-hold', win: 'three cargo transfers on windows that fit their size and priority, none on a medical window, each read back by the bridge',
    fail: 'booking onto a medical window, a window too small or too late, or hanging up before the bridge reads the window back',
    rule: 'A digit pencils a window and reveals its conflict marker. Valid: no MED marker, capacity at least the load size, and before 1400 if URGENT. Hold Space until the bridge says the window number; let go after.' },
  rush: 'Booked the first free-looking windows and told the bridge afterwards.',
  captions: { 'medical clash': 'sickbay objects on the line', 'too small': 'dock master queries', 'too late': 'bridge queries the urgency', 'hung up': 'handset clicks' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 6;
    m.win6 = Array.from({ length: n }, (_, i) => ({ time: 1000 + i * 100 + ri(r, 0, 3) * 15, cap: ri(r, 0, 2), med: false, used: false }));
    shuffle(r, [...Array(n).keys()]).slice(0, 2).forEach(i => { m.win6[i].med = true; }); m.win6[ri(r, 0, 2)].med = false;
    const open = m.win6.map((w, i) => i).filter(i => !m.win6[i].med), picks = shuffle(r, open).slice(0, 3);
    m.trs = picks.map(i => { const w = m.win6[i]; return { load: pick(r, LOADS), size: ri(r, 0, w.cap), urgent: w.time < 1400 && r() < 0.5, w: i }; });
    m.k = 0; m.sel = -1; m.call = 0; m.reply = rf(r, 0.6, 1.2); m.last = -9; m.msg = ''; m.rounds = 3; m.round = 0;
    const T = () => m.trs[m.k], why = (i) => { const w = m.win6[i], t = T(); return w.used ? 'too small' : w.med ? 'medical clash' : w.cap < t.size ? 'too small' : t.urgent && w.time >= 1400 ? 'too late' : null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { const was = m.held.S; m.held.S = down; if (was && !down) { if (m.call > 0 && m.call < m.reply) { m.fault('hung up'); m.msg = 'You hung up before the read-back'; } m.call = 0; } return true; }
      const d = DIG(code); if (!d || d > n) return false; if (!down) return true; m.sel = d - 1; m.last = m.t; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (!m.held.S || m.sel < 0 || m.call < 0) return; m.call += dt;
      if (m.call >= m.reply) {
        const w = why(m.sel); m.call = -1;
        if (w) { m.fault(w); m.msg = `Bridge: cannot take window ${m.sel + 1} (${w})`; }
        else { m.win6[m.sel].used = true; m.msg = `Bridge: confirmed window ${m.sel + 1} at ${m.win6[m.sel].time}`; m.k++; m.round++; m.sel = -1; m.reply = rf(m.rnd, 0.6, 1.2); if (m.k >= m.trs.length) m.win(); }
      }
    };
    m.hint = () => { const t = T(); if (!t) return []; if (m.call < 0 || (m.held.S && m.sel !== t.w)) return [['Space', false]]; if (m.sel !== t.w) return m.t - m.last < 0.15 ? [] : [[`Digit${t.w + 1}`, true]]; return [['Space', true]]; };
    m.bad = () => { if (m.sel < 0) return `Digit${m.win6.findIndex(w => w.med) + 1}`; return m.held.S ? (m.call > 0.2 ? ['Space', false] : null) : 'Space'; };
    m.view = () => ({ w: m.win6.map(w => [w.time, w.cap, w.med]), trs: m.trs.map(t => [t.size, t.urgent, t.w]) });
    m.buttons = () => [...m.win6.map((w, i) => [`Digit${i + 1}`, `${i + 1}`]), ['Space', 'Handset (hold)']];
    m.draw = (c, W, H, P) => {
      const t = T(); if (!t) return; txt(c, `TRANSFER ${m.k + 1}/3 · ${t.load} · size ${SZ[t.size]}${t.urgent ? ' · URGENT (before 1400)' : ''}`, 12, 20, { size: 12, col: COL.gold });
      m.win6.forEach((w, i) => {
        const x = 10 + i * 64, on = i === m.sel; box(c, x, 32, 58, 70, w.used ? 'rgba(255,255,255,.02)' : on ? 'rgba(240,147,58,.22)' : 'rgba(255,255,255,.06)', on ? COL.orange : null, 6);
        txt(c, `${i + 1}`, x + 8, 48, { size: 12, col: COL.dim }); txt(c, `${w.time}`, x + 29, 66, { size: 12, align: 'center' }); txt(c, `cap ${SZ[w.cap]}`, x + 29, 82, { size: 10, align: 'center', col: COL.pale });
        if (w.used) txt(c, 'booked', x + 29, 97, { size: 10, align: 'center', col: COL.dim }); else if (on) txt(c, w.med ? '✚ MED' : '○ clear', x + 29, 97, { size: 10, align: 'center', col: w.med ? P.bad : P.good });
      });
      txt(c, m.call < 0 ? 'release the handset' : m.held.S ? 'on the handset… waiting for the read-back' : 'handset down', 12, 124, { size: 11, col: m.held.S ? COL.warn : COL.dim });
      txt(c, m.msg, 12, H - 12, { size: 11, col: COL.pale });
    };
    return m;
  },
});
