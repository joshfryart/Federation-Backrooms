// Deck crew: meet the returning shuttle with the medical team. You hold the foot end of the stretcher as it comes down the ramp; the ramp's
// pitch changes as you go, so raise (Up) or lower (Down) your end to keep the level bubble in its ring. At the bottom the medic's trolley takes
// the weight gradually: call it (Space) only when the trolley reads full weight. Then give the handover in order: patient, injury, time (1-3).
import { define, machine, ARROW, SPACE, DIG, rf, shuffle, txt, box, bar, COL } from './kit.js';

const PARTS = ['patient', 'injury', 'time'];
export default define({
  job: { billet: 'deck', label: 'Meet returning shuttle with medical team', type: 'task:medical_relief' },
  title: 'Stretcher down the ramp and handover', dept: 'flight', host: 'console', tool: 'Stretcher level bubble and trolley scale',
  how: 'Hold Up or Down to raise or lower the foot end and keep the bubble in its ring down the ramp. Press Space once the trolley shows full weight, then press the handover cards in order: patient, injury, time.',
  keys: ['Up / Down hold: raise or lower your end', 'Space: trolley has it', '1-3: handover cards'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'carry level', input: 'arrows-hold+space+digits', win: 'two stretchers brought down the ramp level, released only at full trolley weight, and handed over patient, injury, time',
    fail: 'letting the stretcher tip out of level on the ramp, letting go before the trolley holds the weight, or a jumbled handover',
    rule: 'The ramp pitch ahead is drawn; your end height must match it so the bubble stays in the ring (out for half a second is a tip). The trolley weight climbs at the bottom: Space only at 100 %. Then cards 1-3 in the order patient, injury, time.' },
  rush: 'Took the stretcher down at a jog and shouted the patient’s name at the medic.',
  captions: { tipped: 'patient groans', 'let go early': 'stretcher lurches', 'unclear handover': 'medic asks again' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ring = m.calm ? 0.12 : 0.08, run = m.calm ? 6 : 5;
    m.cases = [0, 1].map(() => ({ A: rf(r, 0.2, 0.32), f: rf(r, 0.8, 1.3), ph: rf(r, 0, 6), cards: shuffle(r, PARTS), name: `${['Ens.', 'Lt.', 'Crew'][Math.floor(r() * 3)]} ${['Vale', 'Okoro', 'Shen', 'Mbeki', 'Ross', 'Tarn'][Math.floor(r() * 6)]}`, inj: ['burns', 'fracture', 'concussion', 'blood loss'][Math.floor(r() * 4)] }));
    m.c = 0; m.s = 0; m.h = 0; m.out = 0; m.wt = 0; m.stage = 'ramp'; m.said = 0; m.rounds = 2; m.round = 1;
    const C = () => m.cases[Math.min(m.c, m.cases.length - 1)];
    m.slope = (s) => { const k = C(); return k.A * Math.sin(6.283 * k.f * s + k.ph) - k.A * Math.sin(k.ph); };
    m.tilt = () => m.h - m.slope(m.s);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), n = DIG(code);
      if (a === 'U' || a === 'D') { m.held[a] = down; return true; }
      if (SPACE(code)) { if (!down || m.stage !== 'weight') return true; if (m.wt < 1) { m.fault('let go early'); m.wt = 0; return true; } m.stage = 'say'; return true; }
      if (n) { if (!down || m.stage !== 'say' || n > 3) return true; if (C().cards[n - 1] !== PARTS[m.said]) { m.fault('unclear handover'); m.said = 0; return true; }
        m.said++; if (m.said === 3) { m.ev('handover', { c: m.c }); m.c++; m.round = Math.min(2, m.c + 1); if (m.c >= 2) { m.win(); return true; } m.s = 0; m.h = 0; m.out = 0; m.wt = 0; m.said = 0; m.stage = 'ramp'; } return true; }
      return a ? true : false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.stage === 'ramp') { m.h += ((m.held.U ? 1 : 0) - (m.held.D ? 1 : 0)) * 0.7 * dt; m.s = Math.min(1, m.s + dt / run);
        if (Math.abs(m.tilt()) > ring) { m.out += dt; if (m.out > 0.5) { m.fault('tipped'); m.out = 0; m.h = m.slope(m.s); } } else m.out = 0;
        if (m.s >= 1) m.stage = 'weight'; }
      else if (m.stage === 'weight') m.wt = Math.min(1, m.wt + dt / 1.6);
    };
    m.hint = () => {
      if (m.stage === 'ramp') { const want = m.slope(Math.min(1, m.s + 0.03)), e = m.h - want; return [['ArrowUp', e < -0.01], ['ArrowDown', e > 0.01]]; }
      if (m.stage === 'weight') return m.wt >= 1 ? [['ArrowUp', false], ['ArrowDown', false], ['Space', true]] : [];
      return [['Digit' + (C().cards.indexOf(PARTS[m.said]) + 1), true]];
    };
    m.bad = () => (m.stage === 'ramp' ? ['ArrowUp', true] : m.stage === 'weight' ? 'Space' : 'Digit' + (C().cards.indexOf(PARTS[(m.said + 1) % 3]) + 1));
    m.view = () => ({ cases: m.cases.map(k => [+k.A.toFixed(2), k.cards.join()]) });
    m.buttons = () => [['ArrowUp', 'Raise'], ['ArrowDown', 'Lower'], ['Space', 'Trolley has it'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3']];
    m.draw = (c, W, H, P) => {
      const k = C(); if (!k) return; txt(c, `Stretcher ${m.c + 1} / 2 — ${m.stage === 'ramp' ? 'down the ramp' : m.stage === 'weight' ? 'trolley taking weight' : 'handover'}`, 16, 18, { size: 12, col: COL.gold });
      c.strokeStyle = COL.dim; c.lineWidth = 2; c.beginPath(); for (let j = 0; j <= 40; j++) { const s = j / 40, x = 20 + s * 220, y = 70 - m.slope(s) * 80; j ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      const px = 20 + m.s * 220; c.fillStyle = COL.peri; c.beginPath(); c.arc(px, 70 - m.h * 80, 5, 0, 6.283); c.fill();
      const t = m.tilt(), bx = 120 + Math.max(-1.6, Math.min(1.6, t / ring)) * 30, ok = Math.abs(t) <= ring;
      box(c, 60, 112, 120, 22, 'rgba(255,255,255,.06)', COL.dim, 11); c.strokeStyle = '#4fd06a'; c.strokeRect(90, 112, 60, 22);
      c.fillStyle = ok ? P.good : P.bad; c.beginPath(); c.arc(bx, 123, 8, 0, 6.283); c.fill(); txt(c, ok ? 'LEVEL' : 'TILT', 120, 150, { size: 10, align: 'center', col: ok ? P.good : P.bad });
      txt(c, 'trolley', 262, 40, { size: 10, col: COL.dim }); bar(c, 262, 46, 120, 10, m.wt, { band: [0.97, 1] }); txt(c, `${Math.round(m.wt * 100)} %`, 262, 72, { size: 12 });
      if (m.stage === 'say') k.cards.forEach((p, j) => { const said = PARTS.indexOf(p) < m.said; box(c, 262, 84 + j * 26, 124, 22, said ? 'rgba(79,208,106,.25)' : COL.panel, COL.peri, 4); txt(c, `${j + 1} ${p === 'patient' ? k.name : p === 'injury' ? k.inj : 'T+' + (12 + m.c * 7) + ' min'}`, 268, 99 + j * 26, { size: 11 }); });
    };
    return m;
  },
});
