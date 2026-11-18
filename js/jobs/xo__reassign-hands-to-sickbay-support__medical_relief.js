// XO: reassign hands to sickbay support. The crew list scrolls past the desk's pick bracket one officer at a time. Pull an officer to a
// sickbay support post only if they hold no critical post this shift AND carry a first-aid or orderly rating. Pulling someone off a critical
// post, or someone without the rating, is refused as a fault. Fill all four support posts before the relief team arrives.
import { define, machine, SPACE, shuffle, pick, txt, box, lamp, COL } from './kit.js';

const NAMES = ['Ens Abara', 'Lt Bex', 'CPO Corrin', 'Ens Dahl', 'Lt Esposito', 'Ens Faro', 'Lt Gill', 'CPO Hale', 'Ens Ito', 'Lt Jovan', 'Ens Kade', 'Lt Lomax', 'Ens Mbeki', 'Lt Nash', 'CPO Orr', 'Ens Pryce', 'Lt Quill', 'Ens Rhee'];
const CRIT = ['Warp core watch', 'Conn', 'Tactical', 'Transporter chief'], LIGHT = ['Off watch', 'Light duty', 'Stores tally', 'Training'];
const RATE = ['First aid', 'Orderly'], OTHER = ['Cargo', 'Sensors', 'Hull welding', 'Botany'];
export default define({
  job: { billet: 'xo', label: 'Reassign hands to sickbay support', type: 'task:medical_relief' },
  title: 'Crew list pick for sickbay', dept: 'command', host: 'console', tool: 'Ready room crew list and duty roster',
  how: 'Officers scroll through the pick bracket; press Space to pull one to sickbay only if they are off any critical post and hold a first-aid or orderly rating.',
  keys: ['Space pull to sickbay'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'pluck from list', input: 'space', win: 'all four sickbay support posts filled with free first-aid or orderly rated hands pulled from the passing crew list',
    fail: 'pulling an officer off a critical post, or one with no first-aid or orderly rating',
    rule: 'Each card passes the bracket for under a second. Space while it is in the bracket pulls that officer: they need a non-critical post (no triangle) and a first-aid or orderly rating (cross).' },
  rush: 'Sent the first four names on the list to sickbay.',
  captions: { 'critical post stripped': 'bridge protests', 'no rating': 'chief medical sighs', pulled: 'roster chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 1.25 : 1, win = 0.75;
    m.list = shuffle(r, NAMES).map((name, i) => { const good = i % 3 === 1 || (i % 3 === 2 && r() < 0.3), crit = !good && r() < 0.55, rated = good || (crit && r() < 0.6);
      return { name, post: crit ? pick(r, CRIT) : pick(r, LIGHT), crit, rate: rated ? pick(r, RATE) : pick(r, OTHER), rated, got: false }; });
    m.need = 4; m.filled = 0; m.rounds = 4; m.round = 0;
    const atBracket = () => { const p = m.t / gap - 0.6, k = Math.floor(p); return k >= 0 && p - k < win ? m.list[k % m.list.length] : null; };
    const ok = (x) => !x.crit && x.rated;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const x = atBracket(); if (!x || x.got) return true;
      if (x.crit) { m.fault('critical post stripped'); x.got = true; return true; } if (!x.rated) { m.fault('no rating'); x.got = true; return true; }
      x.got = true; m.filled++; m.round++; m.ev('pulled', { name: x.name }); if (m.filled >= m.need) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = atBracket(); return x && !x.got && ok(x) ? [['Space', true]] : []; };
    m.bad = () => { const x = atBracket(); return x && !x.got && !ok(x) ? 'Space' : null; };
    m.view = () => ({ list: m.list.map(x => [x.name, x.crit, x.rated]) });
    m.buttons = () => [['Space', 'Pull to sickbay']];
    m.draw = (c, W, H, P) => {
      const p = m.t / gap - 0.6, bx = 150, step = 120;
      box(c, bx - 6, 30, 112, 92, null, COL.orange, 8); txt(c, 'PICK', bx + 50, 26, { size: 10, col: COL.orange, align: 'center' });
      for (let k = Math.floor(p) - 1; k <= Math.floor(p) + 3; k++) { if (k < 0) continue; const x = m.list[k % m.list.length], cx = bx + (k - p) * step; if (cx < -100 || cx > W) continue;
        box(c, cx, 36, 100, 80, x.got ? 'rgba(79,208,106,.15)' : 'rgba(255,255,255,.06)', null, 8); txt(c, x.name, cx + 6, 52, { size: 11, col: COL.gold });
        lamp(c, cx + 12, 70, 6, x.crit ? P.bad : P.good, x.crit ? 'triangle' : 'circle'); txt(c, x.post, cx + 22, 74, { size: 9 });
        txt(c, (x.rated ? '✚ ' : '· ') + x.rate, cx + 6, 94, { size: 10, col: x.rated ? P.good : COL.dim }); if (x.got) txt(c, 'pulled', cx + 6, 110, { size: 9, col: COL.pale }); }
      for (let i = 0; i < m.need; i++) { lamp(c, 20 + i * 24, H - 22, 8, i < m.filled ? P.good : '#2a2748', i < m.filled ? 'diamond' : 'circle'); }
      txt(c, `sickbay support posts ${m.filled}/${m.need}`, 120, H - 18, { size: 11, col: COL.pale });
    };
    return m;
  },
});
