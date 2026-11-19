// Environmental tech: extra scrubber capacity for a crowded sickbay (medical relief). Pop the spare scrubber's cover latches (tap E), then push
// the spare cartridge home (hold E). Halfway in it meets a stiff false seat that FEELS home: keep pushing through it until the latch clicks.
// Then bring the unit online at the bank panel (hold E) and watch the ward CO2 fall. A cartridge left on the false seat runs unfiltered.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Extra scrubber capacity for crowded sickbay', type: 'task:medical_relief' },
  title: 'Scrubber cartridge past the false seat', dept: 'engineering', host: 'room', item: 'toolbag', siteName: 'Step', verb: 'Fit',
  how: 'Tap E to pop each cover latch. Hold E to push the cartridge in: when it goes stiff keep pushing until it clicks, then let go. Hold E at the bank panel to bring the spare online until the ward CO2 drops under the marker.',
  keys: ['E tap: pop a latch', 'E hold: push / bring online'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'push past detent', input: 'e-hold+e-tap', win: 'the spare cartridge pushed through its false seat to the latch click and the spare scrubber brought online until the ward CO2 falls under the marker',
    fail: 'letting go on the stiff false seat so the scrubber comes online with an unseated cartridge and runs unfiltered',
    rule: 'The push slows to a crawl at the false seat: that is NOT home. Keep holding until the panel says CLICK, then let go. Online with no click shows NO FILTER and sends you back.' },
  rush: 'Shoved the cartridge in until it stuck and switched the spare on.',
  captions: { 'no filter': 'no-filter warning tone', 'popped out': 'cartridge springs back' },
  says: { 'no filter': 'NO FILTER: the cartridge was sitting on the false seat. Go back and push it through to the click.', 'popped out': 'It sprang back out: the latch was not clicked.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Spare scrubber cover', prop: 'scrubber' }, { name: 'Spare cartridge bay', prop: 'pumpskid' }, { name: 'Scrubber bank panel', prop: 'console' }]), r = m.rnd;
    m.latches = ri(r, 2, 4); m.popped = 0; m.det = rf(r, 0.5, 0.65); m.dw = rf(r, 0.14, 0.2); m.pos = 0; m.clicked = false; m.spin = 0; m.co2 = rf(r, 0.75, 0.85); m.mark = 0.45;
    const crawl = m.calm ? 0.16 : 0.12;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.press) { m.popped++; if (m.popped >= m.latches) m.finish(0); } s.prog = m.popped / m.latches; return; }
      if (i === 1) {
        if (inp.hold && !m.clicked) { const stiff = m.pos >= m.det && m.pos < m.det + m.dw; m.pos = Math.min(1, m.pos + (stiff ? crawl : 0.55) * dt); if (m.pos >= 1) m.clicked = true; }
        if (rel && m.pos > 0.2) m.finish(1);
        s.prog = s.done ? 1 : clamp(m.pos * 0.9); return;
      }
      if (inp.hold) { m.spin = Math.min(1, m.spin + dt / 0.8); if (m.spin >= 1) { if (!m.clicked) { m.fault('no filter'); m.sites[1].done = false; m.sites[1].prog = 0; m.next = 1; m.pos = 0.3; m.spin = 0; return; } m.co2 = Math.max(0, m.co2 - dt * 0.22); if (m.co2 < m.mark) m.finish(2); } }
      else m.spin = Math.max(0, m.spin - dt);
      s.prog = s.done ? 1 : clamp(m.spin * 0.3 + (1 - m.co2) * 0.6, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) { const k = f % 6; return { at: 0, press: k === 0, hold: k < 2 }; } if (i === 1) return { at: 1, hold: !m.clicked }; return { at: 2, hold: true }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) { const k = f % 6; return { at: 0, press: k === 0, hold: k < 2 }; } if (i === 1) return { at: 1, hold: m.pos < m.det + 0.04 }; return { at: 2, hold: true }; };
    m.view = () => ({ l: m.latches, det: +m.det.toFixed(3), dw: +m.dw.toFixed(3) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Cover latches', value: `${m.popped} / ${m.latches} popped`, bar: m.popped / m.latches };
      if (i === 1) { const stiff = m.pos >= m.det && m.pos < m.det + m.dw; return { label: m.clicked ? 'CLICK — latched' : stiff ? 'Stiff… (not home yet)' : 'Latch open', value: `cartridge ${Math.round(m.pos * 100)} % in`, bar: m.pos, band: [0.97, 1] }; }
      return { label: m.spin >= 1 ? (m.clicked ? 'Online — filtering' : 'NO FILTER') : 'Spinning up', value: `ward CO2 ${(m.co2 * 1.2).toFixed(2)} %`, bar: 1 - m.co2, band: [1 - m.mark, 1] };
    };
    m.prompt = (i) => i === 0 ? 'Tap [E] to pop each cover latch' : i === 1 ? (m.clicked ? 'Clicked: let go of [E]' : 'Hold [E] to push the cartridge: keep going through the stiff spot to the click') : 'Hold [E] to bring the spare online until the ward CO2 falls under the marker';
    return m;
  },
});
