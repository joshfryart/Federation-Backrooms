// Damage control: inspect cargo bay tie-downs. At each strap, grip it (hold E) and yank it toward you (turn the view back sharply) to read
// the tension at that end; let go, then grip and yank the other end. A strap can be tight at one end and slack at the other, and the second
// read also shows the webbing. Then judge it: a quick tap of E clears a sound strap, holding E (still) for over a second swaps a slack or
// frayed one. Clearing a bad strap, swapping a sound one, or wrenching so hard the anchor bends are faults.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const MARK = 60;
export default define({
  job: { billet: 'dc', label: 'Inspect cargo bay seals and tie-downs', type: 'task:cargo_run' },
  title: 'Two-end strap yank test', dept: 'engineering', host: 'room', siteName: 'Strap', verb: 'Tug',
  how: 'Hold E and turn the view sharply back to yank the strap: read one end, let go, then yank the other. Both ends at or over the mark and no fraying: tap E to clear it. Otherwise hold E still for over a second to swap it.',
  keys: ['E hold + sharp turn right: yank', 'E tap: clear', 'E hold still: swap the strap'], limit: 38, maxFaults: 2,
  fingerprint: { verb: 'yank both ends', input: 'e-hold+e-tap+swing', win: 'every tie-down yanked at both ends and judged: sound straps cleared, slack or frayed straps swapped',
    fail: 'clearing a strap that is slack at one end because the other end yanked tight, swapping good webbing, or wrenching the anchor',
    rule: 'Grip with E and swing the view right briskly (not violently) for a moment to read an end; release and repeat for the far end. Any end under the mark or frayed webbing means swap (long still hold); otherwise clear (quick tap).' },
  rush: 'Gave each strap a slap and said the bay was secure.',
  captions: { 'shifted cargo': 'crates groan', 'wasted strap': 'ratchet clatters', wrenched: 'anchor creaks' },
  says: { 'shifted cargo': 'That strap was slack or frayed — it needed swapping. The load can shift.', 'wasted strap': 'That strap was sound at both ends. Tap E to clear it.', wrenched: 'Too hard — you are bending the anchor. A brisk tug is enough.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Rail strap A', prop: 'pallet_loaded' }, { name: 'Rail strap B', prop: 'crate' }, { name: 'Rail strap C', prop: 'pallet' }, { name: 'Rail strap D', prop: 'hoversled' }]), r = m.rnd;
    const bad = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 2, 3))), yankT = m.calm ? 0.3 : 0.4, hard = m.calm ? -4.5 : -3.6;
    m.st = m.sites.map((_, i) => { const b = bad.has(i), how = b ? (r() < 0.6 ? 'slack' : 'fray') : 'ok', slackEnd = ri(r, 0, 1);
      return { how, ends: [0, 1].map(e => how === 'slack' && e === slackEnd ? ri(r, 25, 52) : ri(r, MARK + 4, 95)), end: 0, yk: 0, read: [], needRel: false, held: 0, phase: 'tug' }; });
    const isBad = (t) => t.how !== 'ok';
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, t = m.st[i], sw = inp.swing || 0;
      if (t.phase === 'tug') {
        if (rel) { t.needRel = false; t.yk = 0; if (t.end >= 2) { t.phase = 'judge'; t.held = 0; } }
        if (!inp.hold || t.needRel) return;
        if (sw < hard) { m.fault('wrenched'); t.yk = 0; t.needRel = true; return; }
        if (sw < -1.0) t.yk += dt; if (t.yk >= yankT) { t.read.push(t.ends[t.end]); t.end++; t.needRel = true; m.ev('read', { site: i }); }
      } else {
        if (inp.press) t.held = 0; if (inp.hold) t.held += dt;
        if (rel) { if (t.held < 0.3) { if (isBad(t)) { m.fault('shifted cargo'); t.held = 0; return; } m.finish(i); return; }
          if (t.held >= 1.2) { if (!isBad(t)) { m.fault('wasted strap'); t.held = 0; return; } m.ev('swapped', { site: i }); m.finish(i); return; } t.held = 0; }
      }
      s.prog = s.done ? 1 : clamp(t.read.length * 0.4 + (t.phase === 'judge' ? Math.min(0.1, t.held / 12) : 0), 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const t = m.st[i];
      if (t.phase === 'tug') return t.needRel || t.end >= 2 ? { at: i, hold: false } : { at: i, hold: true, swing: -1.8 };
      if (isBad(t)) return m.prev ? { at: i, hold: t.held < 1.3, swing: 0 } : { at: i, press: true, hold: true, swing: 0 };
      return m.prev ? { at: i, hold: false } : { at: i, press: true, hold: true }; };
    m.bad = () => { const i = m.next, t = m.st[i]; if (t.phase === 'tug') return t.needRel || t.end >= 2 ? { at: i, hold: false } : { at: i, hold: true, swing: -1.8 }; return m.prev ? { at: i, hold: false } : { at: i, press: true, hold: true }; };
    m.view = () => ({ st: m.st.map(t => [t.how, ...t.ends]) });
    m.panel = (i) => { const t = m.st[i]; if (!t) return null; const rd = t.read.map((v, k) => `end ${k + 1}: ${v}${v < MARK ? ' SLACK' : ''}`).join(' · ');
      return { label: (rd || 'Grip and yank an end') + (t.read.length === 2 && t.how === 'fray' ? ' · webbing FRAYED' : t.read.length === 2 ? ' · webbing sound' : ''), value: `mark ${MARK} daN`, bar: t.read.length ? clamp(t.read[t.read.length - 1] / 100) : 0, band: [MARK / 100, 1] }; };
    m.prompt = (i) => { const t = m.st[i]; if (!t) return ''; if (t.phase === 'tug') return t.needRel ? 'Let go of [E], then grip the other end' : 'Hold [E] and yank: turn the view sharply right';
      return 'Quick tap [E] to clear the strap, or hold [E] still over a second to swap it'; };
    return m;
  },
});
