// Cook: carry trays to sickbay. Hold E to walk the tray along each stretch; you only move while E is held. Turning your view quickly sloshes
// the broth: a fast whip around a corner spills the tray. Let go of E to pause and turn, then hold again.
import { define, machine, room, clamp, rf } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Carry trays to sickbay', type: 'task:medical_relief' },
  title: 'Slow-turn tray carry', dept: 'services', host: 'room', siteName: 'Stretch', verb: 'Carry',
  how: 'Hold E to carry the tray along each stretch. Keep your view turning slowly while you hold; a fast turn sloshes the broth. Let go to pause.',
  keys: ['E hold: carry the tray', 'turn slowly while carrying'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'keep it level', input: 'e-hold+turn', win: 'tray carried through three stretches without a spill, turning slowly while walking',
    fail: 'whipping the view around while carrying until the broth slops over the rim',
    rule: 'Holding E walks the tray forward. Turning faster than a gentle rate while holding fills the slosh bar; a full bar spills. Pause with E up to turn freely.' },
  rush: 'Marched down the corridor with the tray held out in one hand, slopping as you went.',
  captions: { spill: 'broth slops over' }, says: { spill: 'The tray slopped over: turn slowly while carrying, or pause.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Mess hatch', prop: 'servery' }, { name: 'Corridor corner', prop: 'airlock_doors' }, { name: 'Sickbay bench', prop: 'nursestation' }]), thr = m.calm ? 1.5 : 1.0;
    m.slosh = 0; m.walk = [0, 0, 0]; m.len = m.sites.map(() => rf(m.rnd, 1.8, 2.8));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; m.slosh = Math.max(0, m.slosh - dt * 0.25);
      if (inp.hold) { m.walk[m.next] += dt / m.len[m.next]; if ((inp.turn || 0) > thr) m.slosh += (inp.turn - thr) * dt * 0.9; if (m.slosh >= 1) { m.fault('spill'); m.slosh = 0.3; m.walk[m.next] = Math.max(0, m.walk[m.next] - 0.3); } }
      if (m.walk[m.next] >= 1) { m.finish(m.next); m.slosh = 0; } else s.prog = clamp(m.walk[m.next], 0, 0.95);
    };
    m.hint = () => ({ at: m.next, hold: true, turn: 0 });
    m.bad = () => ({ at: m.next, hold: true, turn: 3 });
    m.view = () => ({ len: m.len.map(x => +x.toFixed(2)) });
    m.panel = (i) => ({ label: 'Slosh', value: `${Math.round(m.slosh * 100)} %`, bar: m.walk[i] || 0, band: [0, 1] });
    m.prompt = () => 'Hold [E] to carry; turn slowly, or let go to pause and turn';
    return m;
  },
});
