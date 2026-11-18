// Helm: thruster pre-check on the quiet watch. At the aft thruster bank, hold E through each quad's self-test cycle until the counter
// settles, then look at the sticky-valve flag. A clear quad gets its flag reset: keep E on the reset lever and throw it by swinging your view
// left. A red-flagged quad must NOT be reset: tap E once to hang the tag and leave the flag showing. Throwing the reset over a red flag hides
// a valve that will jam at burn time; tagging a clear quad takes a good thruster out of service.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Thruster pre-check', type: 'task:quiet_watch' },
  title: 'Sticky-valve flag reset or tag', dept: 'flight', host: 'room', siteName: 'Quad', verb: 'Cycle',
  how: 'Hold E through each quad\'s self-test until it settles. Clear flag: keep holding E and swing your view left to throw the reset lever. Red flag: just tap E to tag it and leave it.',
  keys: ['E hold: run the cycle', 'E hold + swing left: reset a clear flag', 'tap E: tag a red flag'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'reset or tag', input: 'e-hold+swing+e-tap', win: 'all four quads cycled to a settled counter, clear flags thrown back and red flags tagged and left showing',
    fail: 'cutting a cycle short, throwing the reset lever over a red sticky-valve flag, or tagging a clear quad out of service',
    rule: 'Hold E until the counter settles. Then the flag shows: CLEAR means hold E and swing the view left to throw the reset; RED means a single quick tap of E (no swing) to hang the tag.' },
  rush: 'Slammed the cover shut over all four flags because the counter bars looked fine.',
  captions: { 'cycle cut': 'self-test aborts', 'red flag reset': 'valve warning buzzer', 'good quad tagged': 'tag rustles' },
  says: { 'cycle cut': 'Let go before the counter settled. Run that cycle again.', 'red flag reset': 'That flag was RED. Never reset it: tap E to tag it.', 'good quad tagged': 'That flag was clear. Throw the reset (hold E and swing left), do not tag it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Quad A', prop: 'console' }, { name: 'Quad B', prop: 'opsstation' }, { name: 'Quad C', prop: 'console' }, { name: 'Quad D', prop: 'opsstation' }]), r = m.rnd;
    const red = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.q = m.sites.map((_, i) => ({ red: red.has(i), cyc: rf(r, 0.9, 1.4), ms: ri(r, 22, 38) * 10, run: 0, phase: 'run', holdT: 0, sw: 0 }));
    const need = m.calm ? 0.25 : 0.3;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, q = m.q[i];
      if (q.phase === 'run') {
        if (inp.hold) q.run += dt;
        if (rel) { if (q.run >= q.cyc) q.phase = 'flag'; else { m.fault('cycle cut'); q.run = 0; } }
        s.prog = clamp(q.run / q.cyc) * 0.6; return;
      }
      if (inp.hold) { q.holdT += dt; if ((inp.swing || 0) > 1.0) q.sw += dt; }
      if (q.sw >= need) { q.sw = 0; q.holdT = 0; if (q.red) m.fault('red flag reset'); else { m.finish(i); return; } }
      if (rel) { if (q.holdT < 0.35 && q.sw === 0) { if (q.red) { m.finish(i); return; } m.fault('good quad tagged'); } q.holdT = 0; q.sw = 0; }
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const q = m.q[i];
      if (q.phase === 'run') return { at: i, hold: q.run < q.cyc + 0.05 };
      return q.red ? { at: i, hold: f % 8 === 0, press: f % 8 === 0 } : { at: i, hold: true, swing: 1.5 };
    };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 60 < 52, swing: 1.6 });
    m.view = () => ({ q: m.q.map(q => [q.red, q.ms]) });
    m.panel = (i) => {
      const q = m.q[i]; if (!q) return null;
      if (q.phase === 'run') return { label: 'Response counter', value: q.run >= q.cyc ? `${q.ms} ms settled` : `${Math.round(q.ms * clamp(q.run / q.cyc))} ms…`, bar: clamp(q.run / q.cyc) };
      return { label: 'Sticky-valve flag', value: q.red ? '▲ RED' : '● clear', bar: q.red ? 1 : clamp(q.sw / need) };
    };
    m.prompt = (i) => {
      const q = m.q[i]; if (!q) return '';
      if (q.phase === 'run') return q.run >= q.cyc ? 'Counter settled: let go of [E] and read the flag' : 'Hold [E] through the self-test cycle';
      return q.red ? 'RED flag: tap [E] once to tag it; do not reset' : 'Clear flag: hold [E] and swing your view left to throw the reset';
    };
    return m;
  },
});
