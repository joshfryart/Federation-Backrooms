// Computer specialist: core diagnostic sweep. At each isolinear stack hold E: the integrity check walks the stack segment by segment and clears
// whatever it passes. An amber segment on its own is a passing blip; an amber segment while the cache or network latency reads over its limit
// is a real fault, and you must let go of E while the check sits on it so the error code is read and logged before anything clears it.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

const SEGS = 8;
export default define({
  job: { billet: 'comp', label: 'Core diagnostic sweep', type: 'loop' },
  title: 'Isolinear stack integrity walk', dept: 'operations', host: 'room', siteName: 'Stack', verb: 'Sweep',
  how: 'Hold E to run each stack\'s integrity check. When the segment under check is amber AND a latency figure is over its limit, let go of E to stop and read the code. Amber with normal latency is a blip: keep holding.',
  keys: ['E hold: run the check', 'let go: stop on a real fault'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'pause on coincidence', input: 'e-hold', win: 'every stack checked end to end with each amber-plus-high-latency segment stopped on and its code logged',
    fail: 'letting the check run over a real fault so its code is cleared unread, or stopping the check on a blip or clean segment',
    rule: 'Holding E walks the check along the stack. Let go only while the current segment is amber and the cache or network latency is over its limit; hold straight through anything else.' },
  rush: 'Ran the integrity check straight through and cleared every flagged error unread.',
  captions: { 'cleared unread': 'error cleared chime', 'false stop': 'check halted blip' },
  says: { 'cleared unread': 'The check cleared a real fault before you read its code — stop on amber with high latency.', 'false stop': 'Stopped on a blip: amber with normal latency is not a fault.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Stack A diagnostic panel', prop: 'servers' }, { name: 'Stack B diagnostic panel', prop: 'relayrack' }, { name: 'Stack C diagnostic panel', prop: 'servers' }]), r = m.rnd;
    const rate = m.calm ? 1.1 : 1.6;
    m.stacks = m.sites.map(() => {
      const lc = ri(r, 30, 45), ln = ri(r, 60, 90), idx = shuffle(r, [1, 2, 3, 4, 5, 6, 7]), nReal = ri(r, 1, 2), nBlip = ri(r, 1, 2);
      const segs = Array.from({ length: SEGS }, () => ({ amber: false, real: false, cache: ri(r, 8, lc - 6), net: ri(r, 20, ln - 10), logged: false }));
      idx.slice(0, nReal).forEach(k => { const s = segs[k]; s.amber = s.real = true; if (r() < 0.5) s.cache = lc + ri(r, 5, 30); else s.net = ln + ri(r, 10, 50); });
      idx.slice(nReal, nReal + nBlip).forEach(k => { segs[k].amber = true; });
      idx.slice(nReal + nBlip, nReal + nBlip + 1).forEach(k => { if (r() < 0.5) segs[k].cache = lc + ri(r, 5, 20); else segs[k].net = ln + ri(r, 10, 30); });   // high latency, no amber
      return { lc, ln, segs, p: rf(r, 0, 0.2) };
    });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, st = m.stacks[i];
      const k = Math.floor(st.p), seg = st.segs[k];
      if (rel && seg) { if (seg.real && !seg.logged) { seg.logged = true; m.ev('logged', { site: i, seg: k }); } else m.fault('false stop'); }
      if (inp.hold) {
        const np = st.p + rate * dt, nk = Math.floor(np);
        if (nk > k && seg && seg.real && !seg.logged) { seg.logged = true; m.fault('cleared unread'); }
        st.p = np; if (st.p >= SEGS) { m.finish(i); return; }
      }
      s.prog = clamp(st.p / SEGS, 0, 0.98);
    };
    const curSeg = () => { const st = m.stacks[m.next]; return st ? st.segs[Math.floor(st.p)] : null; };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const g = curSeg(); return { at: i, hold: !(g && g.real && !g.logged) }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ s: m.stacks.map(st => st.segs.map(g => (g.real ? 2 : g.amber ? 1 : 0))) });
    m.panel = (i) => {
      const st = m.stacks[i]; if (!st) return null; const k = Math.min(SEGS - 1, Math.floor(st.p)), g = st.segs[k];
      return { label: `Segment ${k + 1}/${SEGS} ${g.amber ? '▲ AMBER' : '● ok'}`, value: `cache ${g.cache}/${st.lc} ms · net ${g.net}/${st.ln} ms${g.logged ? ' · code logged' : ''}`, bar: st.p / SEGS };
    };
    m.prompt = (i) => { const g = m.stacks[i] && curSeg(); return !g ? '' : g.amber && g.real && !g.logged ? 'Amber and latency over the limit: let go of [E] to read the code' : 'Hold [E] to run the integrity check along the stack'; };
    return m;
  },
});
