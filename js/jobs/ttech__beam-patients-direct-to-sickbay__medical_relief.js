// Transporter tech: beam patients direct to sickbay. The sickbay bed panel is a grid of beds; the patient list gives each stretcher its bed.
// Move the bed cursor (arrows) to the patient's bed and hold energize (Space) until the bed panel shows them arrived. Sickbay re-assigns a
// bed partway through the run (the call comes in as a list update), so read the list again before every beam. Letting go of energize
// before the pattern lands aborts the beam; landing a patient in any bed but the assigned one is a wrong bed.
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Beam patients direct to sickbay', type: 'task:medical_relief' },
  title: 'Bed-targeted patient beam-in', dept: 'operations', host: 'console', tool: 'Sickbay bed panel',
  how: 'Move the cursor to the patient’s bed on the panel and hold Space until they land. Sickbay may re-assign a bed: always re-read the list before you beam.',
  keys: ['Arrows move the bed cursor', 'Space hold energize'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'beam to bed', input: 'arrows+space-hold', win: 'three stretcher patients each landed in their currently assigned sickbay bed with energize held through the transfer',
    fail: 'releasing energize mid-transfer, or landing a patient in a stale or wrong bed after a re-assignment',
    rule: 'Read the patient’s bed on the list (a re-assignment crosses out the old number), put the cursor on that bed, then hold Space until the transfer bar fills and the bed shows ARRIVED.' },
  rush: 'Beamed the stretchers to the first free beds and let sickbay sort them out.',
  captions: { aborted: 'beam whine cuts out', 'wrong bed': 'sickbay: wrong bed!' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, XFER = m.calm ? 1.6 : 1.2;
    const beds = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8]);
    m.pts = ['Lt. Vael', 'Ens. Moreau', 'Crewman Ido'].map((n, i) => ({ n, bed: beds[i], old: null, done: false }));
    m.re = { who: ri(r, 1, 2), to: beds[3 + ri(r, 0, 2)] }; m.occ = new Set(); m.k = 0; m.cx = ri(r, 0, 3); m.cy = ri(r, 0, 1); m.x = 0; m.msg = ''; m.rounds = 3; m.round = 0;
    const bedAt = () => m.cy * 4 + m.cx + 1;
    m.key = (code, down = true) => {
      const a = ARROW(code); if (a) { if (m.state === 'play' && down && !m.held.S) { if (a === 'L') m.cx = Math.max(0, m.cx - 1); if (a === 'R') m.cx = Math.min(3, m.cx + 1); if (a === 'U') m.cy = 0; if (a === 'D') m.cy = 1; } return true; }
      if (!SPACE(code)) return false; if (m.state !== 'play') return true;
      if (!down && m.held.S && m.x > 0 && m.x < XFER) { m.fault('aborted'); m.x = 0; }
      m.held.S = !!down; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const p = m.pts[m.k]; if (!p || !m.held.S) return;
      m.x += dt; if (m.x < XFER) return; m.x = 0; m.held.S = false;
      const b = bedAt(); if (b !== p.bed) { m.fault('wrong bed'); return; }
      p.done = true; m.occ.add(b); m.k++; m.round++; if (m.k >= 3) { m.win(); return; }
      if (m.k === m.re.who) { const q = m.pts[m.k]; q.old = q.bed; q.bed = m.re.to; m.msg = `SICKBAY: ${q.n} now bed ${q.bed} (was ${q.old})`; }
    };
    m.hint = () => { const p = m.pts[m.k]; if (!p) return [['Space', false]]; const tx = (p.bed - 1) % 4, ty = Math.floor((p.bed - 1) / 4);
      if (m.held.S) return [['Space', true]]; if (tx !== m.cx) return [[tx < m.cx ? 'ArrowLeft' : 'ArrowRight', true]]; if (ty !== m.cy) return [[ty < m.cy ? 'ArrowUp' : 'ArrowDown', true]]; return [['Space', true]]; };
    m.bad = () => ['Space', Math.floor(m.t * 4) % 2 === 0];
    m.view = () => ({ beds: m.pts.map(p => p.bed), re: [m.re.who, m.re.to] });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Energize (hold)']];
    m.draw = (c, W, H, P) => {
      m.pts.forEach((p, i) => { const y = 22 + i * 20, cur = i === m.k; txt(c, `${cur ? '▶ ' : ''}${p.n}`, 16, y, { size: 11, col: p.done ? COL.dim : cur ? COL.ink : COL.pale });
        txt(c, p.old ? `bed ${p.bed} (was ${p.old})` : `bed ${p.bed}`, 140, y, { size: 11, col: p.old ? COL.warn : COL.ink }); if (p.done) txt(c, '✓', 200, y, { size: 11, col: P.good }); });
      if (m.msg) txt(c, m.msg, 16, 90, { size: 10, col: COL.warn });
      for (let b = 1; b <= 8; b++) { const x = 220 + ((b - 1) % 4) * 42, y = 14 + Math.floor((b - 1) / 4) * 50, sel = bedAt() === b;
        box(c, x, y, 38, 44, m.occ.has(b) ? 'rgba(79,208,106,.2)' : 'rgba(255,255,255,.06)', sel ? COL.peri : null, 4); txt(c, b, x + 19, y + 18, { size: 12, align: 'center' });
        if (m.occ.has(b)) txt(c, 'ARRIVED', x + 19, y + 36, { size: 7, col: P.good, align: 'center' }); }
      txt(c, m.held.S ? 'ENERGIZING' : 'energize up', 16, 128, { size: 11, col: m.held.S ? COL.warn : COL.dim }); bar(c, 16, 136, 180, 10, m.x / XFER, { col: COL.peri });
    };
    return m;
  },
});
