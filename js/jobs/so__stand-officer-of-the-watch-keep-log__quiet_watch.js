// Second officer: stand officer of the watch and keep the log. The watch bill strip shows every station's comm light, but a lit light does not
// prove anyone is sitting there. Pan the chair's view along the bridge (hold ← / →) until a station is in front of you, then log it: 1 manned,
// 2 empty (an empty key post also calls the XO). Logging a station you are not looking at, or logging it wrong, is a fault. The entry closes
// when every station is logged.
import { define, machine, ARROW, DIG, shuffle, ri, txt, box, lamp, COL } from './kit.js';

const ST = ['Helm', 'Ops', 'Tactical', 'Science', 'Comms', 'Engineering', 'Environment'];
const KEY = new Set(['Helm', 'Tactical', 'Ops']);
const CREW = ['Ens Mbeki', 'Lt Sorensen', 'Lt Ruiz', 'Ens Park', 'Lt Duval', 'Ens Moss', 'CPO Lin'];

export default define({
  job: { billet: 'so', label: 'Stand officer of the watch; keep log', type: 'task:quiet_watch' },
  title: 'Watch log seat check', dept: 'command', host: 'console', tool: 'Command chair, watch bill and log recorder',
  how: 'Pan your view along the bridge with ← / →; when a station is in front of you, log it 1 manned or 2 empty. Every light is lit, so only the seat tells you.',
  keys: ['hold ← → pan the bridge', '1 manned', '2 empty post'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'pan and log', input: 'arrows-hold+digits', win: 'every bridge station logged manned or empty from a direct look at its seat, never from its comm light',
    fail: 'logging a station from its comm light without looking, or logging an empty seat as manned',
    rule: 'Hold ← or → to pan the view. A station centred in view shows its seat: press 1 if someone sits there, 2 if the chair is empty. Digits do nothing useful off-centre.' },
  rush: 'Wrote down every station with a lit comm light as manned.',
  captions: { 'logged unseen': 'recorder beeps', 'wrong entry': 'log correction tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 6, win = m.calm ? 0.34 : 0.24, crew = shuffle(r, CREW);
    const names = shuffle(r, ST).slice(0, n), empty = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 1, 2)));
    m.st = names.map((s, i) => ({ s, empty: empty.has(i), who: crew[i], log: 0 }));
    m.cam = ri(r, 0, n - 1); m.speed = 2.6; m.rounds = n; m.round = 0;
    const centre = () => { const i = Math.round(m.cam); return Math.abs(m.cam - i) <= win ? i : -1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      const d = DIG(code); if (!down || (d !== 1 && d !== 2)) return a === 'U' || a === 'D';
      const i = centre(); if (i < 0) { m.fault('logged unseen'); return true; } const s = m.st[i]; if (s.log) return true;
      if ((d === 2) !== s.empty) { m.fault('wrong entry'); return true; }
      s.log = d; m.round++; if (d === 2 && KEY.has(s.s)) m.ev('xo', { st: s.s }); if (m.st.every(x => x.log)) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const v = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.cam = Math.max(0, Math.min(n - 1, m.cam + v * m.speed * dt)); };
    m.hint = () => {
      const left = m.st.map((s, i) => i).filter(i => !m.st[i].log); if (!left.length) return [];
      const tgt = left.reduce((b, i) => Math.abs(i - m.cam) < Math.abs(b - m.cam) ? i : b, left[0]);
      if (Math.abs(m.cam - tgt) > 0.12) return [[m.cam < tgt ? 'ArrowRight' : 'ArrowLeft', true], [m.cam < tgt ? 'ArrowLeft' : 'ArrowRight', false]];
      return [['ArrowLeft', false], ['ArrowRight', false], [m.st[tgt].empty ? 'Digit2' : 'Digit1', true]];
    };
    m.bad = () => { const i = centre(); if (i < 0) return 'Digit1'; const s = m.st[i]; return s.log ? ['ArrowRight', true] : s.empty ? 'Digit1' : 'Digit2'; };
    m.view = () => ({ st: m.st.map(s => s.s + (s.empty ? ':empty' : '')) });
    m.buttons = () => [['ArrowLeft', '◀ pan'], ['ArrowRight', 'pan ▶'], ['Digit1', '1 Manned'], ['Digit2', '2 Empty']];
    m.draw = (c, W, H, P) => {
      txt(c, 'WATCH BILL', 10, 15, { size: 9, col: COL.gold });
      m.st.forEach((s, i) => { const x = 80 + i * 52; lamp(c, x, 11, 5, P.good, 'circle'); txt(c, s.s.slice(0, 5) + (s.log ? (s.log === 1 ? ' ✓' : ' ∅') : ''), x + 8, 15, { size: 8, col: s.log ? COL.pale : COL.dim }); });
      const ci = centre(); box(c, W / 2 - 62, 26, 124, 110, null, ci >= 0 ? COL.orange : 'rgba(255,255,255,.15)', 10);
      m.st.forEach((s, i) => {
        const x = W / 2 + (i - m.cam) * 140; if (x < -60 || x > W + 60) return;
        txt(c, s.s, x, 44, { size: 11, align: 'center', col: COL.gold }); lamp(c, x + 44, 40, 5, P.good, 'circle');
        box(c, x - 40, 70, 80, 14, '#2b2a44', null, 4); box(c, x - 30, 84, 60, 36, '#3a2f56', null, 6);
        if (!s.empty) { c.fillStyle = COL.pale; c.beginPath(); c.arc(x, 62, 9, 0, 6.283); c.fill(); box(c, x - 16, 72, 32, 36, COL.peri, null, 8); txt(c, s.who, x, 132, { size: 9, align: 'center', col: COL.ink }); }
        else txt(c, '— chair empty —', x, 132, { size: 9, align: 'center', col: COL.warn });
      });
      txt(c, ci >= 0 ? `In view: ${m.st[ci].s}` : 'Panning…', 10, 160, { size: 11, col: COL.ink }); txt(c, `${m.round} / ${m.rounds} logged`, W - 10, 160, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
