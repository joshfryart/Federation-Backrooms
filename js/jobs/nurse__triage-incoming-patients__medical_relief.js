// Nurse: triage incoming patients. Hold Space to read the pocket monitor (it takes a moment to settle), then tag the patient with 1 red,
// 2 yellow or 3 green by the figures: not breathing well or oxygen under 90 is red, bleeding or pulse over 120 is yellow, otherwise green.
import { define, machine, SPACE, DIG, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Triage incoming patients', type: 'task:medical_relief' },
  title: 'Pocket monitor triage tags', dept: 'medical', host: 'console', tool: 'Pocket monitor and triage tags',
  how: 'Hold Space until the pocket monitor shows its figures, let go, then tag: 1 red (oxygen under 90 or not breathing), 2 yellow (bleeding or pulse over 120), 3 green. Never tag blind.',
  keys: ['Space hold: read monitor', '1 red', '2 yellow', '3 green'], limit: 34, maxFaults: 2,
  fingerprint: { verb: 'read then tag', input: 'space-hold+digits', win: 'four arrivals each read on the pocket monitor held long enough then tagged red, yellow or green by the figures',
    fail: 'tagging before the monitor has settled, or a red patient tagged yellow or green, or any wrong colour',
    rule: 'Hold Space about a second to settle the monitor. Then press 1, 2 or 3: oxygen under 90 means red, bleeding or fast pulse means yellow, else green.' },
  rush: 'Tagged by how they looked from the door.',
  captions: { guessed: 'monitor error beep', 'wrong tag': 'triage tag rip', 'red missed': 'late-deterioration alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 0.7 : 1.0; m.k = 0; m.hold = 0; m.read = false; m.rounds = 4; m.round = 0;
    m.pts = Array.from({ length: 4 }, (_, i) => { const tag = [1, 2, 3, ri(r, 1, 3)][(i + ri(r, 0, 3)) % 4]; return { tag, o2: tag === 1 ? ri(r, 78, 89) : ri(r, 93, 99), pulse: tag === 2 ? ri(r, 122, 140) : ri(r, 62, 100), bleed: tag === 2 }; });
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), sp = SPACE(code); if (!sp && (d < 1 || d > 3)) return false;
      if (sp) { m.held.S = down; if (!down) m.hold = 0; return true; } if (!down) return true; const p = m.pts[m.k];
      if (!p) return true; if (!m.read) { m.fault('guessed'); return true; }
      if (d !== p.tag) { m.fault(p.tag === 1 ? 'red missed' : 'wrong tag'); return true; }
      m.k++; m.round = m.k; m.read = false; m.hold = 0; if (m.k >= 4) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S && !m.read) { m.hold += dt; if (m.hold >= need) m.read = true; } };
    m.hint = () => { const p = m.pts[m.k]; if (!p) return []; return !m.read ? [['Space', true]] : [['Space', false], ['Digit' + p.tag, true]]; };
    m.bad = () => 'Digit3';
    m.view = () => ({ pts: m.pts.map(p => [p.o2, p.pulse, p.bleed]) });
    m.buttons = () => [['Space', 'Read (hold)'], ['Digit1', 'Red'], ['Digit2', 'Yellow'], ['Digit3', 'Green']];
    m.draw = (c, W, H, P) => {
      const p = m.pts[Math.min(m.k, 3)]; txt(c, `Patient ${Math.min(m.k + 1, 4)} / 4`, 14, 22, { size: 14, col: COL.gold });
      box(c, 14, 36, 372, 62, 'rgba(255,255,255,.05)', COL.dim, 8);
      if (m.read) txt(c, `SpO2 ${p.o2}   pulse ${p.pulse}   ${p.bleed ? 'BLEEDING' : 'no bleeding'}`, 26, 74, { size: 16 }); else { c.fillStyle = COL.orange; c.fillRect(26, 62, Math.min(1, m.hold / need) * 340, 12); txt(c, m.held.S ? 'monitor settling...' : 'hold Space to read', 26, 90, { size: 11, col: COL.dim }); }
      txt(c, '1 red  2 yellow  3 green', 14, 130, { size: 12, col: COL.dim });
    };
    return m;
  },
});
