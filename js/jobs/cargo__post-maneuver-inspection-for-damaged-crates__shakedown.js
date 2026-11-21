// Cargo: post-maneuver inspection for damaged crates. Rake the inspection lamp along the stack face: hold Left/Right to slide the marker, hold Up/Down
// to change the lamp angle. A dent only throws a shadow when the light is LOW; a high lamp shows only harmless glints. Tag dented crates (Space).
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Post-maneuver inspection for damaged crates', type: 'task:shakedown' },
  title: 'Rake the lamp for dents', dept: 'services', host: 'console', tool: 'Inspection lamp and stack face',
  how: 'Hold Down to lower the lamp until shadows appear. Hold Left/Right to slide the marker onto a dented crate and press Space to tag it. Do not tag glints.',
  keys: ['Left/Right hold: slide', 'Up/Down hold: lamp angle', 'Space tag the crate'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'rake the lamp', input: 'arrows-hold+space',
    win: 'every dented crate on the stack face found with a low lamp and tagged',
    fail: 'tagging a crate that is only a glint under a high lamp, or never lowering the lamp to find the dents',
    rule: 'Hold Down to lower the lamp; below the line the shadow of a dent shows on the crate. Hold Left or Right to slide the marker, then press Space on a dented crate. Tagging a sound crate is a fault.' },
  rush: 'Looked the stack over from the door and signed it off.',
  captions: { 'sound crate': 'wrong tag tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 8, nd = m.calm ? 2 : 3, spd = 4;
    m.dent = Array(n).fill(false); shuffle(r, [1, 2, 3, 4, 5, 6, 7]).slice(0, nd).forEach(k => { m.dent[k] = true; });
    m.glint = m.dent.map((d, k) => !d && r() < 0.4); m.tag = Array(n).fill(false); m.pos = 0; m.ang = 0.85; m.rounds = nd; m.round = 0;
    const cell = () => Math.max(0, Math.min(n - 1, Math.round(m.pos)));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { m.held[a] = down; if (down) m.held[{ L: 'R', R: 'L', U: 'D', D: 'U' }[a]] = false; return true; }
      if (SPACE(code) && down) { const k = cell(); if (m.tag[k]) return true; if (!m.dent[k]) m.fault('sound crate'); else { m.tag[k] = true; m.round++; if (m.dent.every((d, j) => !d || m.tag[j])) m.win(); } return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.pos = Math.max(0, Math.min(n - 1, m.pos + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * spd * dt)); m.ang = Math.max(0, Math.min(1, m.ang + ((m.held.U ? 1 : 0) - (m.held.D ? 1 : 0)) * 0.7 * dt)); };
    const low = () => m.ang <= 0.3, tgt = () => m.dent.findIndex((d, k) => d && !m.tag[k]);
    m.hint = () => { const t = tgt(); if (t < 0) return []; if (!low()) return [['ArrowDown', true]]; const e = t - m.pos, on = Math.abs(e) < 0.12;
      return [['ArrowDown', false], ['ArrowRight', !on && e > 0], ['ArrowLeft', !on && e < 0], ['Space', on && cell() === t]]; };
    m.bad = () => { const k = m.dent.findIndex((d, j) => !d && j > 0), c = cell(); if (m.dent[c]) { return ['ArrowRight', true]; } return Math.abs(m.pos - c) < 0.2 && c > 0 ? 'Space' : ['ArrowRight', true]; };
    m.view = () => ({ dent: m.dent.map(Number), glint: m.glint.map(Number) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['ArrowUp', 'lamp up'], ['ArrowDown', 'lamp down'], ['Space', 'Tag']];
    m.draw = (c, W, H, P) => {
      txt(c, `LAMP ${low() ? 'LOW: shadows show' : 'HIGH: glints only'}`, 12, 18, { size: 12, col: low() ? P.good : COL.warn }); txt(c, `dents tagged ${m.round} / ${nd}`, W - 12, 18, { size: 11, col: COL.pale, align: 'right' });
      for (let k = 0; k < n; k++) { const x = 10 + k * 48; box(c, x, 36, 42, 70, m.tag[k] ? 'rgba(79,208,106,.2)' : 'rgba(255,255,255,.06)', cell() === k ? COL.gold : COL.dim, 5);
        if (low() && m.dent[k]) { txt(c, 'DENT', x + 21, 76, { size: 10, align: 'center', col: P.bad }); } else if (!low() && m.glint[k]) txt(c, '*', x + 21, 76, { size: 18, align: 'center', col: COL.pale }); if (m.tag[k]) txt(c, 'tag', x + 21, 98, { size: 10, align: 'center', col: P.good }); }
      txt(c, 'lamp angle', 12, 128, { size: 10, col: COL.dim }); c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(80, 120, 200, 8); c.fillStyle = COL.gold; c.fillRect(80 + m.ang * 200 - 2, 116, 4, 16); c.fillStyle = P.good; c.fillRect(80, 120, 60, 8);
    };
    return m;
  },
});
