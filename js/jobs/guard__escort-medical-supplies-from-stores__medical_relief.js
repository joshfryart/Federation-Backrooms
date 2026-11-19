// Guard: escort medical supplies from stores to sickbay. First load the trolley: the supply chit names a stock code, and only crates whose
// label matches it exactly go on (number keys). Then push the trolley along the corridor: hold Space to push, let go to let it slow. Each bend
// has a safe speed marked ahead of it; take a bend faster than that and the top crate tips off, and you must re-stack it (its number) before
// the trolley will move again. Loading a near-miss label or tipping crates at the bends are faults.
import { define, machine, DIG, SPACE, ri, rf, shuffle, txt, box, bar, COL } from './kit.js';

const PRE = ['MED', 'HYP', 'BND', 'PLS'];
export default define({
  job: { billet: 'guard', label: 'Escort medical supplies from stores', type: 'task:medical_relief' },
  title: 'Supply trolley bend pacing', dept: 'security', host: 'console', tool: 'Supply chit and trolley',
  how: 'Load the crates whose label matches the chit exactly (1-5). Then hold Space to push the trolley and let go before each bend so you take it under its safe speed. A tipped crate must be re-stacked (its number).',
  keys: ['1-5 load / re-stack a crate', 'Space hold: push the trolley'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'pace the trolley', input: 'digits+space-hold',
    win: 'only the crates labelled exactly as the chit loaded, and the trolley brought to the sickbay orderly taking every bend under its marked speed',
    fail: 'loading a crate whose label is one character off the chit, or rounding a bend too fast so the stack tips',
    rule: 'Compare each label to the chit and press the matching ones. Hold Space to speed up; release early enough that you coast down to the bend speed. Tipped crates go back with their number.' },
  rush: 'Grabbed the nearest crates and ran the trolley flat out.',
  captions: { 'wrong crate': 'crate clunks onto the trolley', tipped: 'crate crashes to the deck' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, acc = 2.4, drag = 1.8, vmax = 5.5, D = 46;
    const code = `${PRE[ri(r, 0, 3)]}-${ri(r, 1000, 9999)}`, near = (s) => { const k = ri(r, 4, 7), d = String((+s[k] + ri(r, 1, 8)) % 10); return s.slice(0, k) + d + s.slice(k + 1); };
    m.code = code; m.shelf = shuffle(r, [code, code, code, near(code), near(code)]).map(l => ({ l, on: false }));
    m.bends = [0, 1, 2].map(k => ({ at: +(10 + k * 12 + rf(r, -2, 2)).toFixed(1), safe: +(m.calm ? rf(r, 2.0, 2.6) : rf(r, 1.6, 2.2)).toFixed(1), hit: false }));
    m.ph = 'load'; m.x = 0; m.v = 0; m.tip = -1; m.held = {};
    const loaded = () => m.shelf.filter(c => c.on).length;
    m.key = (code_, down = true) => {
      if (m.state !== 'play') return false; const n = DIG(code_);
      if (SPACE(code_)) { m.held.S = down; return true; }
      if (!n || n > 5) return false; if (!down) { m.held[code_] = false; return true; } if (m.held[code_]) return true; m.held[code_] = true; const c = m.shelf[n - 1];
      if (m.ph === 'load') { if (c.on) return true; if (c.l !== m.code) { m.fault('wrong crate'); return true; } c.on = true; if (loaded() >= 3) m.ph = 'push'; return true; }
      if (m.tip === n - 1) { m.tip = -1; m.ev('restack'); } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.ph !== 'push') return;
      if (m.tip >= 0) { m.v = 0; return; }
      m.v = Math.max(0, Math.min(vmax, m.v + (m.held.S ? acc : -drag) * dt)); m.x += m.v * dt;
      for (const b of m.bends) if (!b.hit && m.x >= b.at) { b.hit = true; if (m.v > b.safe + 0.05) { m.fault('tipped'); const on = m.shelf.map((c, k) => (c.on ? k : -1)).filter(k => k >= 0); m.tip = on[on.length - 1]; m.v = 0; } }
      if (m.x >= D) m.win();
    };
    m.hint = () => { const h = Object.keys(m.held).find(k => k !== 'S' && m.held[k]); if (h) return [[h, false]];
      if (m.ph === 'load') { const k = m.shelf.findIndex(c => !c.on && c.l === m.code); return [['Digit' + (k + 1), true]]; }
      if (m.tip >= 0) return [['Digit' + (m.tip + 1), true]];
      const b = m.bends.find(x => !x.hit), brake = b ? (m.v * m.v - (b.safe - 0.3) ** 2) / (2 * drag) + m.v * 0.12 : -1;
      return [['Space', !(b && m.x + Math.max(0, brake) >= b.at - 0.1 && m.v > b.safe - 0.3)]]; };
    m.bad = () => { if (m.ph === 'load') { const k = m.shelf.findIndex(c => c.l !== m.code); const h = m.held['Digit' + (k + 1)]; return ['Digit' + (k + 1), !h]; } return ['Space', true]; };
    m.view = () => ({ shelf: m.shelf.map(c => c.l), bends: m.bends.map(b => [b.at, b.safe]) });
    m.buttons = () => [1, 2, 3, 4, 5].map(k => ['Digit' + k, `${k}`]).concat([['Space', 'Push']]);
    m.draw = (c, W, H, P) => {
      box(c, 12, 8, 120, 26, COL.panel, COL.gold, 4); txt(c, `CHIT ${m.code} ×3`, 72, 26, { size: 11, align: 'center', col: COL.gold });
      m.shelf.forEach((s, k) => { const y = 46 + k * 18, t = m.tip === k; txt(c, `${k + 1}  ${s.l}`, 14, y + 10, { size: 12, col: t ? P.bad : s.on ? P.good : COL.ink });
        txt(c, t ? 'TIPPED ✖' : s.on ? 'on ✓' : '', 112, y + 10, { size: 10, col: t ? P.bad : P.good }); });
      const x0 = 160, x1 = 388, lx = (x) => x0 + (x / D) * (x1 - x0); c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x0, 70, x1 - x0, 8);
      for (const b of m.bends) { c.fillStyle = b.hit ? COL.dim : COL.warn; c.fillRect(lx(b.at) - 1, 58, 3, 32); txt(c, `≤${b.safe}`, lx(b.at), 52, { size: 10, align: 'center', col: COL.pale }); }
      box(c, lx(m.x) - 7, 66, 14, 16, COL.peri, null, 3); txt(c, 'SICKBAY', x1, 104, { size: 10, align: 'right', col: COL.dim });
      txt(c, `${m.v.toFixed(1)} m/s`, x0, 126, { size: 16 }); bar(c, x0 + 80, 116, 140, 10, m.v / vmax, { col: COL.gold });
      txt(c, m.ph === 'load' ? `load ${loaded()} / 3 matching crates` : m.tip >= 0 ? `re-stack crate ${m.tip + 1}` : 'hold Space to push', x0, 150, { size: 11, col: COL.pale });
    };
    return m;
  },
});
