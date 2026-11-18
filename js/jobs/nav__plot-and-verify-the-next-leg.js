// Navigator: plot and verify the next leg. Walk the dividers along the leg one span at a time (Space) and read the distance off (Enter) when
// less than a span is left; overrunning the waypoint means starting the walk again. The leg's ETA then sits beside the helm's: send it (Enter)
// when they agree within five minutes, flag it back to the helm (Space) when they do not.
import { define, machine, SPACE, ENTER, ri, rf, txt, box, bar, lamp, COL } from './kit.js';

const WP = ['Kessin Mark', 'Oro Buoy', 'Tarsa Gate', 'Hollis Reach', 'Veil Point', 'Corvan Light', 'Dass Marker'];
export default define({
  job: { billet: 'nav', label: 'Plot and verify the next leg', type: 'loop' },
  title: 'Divider walk and ETA cross-check', dept: 'flight', host: 'console', tool: 'Chart, dividers and flight card',
  how: 'Walk the dividers down the leg (Space) and read off (Enter) once less than a span is left; then send the course (Enter) or flag a helm ETA more than 5 min off (Space).',
  keys: ['Space step the dividers / flag', 'Enter read off / send'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'walk the dividers', input: 'space+enter', win: 'three legs measured span by span without overrunning, and each course sent or its ETA flagged by the five-minute rule',
    fail: 'stepping past the waypoint, reading off with a whole span still left, or sending a course whose ETA disagrees with the helm',
    rule: 'Each Space moves the dividers one 10 nm span. When less than a span is left, Enter reads the leg. Then compare ETAs: within 5 min, Enter sends; more, Space flags it.' },
  rush: 'Eyeballed the leg length and sent it to the helm without checking the ETA.',
  captions: { overran: 'dividers scrape', 'short read': 'pencil tap', 'untrusted ETA': 'helm query chirp', 'needless flag': 'helm sighs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, S = 10; m.rounds = 3; m.round = 0;
    m.newLeg = () => { const v = ri(r, 4, 9) * 5, D = ri(r, 3, 7) * S + ri(r, 2, 8), mine = Math.round(D / v * 60), off = r() < 0.45; m.leg = { wp: WP[ri(r, 0, WP.length - 1)], D, v, mine, helm: mine + (off ? (r() < 0.5 ? -1 : 1) * ri(r, 7, 14) : ri(r, -3, 3)), off, pos: 0, phase: 0 }; };
    m.newLeg();
    const done = () => { m.round++; if (m.round >= 3) m.win(); else m.newLeg(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const L = m.leg, sp = SPACE(code), en = ENTER(code); if (!sp && !en) return false;
      if (L.phase === 0) {
        if (sp) { L.pos += S; if (L.pos > L.D) { m.fault('overran'); L.pos = 0; } return true; }
        if (L.D - L.pos >= S) { m.fault('short read'); L.pos = 0; return true; } L.phase = 1; return true;
      }
      if (en && L.off) { m.fault('untrusted ETA'); return true; }
      if (sp && !L.off) { m.fault('needless flag'); return true; }
      m.ev(sp ? 'flag' : 'send'); done(); return true;
    };
    m.hint = () => { const L = m.leg; if (L.phase === 0) return [[L.D - L.pos >= S ? 'Space' : 'Enter', true]]; return [[L.off ? 'Space' : 'Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ D: m.leg.D, v: m.leg.v, helm: m.leg.helm });
    m.buttons = () => [['Space', 'Step / Flag'], ['Enter', 'Read / Send']];
    m.draw = (c, W, H, P) => {
      const L = m.leg, x0 = 20, x1 = 380, k = (x1 - x0) / 80, y = 52;
      txt(c, `LEG ${m.round + 1}/3 → ${L.wp}`, x0, 20, { size: 12, col: COL.peri });
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + L.D * k, y); c.stroke();
      lamp(c, x0 + L.D * k, y, 6, COL.pale, 'diamond');
      for (let p = 0; p <= L.pos; p += S) { c.fillStyle = COL.ink; c.fillRect(x0 + p * k - 1, y - 9, 2, 18); }
      if (L.phase === 0) { c.strokeStyle = COL.orange; c.beginPath(); c.moveTo(x0 + L.pos * k, y + 10); c.lineTo(x0 + (L.pos + S) * k, y + 10); c.stroke(); txt(c, 'next span', x0 + L.pos * k, y + 24, { size: 9, col: COL.orange }); }
      for (let p = 0; p <= 80; p += 10) txt(c, String(p), x0 + p * k, 96, { size: 8, col: COL.dim, align: 'center' });
      bar(c, x0, 100, x1 - x0, 5, 0, {}); txt(c, `stepped ${L.pos} nm · span 10 nm`, x0, 122, { size: 11, col: COL.pale });
      if (L.phase === 1) {
        box(c, 210, 112, 172, 50, 'rgba(0,0,0,.35)', COL.peri, 4);
        txt(c, `${L.D} nm @ ${L.v} kn: ETA ${L.mine} min`, 218, 130, { size: 11 });
        const diff = Math.abs(L.helm - L.mine); txt(c, `helm ETA ${L.helm} min (Δ ${diff})`, 218, 150, { size: 11, col: diff > 5 ? P.bad : P.good });
      } else txt(c, `cruise ${L.v} kn (flight card)`, x0, 144, { size: 11, col: COL.dim });
    };
    return m;
  },
});
