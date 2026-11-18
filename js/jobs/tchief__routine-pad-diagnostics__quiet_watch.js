// Transporter chief: routine pad diagnostics. Kneel at each pad's base plate and run the handheld quick scan round the marked ring: hold E
// and turn at an even pace until the ring is covered (whip round too fast and a segment is skipped). The scanner then shows this week's
// alignment offset beside last week's log line. A single reading always looks normal; only the change tells you about creep. Look to the
// LOG side (left) and tap E to log it normal, or to the FLAG side (right) and tap E to flag creep.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Routine pad diagnostics', type: 'task:quiet_watch' },
  title: 'Ring scan against last week\'s log', dept: 'operations', host: 'room', item: 'tricorder_eng', siteName: 'Base plate', verb: 'Scan',
  how: 'Hold E and turn steadily to run the quick scan round the pad ring. Then compare the offset with last week\'s: look left and tap E to log it normal, look right and tap E to flag creep.',
  keys: ['E hold + steady turn: scan the ring', 'look left + E tap: normal', 'look right + E tap: flag creep'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'ring-scan compare', input: 'e-hold+swing+look+e-tap', win: 'both pad rings scanned at an even pace and each offset judged against last week\'s log line for creep',
    fail: 'whipping the scanner round so ring segments are skipped, or judging creep from this week\'s reading alone',
    rule: 'Scan: E held, turn either way between slow and brisk; too fast skips a segment. Judge: if this week minus last week is more than 0.08 mm, it is creep (look right, tap E); otherwise normal (look left, tap E).' },
  rush: 'Took one reading per pad and wrote "nominal".',
  captions: { skipped: 'scanner skip beep', 'missed creep': 'log flag tone', 'false creep': 'log flag tone' },
  says: { skipped: 'Turned too fast: the scanner skipped a segment of the ring. Keep an even pace.', 'missed creep': 'The offset has crept since last week: that needed flagging.', 'false creep': 'Same as last week, within tolerance: that was normal.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad 3 base plate', prop: 'pad' }, { name: 'Pad 5 base plate', prop: 'beampedestal' }]), r = m.rnd, fast = m.calm ? 2.1 : 1.8;
    const c0 = r() < 0.5, cr = [c0, c0 ? r() < 0.4 : true];
    m.pads = m.sites.map((_, i) => { const last = +rf(r, 0.1, 0.4).toFixed(2), creep = cr[i]; const now = +(last + (creep ? rf(r, 0.11, 0.2) : rf(r, -0.04, 0.04))).toFixed(2); return { last, now, creep, cov: 0, cool: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.pads[i], sw = Math.abs(inp.swing || 0); p.cool -= dt;
      if (p.cov < 1) {
        if (inp.hold && sw > fast) { if (p.cool <= 0) { m.fault('skipped'); p.cov = Math.max(0, p.cov - 0.25); p.cool = 0.6; } }
        else if (inp.hold && sw > 0.35) p.cov = Math.min(1, p.cov + sw * dt / 2.4);
      } else if (inp.press) {
        const look = inp.look || 0; if (Math.abs(look) < 0.25) return;
        const flag = look < 0; if (flag !== p.creep) m.fault(p.creep ? 'missed creep' : 'false creep'); m.finish(i); return;
      }
      s.prog = clamp(p.cov * 0.8);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pads[i]; if (p.cov < 1) return { at: i, hold: true, swing: 1.1 }; const t = f % 4 === 0; return { at: i, look: p.creep ? -0.4 : 0.4, hold: t, press: t }; };
    m.bad = () => ({ at: m.next, hold: true, swing: 3 });
    m.view = () => ({ pads: m.pads.map(p => [p.last, p.now]) });
    m.panel = (i) => { const p = m.pads[i]; if (!p) return null; return p.cov < 1 ? { label: 'Quick scan ring', value: `${Math.round(p.cov * 100)} % covered`, bar: p.cov } : { label: 'Alignment offset', value: `this week ${p.now.toFixed(2)} mm · last week ${p.last.toFixed(2)} mm`, bar: clamp(p.now / 0.7) }; };
    m.prompt = (i) => { const p = m.pads[i]; if (!p) return ''; return p.cov < 1 ? 'Hold [E] and turn at an even pace to scan round the ring' : 'Compare with last week: look left + tap [E] = normal, look right + tap [E] = flag creep (> 0.08 mm)'; };
    return m;
  },
});
