// Chief science officer: full sensor array diagnostic. Press each channel's test button (1-6) and read its lamp and error code. A contact
// fault (E2 / E4) is a loose module: hold Space to pull it out of the rack and let go to reseat it. A no-response fault (E9) is a dead module:
// swap in a spare (Enter). Then test the channel again to prove it green. Pulling a healthy module, reseating a dead one or swapping a merely
// loose one is a fault. The diagnostic is done when every channel has tested green.
import { define, machine, SPACE, ENTER, DIG, ri, shuffle, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cso', label: 'Full sensor array diagnostic', type: 'task:shakedown' },
  title: 'Rack module reseat or swap', dept: 'sciences', host: 'console', tool: 'Array self-test board and rack',
  how: 'Test each channel (1-6). E2 / E4 = loose: hold Space to pull the module, let go to reseat it. E9 = dead: Enter swaps in a spare. Test the channel again until every lamp is green.',
  keys: ['1-6 test channel', 'Space hold: pull and reseat', 'Enter swap spare'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'reseat or swap', input: 'digits+space-hold+enter', win: 'all six array channels self-tested, each loose module reseated and each dead module replaced, and every repaired channel retested green',
    fail: 'pulling a healthy module, reseating a dead module, or swapping a spare in for one that was only loose',
    rule: 'Digit tests a channel and shows its code. Contact code E2 or E4: hold Space a full second (pull) and release (reseat). No-response E9: Enter for a spare. Retest after any repair.' },
  rush: 'Reran the self-test until it happened to come up green.',
  captions: { 'pulled healthy module': 'rack clunk', 'reseated dead module': 'dead click', 'swapped good part': 'spare wasted thunk' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, pullT = m.calm ? 0.8 : 1.0, ix = shuffle(r, [0, 1, 2, 3, 4, 5]);
    m.ch = [...Array(6)].map(() => ({ st: 'ok', code: 'OK', tested: false, fixed: false }));
    m.ch[ix[0]].st = 'loose'; m.ch[ix[1]].st = r() < 0.5 ? 'loose' : 'dead'; if (r() < 0.5) m.ch[ix[2]].st = 'dead';
    for (const c of m.ch) c.code = c.st === 'loose' ? (r() < 0.5 ? 'E2' : 'E4') : c.st === 'dead' ? 'E9' : 'OK';
    m.sel = -1; m.h = 0; m.pulling = false; m.dn = {}; m.bf = 0;
    const bad = (c) => c.st !== 'ok' && !c.fixed, done = (c) => c.tested && !bad(c);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (d >= 1 && d <= 6) { if (down && !m.dn[code]) { m.sel = d - 1; m.ch[m.sel].tested = true; m.h = 0; m.pulling = false; if (m.ch.every(done)) m.win(); } m.dn[code] = down; return true; }
      if (SPACE(code)) { if (down && !m.dn.S) { m.pulling = m.sel >= 0; m.h = 0; } if (!down && m.dn.S && m.pulling) { m.pulling = false; if (m.h >= pullT) { const c = m.ch[m.sel];
        if (c.st === 'ok' || c.fixed) m.fault('pulled healthy module'); else if (c.st === 'dead') m.fault('reseated dead module'); else { c.fixed = true; c.tested = false; } } m.h = 0; } m.dn.S = down; return true; }
      if (ENTER(code)) { if (down && !m.dn[code] && m.sel >= 0) { const c = m.ch[m.sel]; if (c.st === 'dead' && !c.fixed) { c.fixed = true; c.tested = false; } else m.fault('swapped good part'); } m.dn[code] = down; return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.pulling) m.h += dt; };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => {
      const k = m.ch.findIndex(c => !done(c)); if (k < 0) return []; const c = m.ch[k];
      if (m.sel !== k || !c.tested) return [['Space', false], ...tap('Digit' + (k + 1))];
      if (c.st === 'dead') return tap('Enter'); return [['Space', m.h < pullT + 0.05]];
    };
    m.bad = () => (++m.bf % 4 < 2 ? ['Digit1', m.bf % 4 === 0] : ['Enter', m.bf % 4 === 2]);
    m.view = () => ({ ch: m.ch.map(c => c.code).join(',') });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6].map(n => ['Digit' + n, 'Test ' + n]), ['Space', 'Pull (hold)'], ['Enter', 'Swap spare']];
    m.draw = (c, W, H, P) => {
      m.ch.forEach((k, i) => { const x = 14 + i * 62, show = k.tested, g = show && !bad(k); box(c, x, 14, 56, 62, 'rgba(255,255,255,.05)', i === m.sel ? COL.gold : null, 5);
        txt(c, `CH ${i + 1}`, x + 28, 30, { size: 10, align: 'center', col: COL.dim }); lamp(c, x + 28, 48, 10, !show ? '#333' : g ? P.good : P.bad, !show ? 'circle' : g ? 'circle' : 'triangle');
        txt(c, !show ? 'untested' : k.fixed && !bad(k) ? 'GREEN' : k.code, x + 28, 70, { size: 10, align: 'center', col: show ? COL.ink : COL.dim }); });
      txt(c, 'CODE TABLE  E2 / E4 contact → reseat module   E9 no response → swap spare', 14, 98, { size: 10, col: COL.pale });
      txt(c, 'MODULE PULL', 14, 122, { size: 10, col: COL.dim }); bar(c, 100, 113, 200, 12, m.h / pullT, { mark: 1, col: m.h >= pullT ? P.good : COL.gold });
      txt(c, m.h >= pullT ? 'out — let go to reseat' : m.pulling ? 'pulling…' : '', 310, 122, { size: 10, col: COL.ink });
      txt(c, `channels green ${m.ch.filter(done).length} / 6`, 14, 152, { size: 11, col: COL.pale });
    };
    return m;
  },
});
