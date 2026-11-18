// Yeoman: print the drill checklist for the captain. The template library holds several copies of each drill checklist: superseded revisions
// (stamped with a dated watermark) and, for the current revision, sometimes a draft copy with a step line missing. Leaf through the copies
// (Space) and print (Enter) only the current revision with every step number in sequence. An old list or a gapped one goes to the captain.
import { define, machine, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const DRILLS = ['Hull breach, deck 4', 'Fire in main engineering', 'Abandon ship muster', 'Warp core ejection', 'Intruder alert', 'Toxic leak in cargo bay'];
const STEPS = ['Sound the alarm', 'Seal the bulkheads', 'Muster at stations', 'Report to the bridge', 'Don emergency masks', 'Clear the corridor', 'Check the roll', 'Stand down on order'];

export default define({
  job: { billet: 'yeoman', label: 'Print drill checklist for captain', type: 'task:shakedown' },
  title: 'Leaf to the current, complete checklist', dept: 'command', host: 'console', tool: 'Drill template library and printer',
  how: 'Leaf through the library copies of the drill checklist (Space). Print (Enter) only the copy with no superseded watermark and every step number present in order.',
  keys: ['Space next copy', 'Enter print'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'vet and print', input: 'space+enter', win: 'three drill checklists printed from the current revision with no numbered step line missing',
    fail: 'printing a superseded revision or a draft whose step numbering skips a line',
    rule: 'Space shows the next copy in the library. A copy watermarked SUPERSEDED is stale; a current copy whose step numbers jump (1, 2, 4…) is a draft with a missing step. Press Enter on the one current copy with an unbroken sequence.' },
  rush: 'Printed whatever version was open last time.',
  captions: { 'old list': 'printer whirrs: stale copy', 'missing step': 'printer whirrs: gapped copy' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.drills = shuffle(r, DRILLS).slice(0, 3).map(name => {
      const n = ri(r, 4, 6), steps = shuffle(r, STEPS).slice(0, n), rev = ri(r, 4, 9), cur = { rev, date: `SD ${ri(r, 470, 479)}.${ri(r, 1, 9)}`, steps: steps.map((s, i) => [i + 1, s]) };
      const copies = [cur, { ...cur, rev: rev - 1, old: true, date: `SD ${ri(r, 440, 466)}.${ri(r, 1, 9)}` }, { ...cur, rev: rev - 2, old: true, date: `SD ${ri(r, 400, 438)}.${ri(r, 1, 9)}` }];
      const gapAt = ri(r, 1, n - 2); copies.push({ ...cur, steps: cur.steps.filter((_, i) => i !== gapAt), gap: true });
      const lib = shuffle(r, copies); if (lib[0] === cur) lib.push(lib.shift()); return { name, lib };
    });
    m.k = 0; m.i = 0; m.rounds = 3; m.round = 1;
    const copy = () => m.drills[m.k]?.lib[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (down) m.i = (m.i + 1) % m.drills[m.k].lib.length; return true; }
      if (!ENTER(code)) return false; if (!down) return true; const c = copy();
      if (c.old) { m.fault('old list'); return true; } if (c.gap) { m.fault('missing step'); return true; }
      m.k++; m.i = 0; if (m.k >= 3) m.win(); else m.round = m.k + 1; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const c = copy(); if (!c) return []; return [[c.old || c.gap ? 'Space' : 'Enter', true]]; };
    m.bad = () => { const c = copy(); if (!c) return null; return c.old || c.gap ? 'Enter' : 'Space'; };
    m.view = () => ({ d: m.drills.map(d => [d.name, d.lib.map(c => [c.rev, !!c.old, !!c.gap, c.steps.length])]) });
    m.buttons = () => [['Space', 'Next copy'], ['Enter', 'Print']];
    m.draw = (c, W, H, P) => {
      const d = m.drills[m.k], cp = copy(); if (!d) return; txt(c, `DRILL ${m.k + 1}/3 · ${d.name}`, 10, 16, { size: 11, col: COL.peri });
      txt(c, `copy ${m.i + 1} of ${d.lib.length}`, 390, 16, { size: 10, align: 'right', col: COL.dim });
      box(c, 40, 24, 320, 140, 'rgba(247,242,230,.92)', COL.lav, 4); txt(c, `Rev ${cp.rev} · ${cp.date}`, 52, 42, { size: 11, col: '#2a2440' });
      cp.steps.forEach(([nn, s], j) => txt(c, `${nn}. ${s}`, 60, 62 + j * 16, { size: 11, col: '#1a1630', w: 600 }));
      if (cp.old) { c.save(); c.translate(200, 100); c.rotate(-0.3); txt(c, `SUPERSEDED ${cp.date}`, 0, 0, { size: 20, align: 'center', col: 'rgba(255,90,72,.55)' }); c.restore(); }
      txt(c, cp.old ? '▲ superseded' : 'current revision', 352, 42, { size: 9, align: 'right', col: cp.old ? P.bad : '#2a6a3a' });
    };
    return m;
  },
});
