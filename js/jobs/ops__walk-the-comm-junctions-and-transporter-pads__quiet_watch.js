// Ops: walk the comm junctions and transporter pads. At each stop open the cover or lay a hand on the pad rail (hold E) and keep still while
// you look and feel: turning away loses the reading and starts it again. Let go only once the stop is inspected; letting go early ticks a
// stop you never looked inside. One stop on the route has drift or heat: at the handset, aim at that stop's name on the route card and tap E.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Walk the comm junctions and transporter pads', type: 'task:quiet_watch' },
  title: 'Junction and pad rail walk', dept: 'operations', host: 'room', siteName: 'Stop', verb: 'Inspect',
  how: 'At each stop hold E and keep your view still until it is inspected, then let go to tick it. At the handset aim at the stop that showed drift or heat on the route card and tap E to report it.',
  keys: ['E hold, keep still: inspect', 'look + E tap: report the stop'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'feel then report', input: 'e-hold+e-tap+look+turn', win: 'every stop inspected with a steady hand before its tick, and the one drifting or hot stop reported to the bridge',
    fail: 'ticking a stop before it is inspected, or reporting the wrong stop by handset',
    rule: 'Hold E at a stop: inspection fills only while your view stays still (turning restarts it). Let go when it reads INSPECTED. At the handset the route card lists the stops left to right; aim at the bad one and tap E.' },
  rush: 'Walked the route ticking the checklist without opening a cover.',
  captions: { unopened: 'checklist pen scratches', 'wrong stop': 'bridge asks again' },
  says: { unopened: 'You ticked it without looking inside. Hold E and keep still until it is inspected.', 'wrong stop': 'That stop read fine. Report the one that showed drift or heat.' },
  create(seed, opts) {
    const names = ['Junction A', 'Pad 1 rail', 'Junction B'];
    const m = room(machine(this, seed, opts), [{ name: names[0], prop: 'relayrack' }, { name: names[1], prop: 'pad' }, { name: names[2], prop: 'servers' }, { name: 'Bridge handset', prop: 'commsstation' }]), r = m.rnd;
    const need = m.calm ? 0.9 : 1.2, tol = m.calm ? 0.16 : 0.12;
    m.odd = ri(r, 0, 2); m.aim = [0.3, 0, -0.3].map(a => +(a + rf(r, -0.04, 0.04)).toFixed(3)); m.ins = [0, 0, 0]; m.found = ['', '', ''];
    const anomaly = (i) => i === 1 ? `rail hot, ${ri(r, 41, 58)} °C` : `relay ${ri(r, 2, 7)} amber, drifting`;
    m.note = anomaly(m.odd);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) {
        if (inp.press) { const k = m.aim.findIndex(a => Math.abs(a - (inp.look || 0)) < tol); if (k === m.odd) { m.finish(3); return; } m.fault('wrong stop'); }
        return;
      }
      if (inp.hold) { if ((inp.turn || 0) > 0.4) m.ins[i] = 0; else m.ins[i] += dt; if (m.ins[i] >= need) m.found[i] = i === m.odd ? m.note : 'clean'; }
      if (rel) { if (m.ins[i] >= need) { m.finish(i); return; } m.fault('unopened'); m.ins[i] = 0; }
      s.prog = clamp(m.ins[i] / need) * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: 3, look: m.aim[m.odd], press: f % 3 === 0 }; return { at: i, hold: m.ins[i] < need + 0.05, turn: 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 3) return { at: 3, look: m.aim[(m.odd + 1) % 3], press: f % 3 === 0 }; return { at: i, hold: f % 10 < 5, turn: 0 }; };
    m.view = () => ({ bad: m.odd, aim: m.aim, note: m.note });
    m.panel = (i) => {
      if (i === 3) return { label: 'Route card', value: names.map((n, k) => `${n}: ${m.found[k] || '?'}`).join(' · '), bar: 1 };
      const v = clamp(m.ins[i] / need); return { label: v >= 1 ? 'INSPECTED' : 'Inspecting', value: v >= 1 ? m.found[i] : 'keep still…', bar: v };
    };
    m.prompt = (i) => i === 3 ? 'Route card: Junction A left · Pad rail centre · Junction B right. Aim at the bad stop and tap [E]' : clamp(m.ins[i] / need) >= 1 ? 'Inspected — let go of [E] to tick it' : 'Hold [E] and keep your view still to open and inspect';
    return m;
  },
});
