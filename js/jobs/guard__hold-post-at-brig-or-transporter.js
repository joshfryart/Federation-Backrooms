// Guard: hold post at the brig or transporter door. Figures walk up three approach lanes toward the door. A badge can only be read once a
// figure is inside the challenge zone: shout at someone still down the corridor and you have challenged a shadow (rude, and a fault). Challenge
// each figure inside the zone (its lane number); a badge reads ID and the figure walks on. NO BADGE means press the lane again to turn them
// away before they reach the door. Anyone who reaches the door unchallenged, or an unbadged figure not turned away, is a fault.
import { define, machine, DIG, rf, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const NAMES = ['Ens. Rao', 'Lt. Vey', 'Cpl. Duna', 'Tech Imre', 'Ens. Holt', 'Dr. Sato', 'Ens. Kier', 'Lt. Oyelaran'];
export default define({
  job: { billet: 'guard', label: 'Hold post at brig or transporter', type: 'loop' },
  title: 'Brig post approach challenge', dept: 'security', host: 'console', tool: 'Brig post sight line',
  how: 'Watch the three approach lanes. When a figure enters the shaded challenge zone, press its lane number to read the badge. NO BADGE: press the lane again to turn them away.',
  keys: ['1-3 challenge / turn away in that lane'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'challenge in range', input: 'digits',
    win: 'every approaching figure challenged inside the reading zone and every unbadged one turned back short of the door',
    fail: 'shouting at a figure still out of reading range, or a visitor reaching the door unchallenged',
    rule: 'Figures walk in along lanes 1-3. Press the lane only once its figure is inside the shaded zone; ID walks on, NO BADGE needs a second press before the door.' },
  rush: 'Nodded at anyone in uniform and kept the post log blank.',
  captions: { shadow: 'challenge echoes down an empty corridor', unchallenged: 'door hisses open', intruder: 'brig alarm chirps', hassled: 'annoyed grumble' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, walk = m.calm ? 4.4 : 3.2, Z = [0.24, 0.56], N = 6;
    const nm = shuffle(r, NAMES), noBadge = new Set(shuffle(r, [1, 2, 3, 4, 5]).slice(0, 2));
    let t = 0.6; m.figs = Array.from({ length: N }, (_, k) => { t += k ? rf(r, 1.2, 2.4) : 0; return { at: +t.toFixed(2), lane: 0, name: nm[k], badge: !noBadge.has(k), d: 1, live: false, ch: false, out: false, done: false }; });
    m.figs.forEach(f => { f.lane = ri(r, 0, 2); });
    m.rounds = N; m.round = 0; m.held = {};
    const lead = (l) => m.figs.filter(f => f.live && !f.done && f.lane === l).sort((a, b) => a.d - b.d)[0];
    const close = (f) => { f.done = true; f.live = false; m.round++; if (m.round >= N) m.win(); };
    m.key = (code, down = true) => {
      const n = DIG(code); if (m.state !== 'play' || !n || n > 3) return false;
      if (!down) { m.held[code] = false; return true; } if (m.held[code]) return true; m.held[code] = true;
      const f = lead(n - 1);
      if (!f || (!f.ch && f.d > Z[1])) { m.fault('shadow'); return true; }
      if (!f.ch) { f.ch = true; m.ev('challenge', { badge: f.badge }); return true; }
      if (!f.badge) { f.out = true; m.ev('turned away'); close(f); return true; }
      m.fault('hassled'); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      for (const f of m.figs) {
        if (f.done) continue; if (!f.live) { if (m.t >= f.at && !lead(f.lane)) f.live = true; else continue; }
        f.d -= dt / walk;
        if (f.d <= 0) { if (!f.ch) m.fault('unchallenged'); else if (!f.badge) m.fault('intruder'); close(f); }
      }
    };
    m.hint = () => {
      const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [[h, false]];
      for (const f of m.figs) { if (!f.live || f.done) continue;
        if (!f.ch && f.d <= Z[1] - 0.05 && f.d >= Z[0]) return [['Digit' + (f.lane + 1), true]];
        if (f.ch && !f.badge && lead(f.lane) === f) return [['Digit' + (f.lane + 1), true]]; }
      return [];
    };
    m.bad = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [h, false]; const f = m.figs.find(x => x.live && !x.done && !x.ch && x.d > 0.7); return f ? ['Digit' + (f.lane + 1), true] : null; };
    m.view = () => ({ figs: m.figs.map(f => [f.at, f.lane, f.badge]) });
    m.buttons = () => [['Digit1', 'Lane 1'], ['Digit2', 'Lane 2'], ['Digit3', 'Lane 3']];
    m.draw = (c, W, H, P) => {
      const x0 = 50, x1 = 380, lx = (d) => x0 + d * (x1 - x0);
      txt(c, 'BRIG DOOR', 8, 14, { size: 10, col: COL.gold }); box(c, 8, 22, 34, 120, 'rgba(255,255,255,.06)', COL.peri, 3);
      c.fillStyle = 'rgba(79,208,106,.14)'; c.fillRect(lx(Z[0]), 22, lx(Z[1]) - lx(Z[0]), 120); c.strokeStyle = P.good; c.lineWidth = 1; c.strokeRect(lx(Z[0]), 22, lx(Z[1]) - lx(Z[0]), 120);
      txt(c, 'challenge zone', (lx(Z[0]) + lx(Z[1])) / 2, 154, { size: 10, align: 'center', col: COL.dim });
      for (let l = 0; l < 3; l++) { const y = 42 + l * 40; txt(c, `${l + 1}`, 26, y + 4, { size: 14, align: 'center' }); c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(x0, y - 2, x1 - x0, 4);
        for (const f of m.figs) if (f.live && !f.done && f.lane === l) { const x = lx(f.d);
          lamp(c, x, y, 9, !f.ch ? COL.dim : f.badge ? P.good : P.bad, !f.ch ? 'circle' : f.badge ? 'square' : 'triangle');
          if (f.ch) txt(c, f.badge ? `ID ${f.name}` : 'NO BADGE', x + 13, y - 6, { size: 10, col: f.badge ? P.good : P.bad }); } }
      txt(c, `post log ${m.round} / ${N}`, 392, 14, { size: 11, align: 'right', col: COL.pale });
    };
    return m;
  },
});
