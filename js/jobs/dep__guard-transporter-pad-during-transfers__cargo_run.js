// Deputy security chief, cargo run: guard the transporter pad during transfers. Each transfer order comes up with the operator's beam
// countdown already running. Check the signature against the authorised list: a good one is logged (Enter) before it beams. An unsigned order,
// or one signed by someone not on the list, must be physically held: step onto the pad edge (hold Space) until the operator aborts, then step
// off. Standing on the pad for a properly signed transfer holds up the bridge.
import { define, machine, SPACE, ENTER, rf, shuffle, pick, txt, box, bar, lamp, COL } from './kit.js';

const SIG = ['Cmdr Asante', 'Lt Varga', 'QM Delacroix', 'Lt Cmdr Rhee', 'Chief Mbatha', 'Ens Kirov', 'Lt Fairweather'];
const LOAD = ['Medical stores', 'Ore samples', 'Spare couplings', 'Survey probe', 'Ration crates', 'Isolinear stock', 'Diplomatic pouch', 'Coolant cells'];
export default define({
  job: { billet: 'dep', label: 'Guard transporter pad during transfers', type: 'task:cargo_run' },
  title: 'Pad-edge beam hold', dept: 'security', host: 'console', tool: 'Transporter pad and order list',
  how: 'Log each properly signed transfer (Enter) before the countdown ends. If an order is unsigned or the signer is not on the list, hold Space to stand on the pad edge until the operator aborts.',
  keys: ['Enter log a signed transfer', 'Space hold: stand on the pad edge'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'hold the beam', input: 'enter+space-hold', win: 'six transfers watched: every authorised one logged before it beams and every unsigned one held on the pad until aborted',
    fail: 'letting an unsigned crate beam out, logging it, or standing on the pad for a properly signed transfer',
    rule: 'Each order shows a signer and a beam countdown. Signer on the list: Enter before zero. Blank or unlisted: hold Space (on the pad edge) until ABORTED shows, then let go.' },
  rush: 'Watched the sparkle and initialled the transfer log afterwards.',
  captions: { 'beamed unsigned': 'transporter whine', 'held bridge': 'operator protests', unlogged: 'log chirps', 'logged unsigned': 'log accepts with a click' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cd = m.calm ? 3.6 : 2.6, abort = m.calm ? 0.8 : 1.0, sigs = shuffle(r, SIG);
    m.auth = sigs.slice(0, 4).sort();
    const kinds = shuffle(r, ['ok', 'ok', 'ok', 'blank', 'stranger', r() < 0.5 ? 'ok' : 'blank']);
    m.ord = kinds.map(k => ({ load: pick(r, LOAD), sig: k === 'ok' ? pick(r, m.auth) : k === 'stranger' ? pick(r, sigs.slice(4)) : '', ok: k === 'ok', cd: cd * rf(r, 0.9, 1.1) }));
    m.i = 0; m.pt = 0; m.hold = 0; m.done = null; m.gap = 0; m.rounds = m.ord.length; m.round = 0;
    const next = () => { m.i++; m.round = m.i; m.pt = 0; m.hold = 0; m.done = null; m.gap = 0.5; if (m.i >= m.ord.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const o = m.ord[m.i];
      if (SPACE(code)) { const was = m.held.S; m.held.S = down; if (down && !was && o && m.gap <= 0 && !m.done && o.ok) m.fault('held bridge'); if (!down && was && m.done === 'abort') next(); return true; }
      if (!ENTER(code)) return false; if (!down || !o || m.gap > 0 || m.done) return true;
      if (o.ok) { m.ev('logged', { i: m.i }); next(); } else { m.fault('logged unsigned'); next(); } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; return; } const o = m.ord[m.i]; if (!o) return;
      if (m.done === 'abort') return;
      if (m.held.S && !o.ok) { m.hold += dt; if (m.hold >= abort) { m.done = 'abort'; m.ev('aborted', { i: m.i }); } return; }
      m.pt += dt; if (m.pt >= o.cd) { m.fault(o.ok ? 'unlogged' : 'beamed unsigned'); next(); }
    };
    m.hint = () => { const o = m.ord[m.i]; if (!o) return []; if (m.gap > 0) return m.held.S ? [['Space', false]] : []; if (m.done === 'abort') return [['Space', false]]; if (m.pt < 0.3 && !m.held.S) return []; return o.ok ? [['Enter', true]] : [['Space', true]]; };
    m.bad = () => { const o = m.ord[m.i]; if (!o || m.gap > 0) return m.held.S ? ['Space', false] : null; return o.ok ? ['Space', true] : 'Enter'; };
    m.view = () => ({ ord: m.ord.map(o => o.load + '|' + o.sig) });
    m.buttons = () => [['Enter', 'Log transfer'], ['Space', 'Hold the pad']];
    m.draw = (c, W, H, P) => {
      box(c, 268, 8, 122, 104, COL.panel, 'rgba(255,255,255,.12)', 6); txt(c, 'AUTHORISED', 276, 22, { size: 9, col: COL.peri });
      m.auth.forEach((n, k) => txt(c, n, 278, 42 + k * 18, { size: 11 }));
      const o = m.ord[m.i]; txt(c, `Order ${Math.min(m.i + 1, m.ord.length)} / ${m.ord.length}`, 278, 132, { size: 11, col: COL.pale }); if (!o || m.gap > 0) return;
      box(c, 14, 14, 240, 70, COL.panel, m.held.S ? COL.warn : COL.gold, 6); txt(c, o.load, 24, 36, { size: 13 });
      txt(c, 'Signed:', 24, 60, { size: 11, col: COL.dim }); txt(c, o.sig || '— none —', 76, 60, { size: 12, col: o.sig ? COL.ink : COL.warn });
      if (m.done === 'abort') { lamp(c, 230, 50, 9, P.good, 'square'); txt(c, 'ABORTED — step off', 24, 106, { size: 12, col: P.good }); }
      else if (m.held.S) { lamp(c, 230, 50, 9, COL.warn, 'triangle'); txt(c, 'On the pad edge — holding beam', 24, 106, { size: 12, col: COL.warn }); bar(c, 24, 114, 220, 8, m.hold / abort, { col: COL.warn }); }
      else { txt(c, `Beam in ${Math.max(0, o.cd - m.pt).toFixed(1)} s`, 24, 106, { size: 12, col: COL.pale }); bar(c, 24, 114, 220, 8, 1 - m.pt / o.cd, { col: COL.peri }); }
    };
    return m;
  },
});
