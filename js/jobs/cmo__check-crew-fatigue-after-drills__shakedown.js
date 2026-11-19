// CMO: check crew fatigue after drills (shakedown). Each crewman runs five presses on the reaction board while you watch the delays come
// in against their baseline. Fatigue is a steady slowing: most presses more than 0.2 s over baseline. Disinterest is one or two lazy
// presses among sharp ones, and is not fatigue. When all five are in, order rest (Space) or clear them for the next watch (Enter).
import { define, machine, SPACE, ENTER, ri, rf, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Ensign Okafor', 'Crewman Vell', 'Lt Saavik-Rhee', 'PO Danvers', 'Ensign Moyo', 'Crewman Tarr', 'Lt jg Imura', 'PO Halvorsen'];
export default define({
  job: { billet: 'cmo', label: 'Check crew fatigue after drills', type: 'task:shakedown' },
  title: 'Reaction-board fatigue read', dept: 'medical', host: 'console', tool: 'Reaction board and fatigue chart',
  how: 'Watch all five reaction delays against the crewman\'s baseline, then order rest (Space) if most are more than 0.2 s slow, or clear them (Enter) if they are sharp or only slack once or twice.',
  keys: ['Space rest order', 'Enter clear for watch'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'time reactions', input: 'space+enter', win: 'four crewmen judged after all five reaction presses: steady slowing put on rest, sharp or merely careless crew cleared',
    fail: 'judging before the five presses are in, clearing a steadily slow crewman, or resting one who was only careless',
    rule: 'Five delays appear one by one next to the baseline. If at least four are over baseline + 0.2 s, that is fatigue: Space. One or two slow among sharp ones is disinterest: Enter. Wait for all five.' },
  rush: 'Asked each of them if they felt tired, took "no" for an answer and cleared the watch.',
  captions: { 'judged early': 'board still running', 'cleared exhausted crewman': 'crewman yawns at the console', 'rested a fit crewman': 'XO queries the rest list' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 0.55 : 0.45, names = shuffle(r, NAMES);
    const kinds = shuffle(r, ['fatigue', 'lazy', ri(r, 0, 1) ? 'sharp' : 'fatigue', ri(r, 0, 1) ? 'lazy' : 'sharp']);
    m.crew = kinds.map((k, j) => { const base = rf(r, 0.24, 0.34); let d;
      if (k === 'fatigue') { d = Array.from({ length: 5 }, () => base + rf(r, 0.23, 0.38)); if (r() < 0.5) d[ri(r, 0, 4)] = base + rf(r, -0.02, 0.05); }
      else if (k === 'lazy') { d = Array.from({ length: 5 }, () => base + rf(r, -0.03, 0.06)); const s = shuffle(r, [0, 1, 2, 3, 4]); d[s[0]] = base + rf(r, 0.4, 0.7); if (r() < 0.6) d[s[1]] = base + rf(r, 0.25, 0.45); }
      else d = Array.from({ length: 5 }, () => base + rf(r, -0.03, 0.08));
      return { n: names[j], k, base, d: d.map(x => +x.toFixed(2)) }; });
    m.k = 0; m.w = 0; m.rounds = 4; m.round = 0; m.flash = '';
    const shown = () => Math.min(5, Math.floor(m.w / gap)), tired = (c) => c.d.filter(x => x > c.base + 0.2).length >= 4;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; if (!SPACE(code) && !ENTER(code)) return false; if (!down) return true; const c = m.crew[m.k]; if (!c) return true;
      if (shown() < 5) { m.fault('judged early'); m.flash = 'wait for all five presses'; return true; }
      const rest = SPACE(code); if (rest !== tired(c)) { m.fault(rest ? 'rested a fit crewman' : 'cleared exhausted crewman'); m.flash = rest ? 'only careless, not tired' : 'steady slowing: that is fatigue'; return true; }
      m.round++; m.flash = `${c.n}: ${rest ? 'rest order' : 'cleared'}`; m.w = 0; if (++m.k >= m.crew.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.w += dt; };
    m.hint = () => { const c = m.crew[m.k]; if (!c || m.w < 5 * gap + 0.1) return []; return [[tired(c) ? 'Space' : 'Enter', true]]; };
    m.bad = () => { const c = m.crew[m.k]; if (!c || shown() < 5) return null; return tired(c) ? 'Enter' : 'Space'; };
    m.view = () => ({ c: m.crew.map(c => c.k) });
    m.buttons = () => [['Space', 'Rest order'], ['Enter', 'Clear']];
    m.draw = (c, W, H, P) => {
      const cr = m.crew[m.k] || m.crew[m.crew.length - 1], n = m.crew[m.k] ? shown() : 5, x0 = 20, y0 = 140, sc = 140;
      txt(c, `${cr.n} · crewman ${Math.min(m.k + 1, 4)} / 4`, 12, 16, { size: 12, col: COL.gold });
      c.fillStyle = COL.peri; c.fillRect(x0, y0 - cr.base * sc, 260, 2); txt(c, 'baseline', 284, y0 - cr.base * sc + 4, { size: 10, col: COL.peri });
      c.fillStyle = P.bad; c.fillRect(x0, y0 - (cr.base + 0.2) * sc, 260, 1); txt(c, '+0.2 s', 284, y0 - (cr.base + 0.2) * sc + 4, { size: 10, col: P.bad });
      for (let q = 0; q < n; q++) { const v = cr.d[q], h = Math.min(v, 0.95) * sc, slow = v > cr.base + 0.2; box(c, x0 + 14 + q * 50, y0 - h, 26, h, slow ? COL.warn : COL.gold, null, 2); txt(c, `${v.toFixed(2)}${slow ? ' ▲' : ''}`, x0 + 27 + q * 50, y0 + 14, { size: 10, align: 'center' }); }
      txt(c, n < 5 ? `press ${n + 1} of 5…` : 'all five in: decide', 330, 40, { size: 11, align: 'center', col: COL.pale }); txt(c, m.flash, 390, 164, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
