// Doctor: walk-in clinic and fitness checks. Each walk-in sits at the desk. Shine the desk lamp (Space) to see the pupils and the whites of the
// eyes, put the forehead probe on (Enter) and wait for the steady beep, then stamp the duty sheet: 1 TREAT, 2 REFER, 3 FIT. Unequal pupils (a
// concussion) or yellowed eyes go to REFER; a fever of 38.0 or more is TREAT; anyone with neither is FIT. Stamping before the lamp and a steady
// probe reading is a fault; stamping a feverish or concussed crewman FIT is the worst one.
import { define, machine, SPACE, ENTER, DIG, rf, ri, pick, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const STAMP = ['', 'TREAT', 'REFER', 'FIT'];
export default define({
  job: { billet: 'doc', label: 'Walk-in clinic and fitness checks', type: 'loop' },
  title: 'Lamp, probe and duty stamp', dept: 'medical', host: 'console', tool: 'Clinic desk and duty sheet',
  how: 'Space shines the lamp on the eyes, Enter puts the forehead probe on; wait for the steady beep, then stamp 1 TREAT (fever), 2 REFER (unequal pupils or yellow eyes) or 3 FIT.',
  keys: ['Space lamp', 'Enter probe', '1 treat · 2 refer · 3 fit'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'lamp, probe, stamp', input: 'space+enter+digits', win: 'four walk-ins examined under the lamp, probe read to a steady beep and the duty line stamped treat, refer or fit',
    fail: 'stamping a fevered or concussed crewman fit, or stamping before the lamp and a steady probe reading',
    rule: 'Lamp first (Space), probe second (Enter). The probe climbs for a second or two: stamp only after the steady beep. Refer beats treat; fit only when eyes and temperature are both normal.' },
  rush: 'Asked each walk-in if they felt all right and stamped them fit.',
  captions: { 'stamped fit sick': 'duty stamp thumps', unexamined: 'stamp thumps early', 'wrong stamp': 'duty stamp thumps' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, ['Ens. Morrow', 'PO Ilsa Dane', 'Lt. Achebe', 'Crewman Pell', 'Ens. Soto', 'Lt. Haraldsen', 'Crewman Yue']);
    const kinds = shuffle(r, ['fever', 'conc', 'fit', pick(r, ['jaund', 'fit', 'fever', 'conc'])]), settle = m.calm ? 1.2 : 1.5;
    m.q = kinds.map((k, i) => ({ who: names[i], k, temp: +(k === 'fever' ? rf(r, 38.1, 39.4) : rf(r, 36.4, 37.4)).toFixed(1), pl: ri(r, 3, 4), pr: 0, yellow: k === 'jaund', lampOn: false, probeT: -1,
      meal: pick(r, ['ration bar', 'soup', 'nothing since yesterday', 'galley curry']), pain: pick(r, ['headache', 'none', 'sore throat', 'stiff neck']) }));
    for (const p of m.q) p.pr = p.k === 'conc' ? p.pl + ri(r, 2, 3) : p.pl;
    m.i = 0; m.rounds = m.q.length; m.round = 1;
    const cur = () => m.q[m.i], steady = (p) => p.probeT >= 0 && m.t - p.probeT >= settle;
    const right = (p) => p.k === 'conc' || p.k === 'jaund' ? 2 : p.k === 'fever' ? 1 : 3;
    const shown = (p) => p.probeT < 0 ? null : steady(p) ? p.temp : +(35.0 + (p.temp - 35.0) * Math.min(1, (m.t - p.probeT) / settle)).toFixed(1);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const p = cur(), d = DIG(code);
      if (SPACE(code)) { p.lampOn = true; return true; }
      if (ENTER(code)) { if (p.probeT < 0) p.probeT = m.t; return true; }
      if (d >= 1 && d <= 3) {
        if (!p.lampOn || !steady(p)) { m.fault('unexamined'); return true; }
        if (d !== right(p)) { m.fault(d === 3 ? 'stamped fit sick' : 'wrong stamp'); return true; }
        m.ev('stamp', { who: p.who, d }); if (++m.i >= m.q.length) m.win(); else m.round++; return true;
      }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = cur(); if (!p) return []; if (!p.lampOn) return [['Space', true]]; if (p.probeT < 0) return [['Enter', true]]; return steady(p) ? [['Digit' + right(p), true]] : []; };
    m.bad = () => 'Digit3';
    m.view = () => ({ q: m.q.map(p => [p.who, p.k, p.temp, p.pl, p.pr]) });
    m.buttons = () => [['Space', 'Lamp'], ['Enter', 'Probe'], ['Digit1', '1 Treat'], ['Digit2', '2 Refer'], ['Digit3', '3 Fit']];
    m.draw = (c, W, H, P) => {
      const p = cur(); if (!p) return; txt(c, `Walk-in ${m.i + 1}/${m.q.length}: ${p.who}`, 16, 22, { size: 14, col: COL.gold });
      txt(c, `pain: ${p.pain} · last meal: ${p.meal}`, 16, 40, { size: 11, col: COL.dim });
      box(c, 16, 50, 170, 70, p.lampOn ? 'rgba(255,240,200,.12)' : 'rgba(0,0,0,.35)', COL.peri);
      if (p.lampOn) { for (const [x, s] of [[60, p.pl], [140, p.pr]]) { c.beginPath(); c.arc(x, 85, 20, 0, 6.283); c.fillStyle = p.yellow ? '#e8d26a' : '#f3eee6'; c.fill(); c.beginPath(); c.arc(x, 85, s * 2.2, 0, 6.283); c.fillStyle = '#111'; c.fill(); }
        txt(c, `pupils ${p.pl} / ${p.pr} mm${p.pl !== p.pr ? ' UNEQUAL' : ''}${p.yellow ? ' · whites YELLOW' : ''}`, 18, 134, { size: 11, col: p.pl !== p.pr || p.yellow ? P.bad : COL.ink }); }
      else txt(c, 'lamp off (Space)', 50, 90, { size: 12, col: COL.dim });
      const v = shown(p); txt(c, 'forehead probe', 210, 62, { size: 11, col: COL.dim });
      txt(c, v == null ? '-- . -' : `${v.toFixed(1)} °C`, 210, 92, { size: 24, col: v != null && v >= 38 ? P.bad : COL.ink });
      if (p.probeT >= 0) { bar(c, 210, 102, 160, 8, Math.min(1, (m.t - p.probeT) / settle), { col: COL.peri }); if (steady(p)) { lamp(c, 360, 84, 8, P.good, 'circle'); txt(c, 'BEEP steady', 290, 124, { size: 11, col: P.good }); } }
      txt(c, '1 TREAT  ·  2 REFER  ·  3 FIT', 16, 158, { size: 12, col: COL.pale });
    };
    return m;
  },
});
