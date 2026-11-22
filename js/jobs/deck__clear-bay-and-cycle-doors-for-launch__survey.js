// Deck crew: clear bay and cycle doors for launch. The console floor plan only shows what its cameras can see: zones behind stacked sleds are
// shaded '?'. Walk to a zone (1-6; walking takes time by distance) and anything there is dragged out of the launch lane. Raise the forcefield
// (Space), then open the door (Enter). Opening onto a lane that still holds a crate, seen or unseen, launches the craft into it.
import { define, machine, DIG, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Clear bay and cycle doors for launch', type: 'task:survey' },
  title: 'Launch lane walk and door release', dept: 'flight', host: 'console', tool: 'Bay console floor plan',
  how: 'Press 1-6 to walk to a lane zone; whatever is there gets dragged clear. Shaded ? zones are out of camera view, so walk them too. Space raises the field, Enter opens the door.',
  keys: ['1-6 walk to a zone', 'Space raise the field', 'Enter open the bay door'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'walk the lane', input: 'digits+space+enter', win: 'two launches with every lane zone, including the blind ones, truly empty and the field up before the door opens',
    fail: 'opening the door while clutter hidden from the cameras still sits in the lane, or before the field is up',
    rule: 'Walking costs time per zone travelled, so plan a route. A zone shown ? can hide a sled; only walking it reveals and clears it. Field first (Space), door last (Enter).' },
  rush: 'Glanced at the console camera and opened the doors.',
  captions: { 'launched into clutter': 'crunch of metal on the deck', 'no field': 'decompression klaxon' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, walk = m.calm ? 0.22 : 0.3, drag = m.calm ? 0.5 : 0.7;
    const lay = () => { const z = Array.from({ length: 6 }, () => ({ stuff: null, seen: true })); for (const k of shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 2, 3))) z[k].stuff = r() < 0.5 ? 'crate' : 'sled';
      for (const k of shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 2, 3))) { z[k].seen = false; if (r() < 0.55) z[k].stuff = z[k].stuff || 'crate'; } return z; };
    m.lanes = [lay(), lay()]; m.L = 0; m.pos = 0; m.go = null; m.busy = 0; m.field = 0; m.raising = false; m.rounds = 2; m.round = 1;
    const Z = () => m.lanes[Math.min(m.L, m.lanes.length - 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const n = DIG(code);
      if (n) { if (down && n <= 6 && m.go == null && m.busy <= 0) { m.go = n - 1; m.busy = Math.abs(m.go - m.pos) * walk + 0.1; } return true; }
      if (SPACE(code)) { if (down && m.field < 1) m.raising = true; return true; }
      if (ENTER(code)) { if (!down || m.go != null) return true;
        if (Z().some(z => z.stuff)) { m.fault('launched into clutter'); Z().forEach(z => { z.seen = true; }); return true; }
        if (m.field < 1) { m.fault('no field'); return true; }
        m.ev('launch', { n: m.L }); m.L++; m.field = 0; m.raising = false; m.round = Math.min(2, m.L + 1); if (m.L >= 2) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.raising) { m.field = Math.min(1, m.field + dt / 1.2); if (m.field >= 1) m.raising = false; }
      if (m.go != null) { m.busy -= dt; if (m.busy <= 0) { m.pos = m.go; const z = Z()[m.pos]; z.seen = true; if (z.stuff) { m.busy = drag; z.stuff = null; m.ev('drag', { zone: m.pos }); } m.go = null; } }
      else if (m.busy > 0) m.busy -= dt;
    };
    m.todo = () => Z().map((z, k) => (z.stuff || !z.seen ? k : -1)).filter(k => k >= 0);
    m.hint = () => { if (m.go != null || m.busy > 0) return []; const t = m.todo(); if (t.length) { const k = t.reduce((a, b) => (Math.abs(b - m.pos) < Math.abs(a - m.pos) ? b : a)); return [['Digit' + (k + 1), true]]; } if (m.field < 1) return m.raising ? [] : [['Space', true]]; return [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ lanes: m.lanes.map(l => l.map(z => (z.stuff ? z.stuff[0] : '-') + (z.seen ? '' : '?'))) });
    m.buttons = () => [1, 2, 3, 4, 5, 6].map(k => ['Digit' + k, `${k}`]).concat([['Space', 'Field'], ['Enter', 'Open door']]);
    m.draw = (c, W, H, P) => {
      txt(c, `Launch ${m.L + 1} / 2 — launch lane`, 16, 20, { size: 12, col: COL.gold }); const x0 = 24, w = 52;
      Z()?.forEach((z, k) => { const x = x0 + k * w; box(c, x, 40, w - 4, 70, z.seen ? 'rgba(255,255,255,.05)' : 'rgba(120,120,140,.35)', COL.dim, 3); txt(c, `${k + 1}`, x + 24, 56, { size: 12, align: 'center', col: COL.ink });
        if (!z.seen) txt(c, '?', x + 24, 92, { size: 22, align: 'center', col: COL.dim }); else if (z.stuff) { box(c, x + 10, 68, 28, 28, COL.orange, '#fff', 2); txt(c, z.stuff, x + 24, 106, { size: 9, align: 'center', col: COL.warn }); } });
      const px = x0 + (m.go != null ? m.go : m.pos) * w + 24; c.fillStyle = COL.peri; c.beginPath(); c.arc(px, 122, 7, 0, 6.283); c.fill(); txt(c, m.go != null ? 'walking…' : m.busy > 0 ? 'dragging…' : 'you', px, 142, { size: 9, align: 'center', col: COL.dim });
      txt(c, 'DOOR', 352, 50, { size: 11, align: 'center', col: COL.dim }); box(c, 334, 56, 36, 54, COL.panel, COL.dim, 3);
      lamp(c, 352, 130, 9, m.field >= 1 ? P.good : P.bad, m.field >= 1 ? 'circle' : 'triangle'); txt(c, `field ${Math.round(m.field * 100)}%`, 352, 156, { size: 10, align: 'center', col: COL.ink });
    };
    return m;
  },
});
