// Botanist: grow bed round. Walk the trays in order. At each tray tap E to push the moisture probe into the root zone: the meter shows how far
// the bed sits off its band. Then turn the pump dial by swinging your view (left opens, right closes). The flow gauge lags behind the dial and
// creeps to it, so ease the dial into the green and wait for the gauge to settle before tapping E to log the tray. Run the gauge over the top
// and the tray floods (a fault, the bed is drained back to its start); logging while the gauge is still moving or outside the band is a fault.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Grow bed round', type: 'loop' },
  title: 'Pump dial trim on the grow beds', dept: 'sciences', host: 'room', siteName: 'Tray', verb: 'Trim',
  how: 'Tap E to probe each tray, swing your view to turn its pump dial (left opens, right closes), wait for the lagging flow gauge to settle in the green, then tap E to log it.',
  keys: ['E tap: probe / log', 'swing view: turn the pump dial'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'trim the pump', input: 'e-tap+swing', win: 'each tray probed, its lagging flow gauge settled inside the green band, then logged',
    fail: 'opening the dial so far the lagging gauge overshoots into a flooded bed, or logging a tray before its gauge has settled',
    rule: 'The view swing turns the pump dial; the flow gauge creeps after the dial with a lag. Probe, nudge the dial into the band, stop, let the gauge catch up, and only then tap E.' },
  rush: 'Cranked every pump to the same mark and ticked the trays from the door.',
  captions: { flooded: 'water gurgles over the tray lip', unsettled: 'log slate buzzes' },
  says: { flooded: 'The gauge ran over the top and the tray flooded. Ease the dial; the flow lags behind it.', unsettled: 'Logged too soon: the gauge was still moving or out of the green. Let it settle first.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Door tray', prop: 'growbed' }, { name: 'Middle tray', prop: 'growbed' }, { name: 'Far tray', prop: 'nutrient_tanks' }]), r = m.rnd;
    const half = m.calm ? 0.09 : 0.07, lag = m.calm ? 1.6 : 1.9, gain = 0.32;
    m.trays = m.sites.map(() => { const start = rf(r, 0.1, 0.3); return { start, dial: start, flow: start, want: rf(r, 0.5, 0.72), probed: false }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.trays[i];
      if (!p.probed) { if (inp.press) { p.probed = true; m.ev('probe', { site: i }); } s.prog = 0; return; }
      p.dial = clamp(p.dial + (inp.swing || 0) * gain * dt, 0, 1);
      p.flow += (p.dial - p.flow) * clamp(lag * dt, 0, 1);
      if (p.flow > 0.95) { m.fault('flooded'); p.dial = p.flow = p.start; return; }
      if (inp.press) {
        if (Math.abs(p.flow - p.want) <= half && Math.abs(p.dial - p.flow) < 0.02) { m.finish(i); return; }
        m.fault('unsettled');
      }
      s.prog = clamp(0.1 + 0.8 * (1 - Math.abs(p.flow - p.want) / 0.6), 0.1, 0.9);
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = m.trays[i]; if (!p.probed) return { at: i, press: true };
      const d = p.want - p.dial; if (Math.abs(d) > 0.01) return { at: i, swing: clamp(d * 30, -2.5, 2.5) };
      return Math.abs(p.flow - p.want) <= half * 0.6 && Math.abs(p.dial - p.flow) < 0.01 ? { at: i, press: true } : { at: i };
    };
    m.bad = () => { const i = m.next; const p = m.trays[i]; return p && !p.probed ? { at: i, press: true } : { at: i, swing: 3 }; };
    m.view = () => ({ trays: m.trays.map(p => [+p.start.toFixed(3), +p.want.toFixed(3)]) });
    m.panel = (i) => { const p = m.trays[i]; if (!p) return null; if (!p.probed) return { label: 'Probe', value: 'not in', bar: 0 };
      const moving = Math.abs(p.dial - p.flow) >= 0.02; return { label: moving ? 'Flow (settling)' : 'Flow (steady)', value: `${Math.round(p.flow * 100)} % dial ${Math.round(p.dial * 100)}`, bar: p.flow, band: [p.want - half, p.want + half] }; };
    m.prompt = (i) => { const p = m.trays[i]; return !p ? '' : !p.probed ? 'Tap [E] to push the moisture probe into the root zone' : 'Swing your view to turn the pump dial; when the gauge sits still in the green, tap [E] to log'; };
    return m;
  },
});
