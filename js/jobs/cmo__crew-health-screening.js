// CMO: crew health screening. Each crewman's fatigue-marker counts are plotted over four monthly screenings. Flag (digit) only those on a
// steady slide, each of the last three screenings lower than the one before; one bad number that bounces back, or a single low reading
// on an otherwise flat line, is noise. Send the list to the XO (Space). Two departments to screen.
import { define, machine, DIG, SPACE, ri, rf, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Abara', 'Brenn', 'Castellan', 'Dsouza', 'Erriko', 'Faal', 'Grieve', 'Hollis', 'Iwata', 'Jorund', 'Kesh', 'Lomax', 'Mbeki', 'Nadir', 'Osei', 'Pell'];
export default define({
  job: { billet: 'cmo', label: 'Crew health screening', type: 'loop' },
  title: 'Three-screening slide flag', dept: 'medical', host: 'console', tool: 'Screening trend sheet',
  how: 'Each line is one crewman over four screenings. Toggle a flag (1 – 6) on anyone sliding down at every one of the last three screenings, leave one-off dips alone, then send the list (Space).',
  keys: ['1 – 6 flag / unflag', 'Space send to the XO'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'flag the slide', input: 'digits+space', win: 'both screening sheets sent with exactly the crewmen on a steady three-screening decline flagged',
    fail: 'flagging a one-off noisy dip, or sending the sheet with a creeping decline unflagged',
    rule: 'Read each four-point trend line. A slide means each of the last three points is lower than the one before. A single low point that recovers, or a flat line ending low once, is noise. Digit toggles, Space sends.' },
  rush: 'Flagged everyone with a low number this month and let the XO sort it out.',
  captions: { 'flagged noise': 'XO sends the sheet back', 'missed a decline': 'XO sends the sheet back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, NAMES);
    const mk = (kind) => { const b = rf(r, 0.55, 0.8); if (kind === 'slide') { const s = rf(r, 0.07, 0.11); return [b, b - s, b - 2 * s - rf(r, 0, 0.02), b - 3 * s]; }
      if (kind === 'dip') { const k = ri(r, 1, 2), v = [b, b + rf(r, -0.02, 0.02), b + rf(r, -0.02, 0.02), b + rf(r, -0.02, 0.02)]; v[k] -= rf(r, 0.2, 0.26); return v; }
      if (kind === 'last') return [b, b + rf(r, 0, 0.03), b + rf(r, 0, 0.03), b - rf(r, 0.18, 0.24)];
      return [b, b + rf(r, 0, 0.03), b + rf(r, -0.03, 0.03), b + rf(r, -0.03, 0.03)]; };
    m.sheets = [0, 1].map(k => { const ns = ri(r, 1, 2), kinds = shuffle(r, [...Array(ns).fill('slide'), 'dip', r() < 0.5 ? 'last' : 'dip', ...Array(4 - ns).fill('flat')]);
      return kinds.map((kind, j) => ({ name: names[k * 6 + j], kind, v: mk(kind), flag: false })); });
    m.k = 0; m.rounds = 2; m.round = 0; m.flash = '';
    const S = () => m.sheets[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (!(d >= 1 && d <= 6) && !SPACE(code)) return false; if (!down) return true; const sh = S();
      if (d) { sh[d - 1].flag = !sh[d - 1].flag; m.flash = ''; return true; }
      const noise = sh.some(p => p.flag && p.kind !== 'slide'), miss = sh.some(p => !p.flag && p.kind === 'slide');
      if (noise) { m.fault('flagged noise'); m.flash = 'returned: a flagged line is only noise'; return true; }
      if (miss) { m.fault('missed a decline'); m.flash = 'returned: a steady decline is unflagged'; return true; }
      m.round++; m.flash = 'sheet sent to the XO'; if (++m.k >= 2) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const sh = S(); if (!sh) return []; const j = sh.findIndex(p => p.flag !== (p.kind === 'slide')); return j >= 0 ? [['Digit' + (j + 1), true], ['Digit' + (j + 1), false]] : [['Space', true], ['Space', false]]; };
    m.bad = () => 'Space';
    m.view = () => ({ s: m.sheets.map(sh => sh.map(p => p.kind)) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6].map(n => ['Digit' + n, String(n)]), ['Space', 'Send']];
    m.draw = (c, W, H, P) => {
      const sh = S() || m.sheets[1]; txt(c, `Screening sheet ${Math.min(m.k + 1, 2)} / 2 · four monthly screenings, oldest left`, 12, 16, { size: 11, col: COL.dim });
      sh.forEach((p, j) => { const x = 12 + (j % 3) * 128, y = 26 + Math.floor(j / 3) * 66;
        box(c, x, y, 120, 60, COL.panel, p.flag ? P.bad : 'rgba(255,255,255,.15)'); txt(c, `${j + 1} ${p.name}`, x + 6, y + 13, { size: 11, col: p.flag ? P.bad : COL.ink });
        if (p.flag) txt(c, '⚑ FLAG', x + 114, y + 13, { size: 10, align: 'right', col: P.bad });
        c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); p.v.forEach((v, q) => { const px = x + 12 + q * 32, py = y + 56 - v * 42; q ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke();
        p.v.forEach((v, q) => { c.fillStyle = COL.pale; c.fillRect(x + 10 + q * 32, y + 54 - v * 42, 4, 4); }); });
      txt(c, m.flash, 200, 166, { size: 11, align: 'center', col: COL.warn });
    };
    return m;
  },
});
