// CMO: receive and triage arriving patients (medical relief). Stretchers come off the transporter one at a time: read breathing, bleeding
// and whether they walked, and tag them (1 red, 2 amber, 3 green). Meanwhile keep re-reading the amber group: any amber whose oxygen falls
// under 90 % has turned and must be moved up to red (↑ ↓ select, Space move to red) before they sit there too long.
import { define, machine, DIG, ARROW, SPACE, ri, rf, pick, shuffle, txt, box, COL } from './kit.js';

const INJ = ['crush injury', 'plasma burn', 'decompression', 'fracture', 'concussion', 'laceration'];
export default define({
  job: { billet: 'cmo', label: 'Receive and triage arriving patients', type: 'task:medical_relief' },
  title: 'Arrival tags and amber re-triage', dept: 'medical', host: 'console', tool: 'Arrival bay triage board',
  how: 'Tag each arriving stretcher 1 red, 2 amber or 3 green from breathing, bleeding and walking, and keep watching the amber list: move anyone whose oxygen drops under 90 % up to red (↑ ↓, Space).',
  keys: ['1 red', '2 amber', '3 green', '↑ ↓ select amber', 'Space move to red'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'tag and re-sort', input: 'digits+arrows+space', win: 'six arrivals tagged red amber or green by breathing bleeding and walking, and every amber that turned moved up to red in time',
    fail: 'mis-tagging an arrival, moving a stable amber up, or leaving a deteriorating amber parked in the amber zone',
    rule: 'Red: breathing over 30 or under 10, or severe bleeding. Green: walked in, breathing normal, no severe bleed. Otherwise amber. Watch the amber list; an oxygen reading under 90 % means move them up to red with Space.' },
  rush: 'Sent everyone who could talk to the green zone and the rest to surgery.',
  captions: { 'mis-tagged': 'nurse retags the stretcher', 'over-triage': 'surgeon sends them back', 'turned critical in amber': 'monitor alarm in amber zone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, late = m.calm ? 4.5 : 3.5;
    const kinds = shuffle(r, ['red', 'amber', 'amber', 'amber', 'green', pick(r, ['red', 'green', 'amber'])]);
    m.arr = kinds.map((k, j) => { const p = { id: j + 1, inj: pick(r, INJ), k, spo: ri(r, 93, 98), turn: null, tag: null, walked: k === 'green' };
      if (k === 'red') { if (r() < 0.5) { p.br = r() < 0.5 ? ri(r, 32, 40) : ri(r, 6, 9); p.bleed = pick(r, ['none', 'controlled']); } else { p.br = ri(r, 12, 26); p.bleed = 'severe'; } }
      else { p.br = ri(r, 12, 26); p.bleed = pick(r, ['none', 'controlled']); }
      return p; });
    const ambs = m.arr.filter(p => p.k === 'amber'); ambs[0].turn = rf(r, 1.2, 2.5); if (r() < 0.5) ambs[1].turn = rf(r, 1.5, 3);
    m.k = 0; m.sel = 0; m.rounds = 6; m.round = 0; m.flash = '';
    const amber = () => m.arr.filter(p => p.tag === 2), turned = (p) => p.turn != null && p.since >= p.turn;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), a = ARROW(code);
      if (!((d >= 1 && d <= 3) || a === 'U' || a === 'D' || SPACE(code))) return false; if (!down) return true;
      if (d) { const p = m.arr[m.k]; if (!p) return true; const want = p.k === 'red' ? 1 : p.k === 'amber' ? 2 : 3;
        if (d !== want) { m.fault('mis-tagged'); m.flash = 'check breathing, bleeding, walking'; return true; } p.tag = d; p.since = 0; m.k++; m.round++; m.flash = ''; return true; }
      const am = amber(); if (!am.length) return true;
      if (a) { m.sel = Math.max(0, Math.min(am.length - 1, m.sel + (a === 'D' ? 1 : -1))); return true; }
      const p = am[Math.min(m.sel, am.length - 1)]; if (!turned(p)) { m.fault('over-triage'); m.flash = 'that amber is stable'; return true; }
      p.tag = 1; p.moved = true; m.sel = 0; m.flash = `patient ${p.id} up to red, cuff on`; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return;
      for (const p of amber()) { p.since += dt; if (turned(p)) { p.spo = Math.max(78, 89 - Math.floor((p.since - p.turn) * 3)); if (p.since - p.turn > late && !p.late) { p.late = true; m.fault('turned critical in amber'); } } }
      if (m.k >= m.arr.length && m.arr.every(p => p.turn == null || p.moved)) m.win(); };
    m.hint = () => { const am = amber(), j = am.findIndex(turned);
      if (j >= 0) return m.sel === j ? [['Space', true]] : [[j > m.sel ? 'ArrowDown' : 'ArrowUp', true]];
      const p = m.arr[m.k]; return p ? [['Digit' + (p.k === 'red' ? 1 : p.k === 'amber' ? 2 : 3), true]] : []; };
    m.bad = () => { const p = m.arr[m.k]; return p ? 'Digit' + (p.k === 'green' ? 1 : 3) : 'Space'; };
    m.view = () => ({ a: m.arr.map(p => [p.k, p.br, p.bleed]) });
    m.buttons = () => [['Digit1', '1 red'], ['Digit2', '2 amber'], ['Digit3', '3 green'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['Space', 'To red']];
    m.draw = (c, W, H, P) => {
      const p = m.arr[m.k]; box(c, 10, 10, 180, 108, COL.panel, COL.gold); txt(c, p ? `Stretcher ${p.id} / 6 · ${p.inj}` : 'all stretchers in', 18, 28, { size: 12, col: COL.gold });
      if (p) { txt(c, `breathing ${p.br} /min`, 18, 52, { size: 12 }); txt(c, `bleeding: ${p.bleed}`, 18, 72, { size: 12, col: p.bleed === 'severe' ? P.bad : COL.ink }); txt(c, p.walked ? 'walked off the pad' : 'on the stretcher', 18, 92, { size: 12 }); }
      txt(c, 'AMBER ZONE', 206, 22, { size: 11, col: COL.warn }); const am = amber();
      am.forEach((q, j) => { const y = 32 + j * 22, t = turned(q); box(c, 204, y, 186, 19, COL.panel, j === m.sel ? COL.gold : null, 4);
        txt(c, `${j === m.sel ? '▶' : ' '} pt ${q.id}  SpO₂ ${q.spo} %${t ? '  ▼ FALLING' : ''}`, 210, y + 14, { size: 11, col: t ? P.bad : COL.ink }); });
      const reds = m.arr.filter(q => q.tag === 1).map(q => q.id), gr = m.arr.filter(q => q.tag === 3).map(q => q.id);
      txt(c, `RED ■ ${reds.join(' ') || '—'}   GREEN ● ${gr.join(' ') || '—'}`, 10, 140, { size: 11, col: COL.pale }); txt(c, m.flash, 390, 162, { size: 11, align: 'right', col: COL.warn });
    };
    return m;
  },
});
