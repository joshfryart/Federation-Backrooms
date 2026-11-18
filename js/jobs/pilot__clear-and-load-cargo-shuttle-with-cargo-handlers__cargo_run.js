// Pilot: clear and load the cargo shuttle with the cargo handlers. Crates come off the handler arm in manifest order. Most are tagged for a
// side (PORT or STBD) and must go there; a few are tagged EITHER, and those are the only freedom you have. The trim indicator must stay inside
// the limit after every crate, so the EITHER crates have to be spent looking ahead at the heavy fixed ones still to come, not just on the
// lighter side now. A crate on the wrong side of the manifest, or one that tips the trim past the limit, is lifted back off (a fault).
import { define, machine, ri, pick, txt, box, bar, COL, ARROW } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Clear and load cargo shuttle with cargo handlers', type: 'task:cargo_run' },
  title: 'Spend the either-side crates ahead', dept: 'flight', host: 'console', tool: 'Cargo manifest and trim indicator',
  how: 'Each crate on the arm shows its mass and tag. ← stows it to port, → to starboard. Tagged crates must go to their side; EITHER crates go wherever keeps the trim inside the limit for the crates still to come.',
  keys: ['← port', '→ starboard'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'plan the trim', input: 'arrows',
    win: 'the whole manifest stowed with fixed crates on their tagged side and the trim inside its limit after every crate',
    fail: 'stowing a tagged crate on the wrong side, or spending an either crate so a later heavy one tips the trim past the limit',
    rule: 'Left stows port, right stows starboard. Read the next crates in the manifest strip before choosing a side for an EITHER crate, because the trim is checked after every crate.' },
  rush: 'Stacked the crates wherever the arm was pointing.',
  captions: { 'off manifest': 'handler lead: wrong side', 'over trim': 'trim alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, LIM = m.calm ? 7 : 6;
    const solve = (cr, i, trim) => { if (Math.abs(trim) > LIM) return null; if (i >= cr.length) return []; const c = cr[i], sides = c.tag === 'E' ? [-1, 1] : [c.tag === 'P' ? -1 : 1];
      for (const s of sides) { const rest = solve(cr, i + 1, trim + s * c.mass); if (rest) return [s, ...rest]; } return null; };
    for (let tries = 0; tries < 60; tries++) {
      const n = ri(r, 7, 8); m.crates = Array.from({ length: n }, (_, k) => ({ mass: ri(r, 2, 6), tag: pick(r, ['P', 'S', 'P', 'S', 'E']), id: `CR-${ri(r, 10, 99)}` }));
      if (m.crates.filter(c => c.tag === 'E').length >= 2 && solve(m.crates, 0, 0)) break;
    }
    m.i = 0; m.trim = 0; m.flash = 0; m.msg = ''; m.round = 1; m.rounds = m.crates.length; m.plan = null; m.planAt = -1;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (a !== 'L' && a !== 'R') return false; if (!down) return true;
      const c = m.crates[m.i], s = a === 'L' ? -1 : 1;
      if (c.tag !== 'E' && s !== (c.tag === 'P' ? -1 : 1)) { m.fault('off manifest'); m.flash = 0.7; m.msg = 'WRONG SIDE'; return true; }
      if (Math.abs(m.trim + s * c.mass) > LIM) { m.fault('over trim'); m.flash = 0.7; m.msg = 'TRIM OVER LIMIT'; return true; }
      m.trim += s * c.mass; m.ev('stow', { s }); m.i++; if (m.i >= m.crates.length) m.win(); else m.round = m.i + 1; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); };
    m.hint = () => { if (m.i >= m.crates.length) return []; if (m.planAt !== m.i) { m.plan = solve(m.crates.slice(m.i), 0, m.trim); m.planAt = m.i; }
      const k = m.plan && m.plan[0] < 0 ? 'ArrowLeft' : 'ArrowRight'; return [[k, true], [k, false]]; };
    m.bad = () => 'ArrowLeft';
    m.view = () => ({ crates: m.crates.map(c => c.tag + c.mass) });
    m.buttons = () => [['ArrowLeft', '◀ Port'], ['ArrowRight', 'Starboard ▶']];
    m.draw = (c, W, H, P) => {
      txt(c, 'MANIFEST (next on the arm first)', 12, 18, { size: 11, col: COL.peri });
      for (let k = m.i; k < Math.min(m.crates.length, m.i + 6); k++) { const x = 12 + (k - m.i) * 64, cr = m.crates[k];
        box(c, x, 28, 58, 42, k === m.i ? 'rgba(244,194,91,.2)' : 'rgba(255,255,255,.06)', k === m.i ? COL.gold : null, 5);
        txt(c, `${cr.mass} t`, x + 29, 46, { size: 13, align: 'center' }); txt(c, cr.tag === 'P' ? '◀ PORT' : cr.tag === 'S' ? 'STBD ▶' : 'EITHER', x + 29, 62, { size: 9, col: cr.tag === 'E' ? COL.lav : COL.pale, align: 'center' }); }
      txt(c, 'TRIM', 12, 96, { size: 11, col: COL.peri }); const w = 300, sc = 0.5 / (LIM + 4);
      bar(c, 50, 88, w, 12, 0.5 + m.trim * sc, { band: [0.5 - LIM * sc, 0.5 + LIM * sc], mark: 0.5 + m.trim * sc, col: 'rgba(0,0,0,0)' });
      txt(c, 'port', 50, 116, { size: 9, col: COL.dim }); txt(c, 'stbd', 350, 116, { size: 9, col: COL.dim, align: 'right' });
      txt(c, `${m.trim < 0 ? 'port' : m.trim > 0 ? 'stbd' : 'level'} ${Math.abs(m.trim)} t  ·  limit ${LIM} t`, 200, 116, { size: 10, col: COL.ink, align: 'center' });
      if (m.flash > 0) txt(c, m.msg, W - 12, H - 10, { size: 12, col: P.bad, align: 'right' });
    };
    return m;
  },
});
