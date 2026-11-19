// Counsellor: support medical staff through triage. Stand at the triage desk where you can see three nurses. Each one's hands shake more the
// longer they go; a nurse's hands come free for a moment between patients: hold Space then to put a hot drink in them (pressing while their
// hands are busy spills it). Each nurse's floor clock runs too: once a nurse passes four hours, select them (← / →) and press Enter to have the
// physician relieve them. Pulling someone off early, or letting a nurse run on past four hours or break down, fails the support.
import { define, machine, ARROW, SPACE, ENTER, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const NURSES = ['Nurse Abiola', 'Nurse Kerr', 'Nurse Lindqvist', 'Nurse Tavi', 'Nurse Moreau', 'Nurse Patil'];
export default define({
  job: { billet: 'counsel', label: 'Support medical staff through triage', type: 'task:medical_relief' },
  title: 'Triage desk relief and hot drinks', dept: 'medical', host: 'console', tool: 'Triage clipboards, water cup, desk board',
  how: 'Select a nurse with ← / →. Hold Space to hand a drink only while their hands are FREE, to steady a shake. When a nurse passes 4 h on the floor, press Enter to have them relieved.',
  keys: ['← / → nurse', 'Space hold: hand a drink', 'Enter send relief'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'steady and relieve', input: 'arrows+space-hold+enter', win: 'the triage queue cleared with every nurse steadied with a drink in a free moment and relieved once past four hours',
    fail: 'spilling a drink into busy hands, relieving a nurse who could keep going, or a nurse who runs past four hours or breaks down',
    rule: 'Hold Space 0.5 s on a nurse whose lamp says FREE to lower their shake. Enter on a nurse at 4 h or more sends them off and brings a fresh one; earlier is a fault.' },
  rush: 'Told the nurses to pace themselves and went back to the office.',
  captions: { spilled: 'cup clatters', 'pulled too soon': 'nurse protests', 'no relief': 'physician frowns', 'broke down': 'nurse sobs at the desk' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, free = m.calm ? 1.2 : 0.9, rate = 0.15;
    m.ns = shuffle(r, NURSES).slice(0, 3).map(n => ({ n, h: rf(r, 1.6, 3.4), sh: rf(r, 0.2, 0.45), busy: true, c: rf(r, 0.3, 2.0), drink: 0, rel: false }));
    m.sel = 1; m.done = 0; m.need = 12; m.pc = 0; m.rounds = 12; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), x = m.ns[m.sel];
      if (a === 'L' || a === 'R') { if (down) { m.sel = Math.max(0, Math.min(2, m.sel + (a === 'R' ? 1 : -1))); m.held.S = false; x.drink = 0; } return true; }
      if (SPACE(code)) { if (down && !m.held.S && x.busy) { m.fault('spilled'); } m.held.S = down; if (!down) x.drink = 0; return true; }
      if (ENTER(code)) { if (!down) return true; if (x.h < 3.8) { m.fault('pulled too soon'); return true; } x.h = 0; x.sh = 0.1; x.rel = true; return true; }
      return !!a;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      for (const [i, x] of m.ns.entries()) {
        x.h += rate * dt; x.sh += 0.045 * dt; x.c -= dt; if (x.c <= 0) { x.busy = !x.busy; x.c = x.busy ? rf(r, 1.4, 2.4) : free; if (x.busy && i === m.sel) x.drink = 0; }
        if (x.h > 4.6) { m.fault('no relief'); x.h = 0; x.sh = 0.1; } if (x.sh >= 1) { m.fault('broke down'); x.sh = 0.4; }
      }
      const x = m.ns[m.sel]; if (m.held.S && !x.busy) { x.drink += dt; if (x.drink >= 0.5) { x.sh = Math.max(0, x.sh - 0.5); x.drink = -99; } }
      m.pc += dt; if (m.pc >= 1.6) { m.pc = 0; m.done++; m.round = m.done; if (m.done >= m.need) m.win(); }
    };
    const go = (i) => [[i > m.sel ? 'ArrowRight' : 'ArrowLeft', true], ['Space', false]];
    m.hint = () => {
      const late = m.ns.findIndex(x => x.h >= 4.0); if (late >= 0) return late === m.sel ? [['Space', false], ['Enter', true]] : go(late);
      const cur = m.ns[m.sel]; if (m.held.S && !cur.busy && cur.drink >= 0) return [['Space', true]];
      const th = m.ns.findIndex(x => x.sh > 0.5 && !x.busy && x.c > 0.65); if (th >= 0) return th === m.sel ? [['Space', true]] : go(th);
      return m.held.S ? [['Space', false]] : [];
    };
    m.bad = () => (m.ns[m.sel].busy ? ['Space', !m.held.S] : ['Enter', true]);
    m.view = () => ({ ns: m.ns.map(x => [x.n, +x.h.toFixed(2), +x.sh.toFixed(2), +x.c.toFixed(2)]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Hand a drink (hold)'], ['Enter', 'Send relief']];
    m.draw = (c, W, H, P) => {
      txt(c, `Triage queue: ${m.need - m.done} waiting`, 14, 16, { size: 12, col: COL.gold });
      m.ns.forEach((x, i) => { const X = 10 + i * 128, on = i === m.sel; box(c, X, 26, 122, 136, on ? 'rgba(125,151,232,.14)' : 'rgba(255,255,255,.04)', on ? COL.peri : null, 6);
        txt(c, x.n.replace('Nurse ', ''), X + 8, 44, { size: 11, col: COL.pale }); lamp(c, X + 108, 40, 8, x.busy ? COL.warn : P.good, x.busy ? 'triangle' : 'circle'); txt(c, x.busy ? 'BUSY' : 'FREE', X + 96, 58, { size: 9, align: 'right', col: x.busy ? COL.warn : P.good });
        txt(c, `floor ${x.h.toFixed(1)} h`, X + 8, 76, { size: 10, col: x.h >= 4 ? P.bad : COL.dim }); bar(c, X + 8, 82, 106, 8, x.h / 5, { mark: 0.8, col: x.h >= 4 ? P.bad : COL.lav });
        txt(c, 'hand shake', X + 8, 106, { size: 10, col: COL.dim }); bar(c, X + 8, 112, 106, 8, x.sh, { col: x.sh > 0.6 ? P.bad : COL.warn });
        if (on && x.drink > 0) bar(c, X + 8, 132, 106, 8, x.drink / 0.5, { col: P.good }); if (x.rel) txt(c, 'fresh ✓', X + 8, 154, { size: 9, col: P.good }); });
    };
    return m;
  },
});
