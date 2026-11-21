// Doc: triage incoming patients. Stretchers arrive one at a time with a description (loud or quiet) and an oximeter reading. The zone comes
// from the oxygen, not from the noise: below 90 red (Left), 90 to 94 amber (Down), 95 and above green (Right). A quiet patient with low oxygen is the trap.
import { define, machine, ARROW, ri, pick, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Triage incoming patients', type: 'task:medical_relief' },
  title: 'Oximeter zone triage', dept: 'medical', host: 'console', tool: 'Triage tags and zone markers',
  how: 'Read the oximeter on each stretcher. Left puts the patient in red (below 90), Down in amber (90 to 94), Right in green (95 or more). Ignore how loud they are.',
  keys: ['Left red zone', 'Down amber zone', 'Right green zone'], limit: 26, maxFaults: 2,
  fingerprint: { verb: 'zone by oxygen', input: 'arrows', win: 'five arriving patients each sent to the red, amber or green zone their oxygen reading calls for',
    fail: 'sending a patient to a lower zone than their reading, such as a silent low-oxygen patient left in green',
    rule: 'Each stretcher shows a loudness note and an oxygen figure. Press Left for under 90, Down for 90 to 94, Right for 95 or over; the note does not matter.' },
  rush: 'Tagged by who was shouting loudest and left the quiet ones to wait.',
  captions: { undertriaged: 'monitor alarm', 'over-tagged': 'tag peels' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, notes = ['shouting', 'groaning', 'quiet', 'silent', 'talking'];
    m.P = Array.from({ length: 5 }, (_, k) => { const o = k === 1 ? ri(r, 78, 89) : ri(r, 80, 99); return { o2: o, note: o < 90 && r() < 0.6 ? pick(r, ['quiet', 'silent']) : pick(r, notes) }; });
    m.i = 0; m.rounds = 5; m.round = 0;
    const zone = (o) => (o < 90 ? 'L' : o < 95 ? 'D' : 'R');
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!a || a === 'U') return false;
      const z = zone(m.P[m.i].o2); if (a !== z) { const rank = { L: 0, D: 1, R: 2 }; m.fault(rank[a] > rank[z] ? 'undertriaged' : 'over-tagged'); return true; }
      m.i++; m.round++; if (m.i >= 5) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => [[{ L: 'ArrowLeft', D: 'ArrowDown', R: 'ArrowRight' }[zone(m.P[Math.min(4, m.i)].o2)], true]];
    m.bad = () => 'ArrowRight';
    m.view = () => ({ P: m.P });
    m.buttons = () => [['ArrowLeft', 'Red'], ['ArrowDown', 'Amber'], ['ArrowRight', 'Green']];
    m.draw = (c, W, H, P) => {
      const p = m.P[Math.min(4, m.i)]; txt(c, `stretcher ${Math.min(5, m.i + 1)} of 5`, 20, 24, { size: 12, col: COL.dim });
      txt(c, p.note, 20, 56, { size: 18, col: COL.pale }); txt(c, `SpO2 ${p.o2} %`, 20, 96, { size: 28, col: COL.ink });
      [['RED', '<90', P.bad, 'L'], ['AMBER', '90-94', COL.warn, 'D'], ['GREEN', '95+', P.good, 'R']].forEach(([n, r2, col], k) => {
        box(c, 190 + k * 70, 30, 62, 70, 'rgba(255,255,255,.06)', col, 6); txt(c, n, 221 + k * 70, 56, { size: 12, col, align: 'center' }); txt(c, r2, 221 + k * 70, 80, { size: 13, col: COL.ink, align: 'center' }); });
      txt(c, 'Left        Down        Right', 215, 124, { size: 11, col: COL.dim });
    };
    return m;
  },
});
