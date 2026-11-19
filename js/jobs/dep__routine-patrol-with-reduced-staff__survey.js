// Deputy security chief, survey mission: patrol with half the usual staff. From the junction four branches run off (arrows pick one). Every
// branch nobody has looked down for a while grows riskier; once a meter passes the warning line its corner light flashes, and if it reaches
// the top a gap opens there. Walking to a branch takes a moment and sweeps its corner lights, resetting it. You cannot be everywhere: keep
// choosing the riskiest branch until the shift's sweep is over and the route card goes back.
import { define, machine, ARROW, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const B = [['U', 'Fore branch', 'ArrowUp'], ['L', 'Port stores', 'ArrowLeft'], ['R', 'Starboard lift', 'ArrowRight'], ['D', 'Aft hatchway', 'ArrowDown']];
export default define({
  job: { billet: 'dep', label: 'Routine patrol with reduced staff', type: 'task:survey' },
  title: 'Thin-patrol branch triage', dept: 'security', host: 'console', tool: 'Junction sight lines and route card',
  how: 'Each branch off the junction gets riskier while unwatched. Press its arrow to walk down and sweep it. Keep every meter below the top until the shift ends.',
  keys: ['Arrows walk down that branch and sweep it'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'triage branches', input: 'arrows', win: 'the whole reduced-staff shift covered with no branch left unchecked long enough to open a gap',
    fail: 'staying on one branch while another unwatched branch climbs to the top',
    rule: 'Four risk meters climb at their own pace. An arrow walks to that branch (a short trip) and sweeps it back to zero. Head for whichever is highest; a meter at the top is a fault.' },
  rush: 'Walked the short loop by the bay and radioed the rest as covered.',
  captions: { gap: 'warning light flashes', sweep: 'footsteps down the branch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.7 : 1, trip = 0.55;
    m.br = shuffle(r, B).map(([d, n, code]) => ({ d, n, code, v: rf(r, 0, 0.35), rate: rf(r, 1 / 9, 1 / 5.5) * k }));
    m.shift = 20; m.at = -1; m.go = 0; m.rounds = 0; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a) return false; if (!down || m.go > 0) return true;
      m.at = m.br.findIndex(b => b.d === a); m.go = trip; m.ev('walk', { b: m.br[m.at].n }); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      for (const [i, b] of m.br.entries()) { if (i === m.at && m.go <= 0) continue; b.v += b.rate * dt; if (b.v >= 1) { m.fault('gap'); b.v = 0.3; } }
      if (m.go > 0) { m.go -= dt; if (m.go <= 0) { m.br[m.at].v = 0; m.round++; m.ev('sweep', { b: m.br[m.at].n }); } }
      if (m.t >= m.shift && m.state === 'play') m.win();
    };
    m.hint = () => { if (m.go > 0) return []; let j = 0; m.br.forEach((b, i) => { if (b.v > m.br[j].v) j = i; }); return m.br[j].v > 0.4 ? [[m.br[j].code, true]] : []; };
    m.bad = () => (m.go > 0 ? null : 'ArrowUp');
    m.view = () => ({ br: m.br.map(b => b.d + b.rate.toFixed(3) + b.v.toFixed(2)) });
    m.buttons = () => B.map(([d, n, code]) => [code, { U: '▲', D: '▼', L: '◀', R: '▶' }[d] + ' ' + n.split(' ')[0]]);
    m.draw = (c, W, H, P) => {
      const pos = { U: [150, 8], L: [14, 62], R: [266, 62], D: [150, 116] }, cx = 196, cy = 84;
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, 20); c.lineTo(cx, 150); c.moveTo(60, cy); c.lineTo(330, cy); c.stroke();
      m.br.forEach((b, i) => { const [x, y] = pos[b.d], warn = b.v > 0.75, here = i === m.at;
        box(c, x, y, 120, 40, COL.panel, here ? COL.gold : warn ? P.bad : 'rgba(255,255,255,.15)', 6);
        txt(c, b.n, x + 8, y + 15, { size: 11, col: warn ? P.bad : COL.ink }); bar(c, x + 8, y + 22, 92, 9, b.v, { col: warn ? P.bad : COL.peri, mark: 0.75 });
        if (warn) lamp(c, x + 110, y + 26, 6, P.bad, 'triangle'); });
      lamp(c, cx, cy, 7, m.go > 0 ? COL.gold : COL.ink, 'circle');
      txt(c, m.go > 0 ? 'walking…' : 'at junction', 14, 160, { size: 10, col: COL.dim });
      txt(c, `Shift sweep ${Math.min(100, Math.round(m.t / m.shift * 100))} %`, 386, 160, { size: 11, align: 'right', col: COL.pale });
    };
    return m;
  },
});
