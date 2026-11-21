// Medtech: move stable patients to recovery. Each chart shows sign-off and how many monitor leads are clipped. Digits unclip lead N, 8 caps the
// IV, Space wheels the stretcher. A patient without sign-off must be held in the bay (9) instead. Wheeling out with a lead on snags it.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'medtech', label: 'Move stable patients to recovery and chart handoff', type: 'task:medical_relief' },
  title: 'Unclip, cap and wheel handoff', dept: 'medical', host: 'console', tool: 'Handoff chart and stretcher',
  how: 'Check the chart. Signed off: press each lead digit to unclip, 8 to cap the IV, then Space to wheel. NO SIGN-OFF: press 9 and hold the patient in the bay.',
  keys: ['1-4 unclip lead', '8 cap IV', 'Space wheel', '9 hold in bay'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'unclip then wheel', input: 'digits+space', win: 'three charts cleared: signed patients unclipped, capped and wheeled out, the unsigned one held in the bay',
    fail: 'wheeling out with a lead still clipped or the IV open, or wheeling a patient with no sign-off',
    rule: 'Each chart lists clipped leads. Press a lead digit to unclip it and 8 to cap the IV, then Space to wheel. If the chart has no sign-off press 9 and do not move them.' },
  rush: 'Wheeled the patients over with the leads still on and gave the handoff from memory.',
  captions: { snagged: 'lead snaps taut', unsigned: 'recovery nurse refuses' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, uns = ri(r, 0, 2);
    m.pts = [0, 1, 2].map(i => ({ signed: i !== uns, leads: ri(r, 2, 4), iv: true, clip: null }));
    m.pts.forEach(p => { p.clip = Array.from({ length: p.leads }, () => true); }); m.k = 0; m.round = 0; m.rounds = 3;
    const next = () => { m.k++; m.round = m.k; if (m.k >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const p = m.pts[m.k]; if (!p) return true; const d = DIG(code);
      if (d >= 1 && d <= p.leads) p.clip[d - 1] = false; else if (d === 8) p.iv = false;
      else if (d === 9) { if (p.signed) m.fault('moved nothing'); else next(); }
      else if (SPACE(code)) { if (!p.signed) { m.fault('unsigned'); next(); } else if (p.clip.some(Boolean) || p.iv) { m.fault('snagged'); p.clip = p.clip.map(() => false); p.iv = false; } else next(); }
      else return false; return true;
    };
    m.hint = () => { const p = m.pts[m.k]; if (!p) return []; if (!p.signed) return [['Digit9', true]]; const i = p.clip.findIndex(Boolean); return i >= 0 ? [['Digit' + (i + 1), true]] : p.iv ? [['Digit8', true]] : [['Space', true]]; };
    m.bad = () => { const p = m.pts[m.k]; return p && p.signed && (p.clip.some(Boolean) || p.iv) ? 'Space' : p && !p.signed ? 'Space' : null; };
    m.view = () => ({ pts: m.pts.map(p => [p.signed, p.leads]) });
    m.buttons = () => [['Space', 'Wheel'], ['Digit8', 'Cap IV'], ['Digit9', 'Hold']];
    m.draw = (c, W, H, P) => {
      m.pts.forEach((p, i) => { const x = 10 + i * 130, on = i === m.k; box(c, x, 14, 122, 112, on ? COL.panel : 'rgba(255,255,255,.04)', on ? COL.gold : null);
        txt(c, `Patient ${i + 1}`, x + 8, 32, { size: 12 }); txt(c, p.signed ? 'SIGNED OFF' : 'NO SIGN-OFF', x + 8, 50, { size: 11, col: p.signed ? P.good : P.bad });
        p.clip.forEach((cl, k) => txt(c, `${k + 1} ${cl ? 'CLIP' : 'off'}`, x + 8 + (k % 2) * 56, 70 + Math.floor(k / 2) * 16, { size: 11, col: cl ? COL.warn : COL.dim }));
        txt(c, p.iv ? '8 IV OPEN' : 'IV capped', x + 8, 114, { size: 11, col: p.iv ? COL.warn : COL.dim }); });
      txt(c, 'unclip leads, cap IV, Space wheel · 9 hold', 10, 152, { size: 11, col: COL.dim });
    };
    return m;
  },
});
