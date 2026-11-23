// Quartermaster: draw medical supplies and bedding to sickbay. The supply lift drops six items down the chute, one every second and a half, at one
// of three chutes (left, middle, right). Hold Left / Right to run the sickbay cart under the chute the next item drops from; bales fall fast and
// bundles fall slow. A dropped item is a damaged item.
import { define, machine, ARROW, ri, rf, pick, txt, box, COL } from './kit.js';

const LANE = [0.15, 0.5, 0.85], FALL = { bale: 1.5, bundle: 2.6 };
export default define({
  job: { billet: 'qm', label: 'Draw medical supplies and bedding to sickbay', type: 'task:medical_relief' },
  title: 'Catch the chute drop on the cart', dept: 'services', host: 'console', tool: 'Sickbay cart and supply chutes',
  how: 'Items drop from three chutes. Hold Left / Right to keep the cart under the one that is about to land; bales fall quickly, bundles slowly. Catch all six.',
  keys: ['hold Left / Right: run the cart'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'run under', input: 'arrows-hold',
    win: 'six dropped supply items all landed on the cart as it ran under the right chute at the right moment',
    fail: 'letting items hit the deck because the cart was under the wrong chute when they landed',
    rule: 'The cart runs only while Left or Right is held. Each item shows its chute and a falling marker; be under that chute when the marker reaches the cart. Heavier bales fall faster.' },
  rush: 'Stacked everything on the cart as it came off the shelf and counted the breakages in sickbay.',
  captions: { dropped: 'crash: item hit the deck' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sp = m.calm ? 0.55 : 0.7, gap = m.calm ? 1.9 : 1.5; m.x = 0.5; m.got = 0; m.res = 0;
    let lanes = Array.from({ length: 6 }, () => ri(r, 0, 2)); while (lanes.filter(l => l !== 1).length < 4) lanes[ri(r, 0, 5)] = pick(r, [0, 2]);
    m.items = lanes.map((l, i) => { const kind = r() < 0.5 ? 'bale' : 'bundle', land = 3.2 + i * gap; return { l, kind, land, spawn: land - FALL[kind] * (m.calm ? 1.25 : 1), done: false, name: pick(r, kind === 'bale' ? ['saline bale', 'bedding bale', 'gauze bale'] : ['linen bundle', 'splint bundle', 'blanket bundle']) }; });
    m.held = { L: false, R: false };
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a === 'L' || a === 'R') { m.held[a] = down; return true; } return !!a; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.x = Math.max(0, Math.min(1, m.x + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * sp * dt));
      for (const it of m.items) if (!it.done && m.t >= it.land) { it.done = true; if (Math.abs(m.x - LANE[it.l]) <= 0.11) { m.got++; if (m.got >= m.items.length) { m.win(); return; } } else m.fault('dropped'); }
    };
    m.hint = () => { if (m.state !== 'play') return []; const it = m.items.find(i => !i.done); if (!it) return []; const dx = LANE[it.l] - m.x; return Math.abs(dx) < 0.02 ? [['ArrowLeft', false], ['ArrowRight', false]] : dx > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]]; };
    m.bad = () => null;
    m.view = () => ({ it: m.items.map(i => [i.l, i.kind, +i.land.toFixed(1)]) });
    m.buttons = () => [['ArrowLeft', '◀ cart'], ['ArrowRight', 'cart ▶']];
    m.draw = (c, W, H, P) => {
      LANE.forEach(l => { box(c, l * 400 - 22, 8, 44, 10, COL.panel, COL.peri, 3); });
      for (const it of m.items) { if (it.done || m.t < it.spawn) continue; const y = 20 + (m.t - it.spawn) / (it.land - it.spawn) * 110, x = LANE[it.l] * 400; box(c, x - 16, y - 8, 32, 16, it.kind === 'bale' ? '#4a3a22' : '#22384a', COL.pale, 3); txt(c, it.kind === 'bale' ? 'BALE' : 'BNDL', x, y + 4, { size: 8, align: 'center' }); }
      box(c, m.x * 400 - 30, 134, 60, 18, '#33304f', COL.gold, 4); txt(c, 'CART', m.x * 400, 147, { size: 10, align: 'center', col: COL.gold });
      txt(c, `loaded ${m.got}/6`, 14, 166, { size: 10, col: COL.dim });
    };
    return m;
  },
});
