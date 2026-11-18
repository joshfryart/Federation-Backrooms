// Transporter chief: calibrate the cargo pad for bulk cargo. With the calibration weight on the pad centre, go round the four leveling feet.
// Each tap of E turns the foot one notch in the direction you are turning your view: a slow turn gives a fine notch, a brisk turn a coarse
// three-notch step. The corner load must come exactly to its share. Run it past zero and the pad rocks onto the opposite corner.
import { define, machine, room, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Calibrate for bulk cargo', type: 'task:cargo_run' },
  title: 'Leveling feet, coarse then fine', dept: 'operations', host: 'room', item: 'hydrospanner', siteName: 'Foot', verb: 'Level',
  how: 'At each leveling foot, turn your view the way the panel arrow says and tap E to turn the foot: brisk turns give a coarse step of three, slow turns a single notch. Bring the corner load to exactly zero without passing it.',
  keys: ['turn + E tap: turn the foot', 'brisk turn = coarse (3)', 'slow turn = fine (1)'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'level the feet', input: 'e-tap+swing', win: 'all four leveling feet brought to exactly their corner load share, coarse steps first and single notches to finish',
    fail: 'running a foot past its zero so the pad rocks onto the opposite corner',
    rule: 'The panel shows each corner\'s load error in notches and which way to turn. Tap E while turning that way: brisk (fast view turn) moves three notches, slow moves one. Land on zero; passing it rocks the pad.' },
  rush: 'Spun all four feet to the same thread count by eye.',
  captions: { rocked: 'pad clunk' }, says: { rocked: 'Ran the foot past level: the pad rocked onto the far corner. Use single notches near zero.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), ['NE', 'NW', 'SW', 'SE'].map(n => ({ name: `Leveling foot ${n}`, prop: 'pad' }))), r = m.rnd, coarse = m.calm ? 1.5 : 1.3;
    m.feet = m.sites.map(() => ({ o: pick(r, [4, 5, 7, 8, 10]) * pick(r, [1, -1]) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, ft = m.feet[i], sw = inp.swing || 0;
      if (inp.press && Math.abs(sw) > 0.35) {
        const n = Math.abs(sw) > coarse ? 3 : 1, d = sw > 0 ? -1 : 1, was = ft.o; ft.o += d * n; m.ev('notch', { n: d * n });
        if (was !== 0 && Math.sign(ft.o) === -Math.sign(was)) { m.fault('rocked'); ft.o = Math.sign(ft.o) * Math.min(Math.abs(ft.o) + 2, 10); }
        if (ft.o === 0) { m.finish(i); return; }
      }
      s.prog = clamp(1 - Math.abs(ft.o) / 10, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const ft = m.feet[i], dir = ft.o > 0 ? 1 : -1, sp = Math.abs(ft.o) >= 3 ? 2 : 0.7; return { at: i, swing: dir * sp, press: f % 5 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, ft = m.feet[i]; return { at: i, swing: (ft.o > 0 ? 1 : -1) * 2, press: f % 5 === 0 }; };
    m.view = () => ({ feet: m.feet.map(x => x.o) });
    m.panel = (i) => { const ft = m.feet[i]; if (!ft) return null; return { label: `Corner load error ${ft.o > 0 ? '+' : ''}${ft.o} notches`, value: ft.o ? `turn ${ft.o > 0 ? '◀ left' : 'right ▶'}` : 'level', bar: clamp(0.5 + ft.o / 20), band: [0.48, 0.52] }; };
    m.prompt = (i) => { const ft = m.feet[i]; if (!ft) return ''; return `Turn ${ft.o > 0 ? 'left' : 'right'} and tap [E]: brisk = 3 notches, slow = 1. ${Math.abs(ft.o)} to go`; };
    return m;
  },
});
