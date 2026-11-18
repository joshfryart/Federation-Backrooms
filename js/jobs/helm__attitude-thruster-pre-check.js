// Helm: attitude thruster pre-check. At the thruster bank cabinet, hold the self-test key for each quad. The response bar always fills
// green, so it tells you nothing: read the digital counter. It can hesitate mid-count, so only the figure marked FINAL counts. Let go,
// then mark the sheet: tick (look straight at the sheet, tap E) a quad inside the printed limit, or circle (look left to the pen, tap E)
// one over it. Letting go before FINAL leaves the counter unread; ticking a slow quad, or circling a good one, is a fault.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Attitude thruster pre-check', type: 'loop' },
  title: 'Thruster quad counter read and mark', dept: 'flight', host: 'room', siteName: 'Quad', verb: 'Test',
  how: 'Hold E to self-test each quad and keep holding until the counter reads FINAL. Let go, then tap E looking at the sheet to tick it, or look left and tap E to circle it if it is over the limit.',
  keys: ['E hold: self-test', 'tap E: tick', 'look left + tap E: circle'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'read and mark', input: 'e-hold+e-tap+look', win: 'all four quads self-tested to a final counter figure and each ticked or circled correctly against the printed limit',
    fail: 'letting go before the counter reaches its final figure, or ticking a quad slower than the limit because the bar looked green',
    rule: 'Hold E while the counter runs; it may pause before it is done, so wait for FINAL. Release, then tap E facing the sheet for inside the limit, or with your view turned left for over the limit.' },
  rush: 'Marked every quad green off the bar display and signed the sheet.',
  captions: { unread: 'self-test aborts', 'slow valve passed': 'supervisor tuts', 'good quad circled': 'pen scratch' },
  says: { unread: 'You let go before the counter read FINAL. Run that quad again.', 'slow valve passed': 'That quad was over the limit: it needed a circle, not a tick.', 'good quad circled': 'That quad was inside the limit: tick it, do not circle it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Quad 1 self-test', prop: 'helm' }, { name: 'Quad 2 self-test', prop: 'console' }, { name: 'Quad 3 self-test', prop: 'helm' }, { name: 'Quad 4 self-test', prop: 'console' }]), r = m.rnd;
    m.lim = ri(r, 36, 44) * 10; const slow = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2))); slow.add(2);
    m.quads = m.sites.map((_, i) => ({ ms: slow.has(i) ? m.lim + ri(r, 2, 9) * 10 : m.lim - ri(r, 4, 20) * 10, pauseAt: ri(r, 30, 70) / 100, c: 0, paused: 0, fin: 0, phase: 'run' }));
    const fin = m.calm ? 0.45 : 0.6, rate = 330;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, q = m.quads[i];
      if (q.phase === 'run') {
        if (inp.hold) {
          if (q.c < q.ms) { if (!q.paused && q.c >= q.ms * q.pauseAt) q.paused = 1e-6; if (q.paused && q.paused < 0.35) q.paused += dt; else q.c = Math.min(q.ms, q.c + rate * dt); }
          else q.fin += dt;
        }
        if (rel) { if (q.fin >= fin) q.phase = 'judge'; else { m.fault('unread'); q.c = 0; q.paused = 0; q.fin = 0; } }
        s.prog = clamp(q.c / q.ms) * 0.6; return;
      }
      if (inp.press) {
        const circle = (inp.look || 0) > 0.3, over = q.ms > m.lim;
        if (over && !circle) { m.fault('slow valve passed'); return; } if (!over && circle) { m.fault('good quad circled'); return; }
        m.finish(i);
      }
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const q = m.quads[i];
      if (q.phase === 'run') return { at: i, hold: q.fin < fin + 0.05 };
      const go = f % 6 === 0; return { at: i, look: q.ms > m.lim ? 0.45 : 0, press: go, hold: go };
    };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 24 < 10, press: f % 24 === 0 });
    m.view = () => ({ lim: m.lim, ms: m.quads.map(q => q.ms) });
    m.panel = (i) => {
      const q = m.quads[i]; if (!q) return null;
      if (q.phase === 'judge') return { label: `Quad ${i + 1} ${q.ms} ms / limit ${m.lim}`, value: q.ms > m.lim ? 'OVER' : 'inside', bar: q.ms / (m.lim * 1.4), band: [0, m.lim / (m.lim * 1.4)] };
      return { label: `Counter (limit ${m.lim} ms)`, value: `${Math.round(q.c)} ms${q.fin >= fin ? ' FINAL' : q.paused && q.paused < 0.35 ? ' …' : ''}`, bar: q.c / (m.lim * 1.4), band: [0, m.lim / (m.lim * 1.4)] };
    };
    m.prompt = (i) => {
      const q = m.quads[i]; if (!q) return '';
      if (q.phase === 'judge') return 'Mark the sheet: tap [E] facing it to tick, or look left and tap [E] to circle an over-limit quad';
      return q.fin >= fin ? 'Counter FINAL: let go of [E] and mark the sheet' : 'Hold [E] for the self-test; read the counter, not the bar';
    };
    return m;
  },
});
