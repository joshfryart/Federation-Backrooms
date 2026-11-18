// Computer specialist: hold a clean relay link to the sickbay and the bridge. Both links show a reply time that always looks fine and a noise
// trace that does not. When a link's noise climbs over the static line, switch that link to its other route (1 sickbay, 2 bridge). Switching a
// clean link drops contact for nothing; leaving static on a line too long is the fault. Hold both links clean long enough to cover the relief.
import { define, machine, DIG, rf, txt, box, bar, COL } from './kit.js';

const LINKS = ['Sickbay', 'Bridge'], LINE = 0.5;
export default define({
  job: { billet: 'comp', label: 'Hold clean relay link to the sickbay and bridge', type: 'task:medical_relief' },
  title: 'Two-link static reroute', dept: 'operations', host: 'console', tool: 'Ops console relay link screen',
  how: 'Watch both links\' noise traces, not their reply times. When one climbs over the static line, press its number (1 sickbay, 2 bridge) to move it to the other route. Never switch a clean link. Hold both clean for the full contact time.',
  keys: ['1 switch sickbay route', '2 switch bridge route'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'reroute on static', input: 'digits', win: 'both relief links held clean for the full contact time, each noisy route abandoned before its static lasts',
    fail: 'holding a noisy link because its reply time looks fine, or switching a clean link and dropping contact',
    rule: 'Each link\'s noise trace rises when its route goes bad. Press that link\'s digit once its noise passes the line; the switch takes half a second. A digit on a clean link is a fault.' },
  rush: 'Watched the reply times, missed the static, and the relief team lost contact.',
  captions: { 'static on the line': 'line static hiss', 'dropped clean link': 'carrier lost click' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, late = m.calm ? 2.8 : 2.0, need = 10;
    m.links = LINKS.map((n, i) => { const ev = []; let t = rf(r, 1.2, 2.4) + i * rf(r, 0.6, 1.6); for (let k = 0; k < 3; k++) { ev.push(+t.toFixed(2)); t += rf(r, 3.2, 5.5); } return { n, ev, route: 0, onset: null, sw: 0, over: 0, reply: Math.round(rf(r, 18, 34)) }; });
    m.clean = 0; m.rounds = need; m.round = 0;
    const lvl = (L) => L.onset == null ? 0.12 : Math.min(0.92, 0.12 + (m.t - L.onset) / 0.6 * 0.8);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d) return false; const L = m.links[d - 1]; if (!L || L.sw > 0) return true;
      if (lvl(L) < LINE) m.fault('dropped clean link'); L.route ^= 1; L.onset = null; L.over = 0; L.sw = 0.5; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; let ok = true;
      for (const L of m.links) {
        if (L.ev.length && m.t >= L.ev[0]) { L.ev.shift(); if (L.onset == null) L.onset = m.t; }
        if (L.sw > 0) { L.sw -= dt; ok = false; continue; }
        if (lvl(L) >= LINE) { ok = false; L.over += dt; if (L.over > late) { m.fault('static on the line'); L.over = 0; } }
      }
      if (ok) { m.clean += dt; m.round = Math.floor(m.clean); if (m.clean >= need) m.win(); }
    };
    m.hint = () => { const i = m.links.findIndex(L => L.sw <= 0 && lvl(L) >= LINE); return i >= 0 ? [['Digit' + (i + 1), true]] : []; };
    m.bad = () => 'Digit1';
    m.view = () => ({ e: m.links.map(L => L.ev) });
    m.buttons = () => [['Digit1', '1 Sickbay route'], ['Digit2', '2 Bridge route']];
    m.draw = (c, W, H, P) => {
      m.links.forEach((L, i) => {
        const y = 12 + i * 58, v = lvl(L), bad = v >= LINE && L.sw <= 0; box(c, 10, y, W - 20, 50, 'rgba(255,255,255,.04)', bad ? P.bad : null, 8);
        txt(c, `${i + 1} ${L.n} · route ${L.route ? 'BACKUP' : 'PRIMARY'}`, 20, y + 18, { size: 12, col: COL.gold });
        txt(c, `reply ${L.reply} ms ✓`, 20, y + 38, { size: 11, col: COL.dim });
        txt(c, L.sw > 0 ? 'switching…' : bad ? '▲ STATIC' : '● clean', 300, y + 18, { size: 11, col: L.sw > 0 ? COL.peri : bad ? P.bad : P.good });
        bar(c, 130, y + 30, 160, 10, v, { mark: LINE, col: bad ? P.bad : COL.lav }); txt(c, 'noise', 300, y + 39, { size: 10, col: COL.dim });
      });
      txt(c, `Held clean ${m.clean.toFixed(1)} / ${need} s`, 14, H - 10, { size: 12, col: COL.pale }); bar(c, 170, H - 20, 210, 8, m.clean / need, { col: P.good });
    };
    return m;
  },
});
