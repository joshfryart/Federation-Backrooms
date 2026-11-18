// Comms officer, shakedown: subspace transceiver range test. Carry the beacon out to a distance mark and set it down (hold E until it sits
// square; let go early and it topples off the mark). Walk back to the transmit dial and read the margin against the card's minimum: still
// above, tap E to log it and carry the beacon to the next mark; first time under, hold E to record that mark as the range edge.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'comms', label: 'Subspace transceiver range test', type: 'task:shakedown' },
  title: 'Beacon mark walk to the range edge', dept: 'operations', host: 'room', siteName: 'Step', verb: 'Range',
  how: 'Set the beacon down on each distance mark (hold E), then read the margin at the transmit dial: tap E to log it and go on while it is above the minimum, hold E to record the edge at the first mark under it.',
  keys: ['E hold at a mark: set the beacon down', 'E tap at the dial: log, carry on', 'E hold at the dial: record the edge'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'walk the marks', input: 'e-tap+e-hold', win: 'the beacon set on mark after mark and the range edge recorded at the first mark whose margin falls under the minimum',
    fail: 'toppling the beacon off its mark, stopping while the margin is still above the minimum, or walking on past the edge',
    rule: 'At a mark hold E until the beacon is square. At the dial compare MARGIN with MIN: above, tap E; under, hold E for a second to record the edge.' },
  rush: 'Read the margin once at the cabinet and wrote the book range in the log.',
  captions: { toppled: 'beacon clatters', 'stopped short': 'log entry struck out', 'walked past': 'beacon signal lost' },
  says: { toppled: 'Let go too soon — the beacon toppled off the mark. Hold until it sits square.', 'stopped short': 'The margin is still above the minimum — log it and go to the next mark.', 'walked past': 'Margin is under the minimum here — this is the edge. Hold [E] to record it.' },
  create(seed, opts) {
    const sites = []; for (let k = 1; k <= 4; k++) sites.push({ name: `Distance mark ${k}` }, { name: `Transmit dial, reading ${k}`, prop: k % 2 ? 'commsstation' : 'relayrack' });
    const m = room(machine(this, seed, opts), sites), r = m.rnd, setT = m.calm ? 0.6 : 0.8, endT = 1.0;
    m.min = ri(r, 30, 45); m.edge = ri(r, 1, 3);
    m.margin = [0, 1, 2, 3].map(k => k < m.edge ? m.min + rf(r, 4, 9) * (m.edge - k) : m.min - rf(r, 3, 10) * (k - m.edge + 1)).map(v => Math.round(v));
    m.h = 0; m.done = false;
    const finishAll = () => { for (let j = m.next; j >= 0 && j < m.sites.length; j = m.next) m.finish(j); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, k = i >> 1, mark = i % 2 === 0;
      if (inp.hold) m.h += dt;
      if (mark) { s.prog = clamp(m.h / setT * 0.9); if (m.h >= setT) { m.h = 0; m.finish(i); return; } if (rel) { if (m.h > 0.1) m.fault('toppled'); m.h = 0; } return; }
      const under = m.margin[k] < m.min; s.prog = clamp(m.h / endT * 0.9);
      if (inp.hold && m.h >= endT) { m.h = 0; if (!under) { m.fault('stopped short'); return; } finishAll(); return; }
      if (rel) { const h = m.h; m.h = 0; if (h > 0.35) return; if (under) { m.fault('walked past'); return; } m.finish(i); }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i % 2 === 0) return { at: i, hold: true, press: m.h === 0 };
      if (m.margin[i >> 1] < m.min) return { at: i, hold: true, press: m.h === 0 }; return { at: i, hold: m.h === 0, press: m.h === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 8 === 0, press: f % 8 === 0 });
    m.view = () => ({ min: m.min, mg: m.margin });
    m.panel = (i) => { if (i % 2 === 0) return { label: 'Beacon', value: m.h > 0 ? 'setting down…' : 'hold to set down', bar: clamp(m.h / setT) };
      const v = m.margin[i >> 1]; return { label: `MARGIN ${v} · MIN ${m.min}`, value: v < m.min ? 'under the minimum' : 'above the minimum', bar: clamp(v / 100), band: [m.min / 100, 1] }; };
    m.prompt = (i) => i % 2 === 0 ? 'Hold [E] to set the beacon square on the mark' : 'Tap [E] to log and carry on, or hold [E] to record the range edge';
    return m;
  },
});
