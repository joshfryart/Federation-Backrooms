// Armory: force-field emitter test along the brig corridor. At each emitter housing press the tester probe to the grille (keep the view on it)
// and hold E for the full three-second count while the bar graph jumps. The tester then shows the averaged reading. A FLICKER result (big
// spread) is a noisy field, not a verdict: press and hold again for a fresh three-count. A steady average under the lower mark is a weak
// emitter: tap E to hang a weak-tag on it. A steady reading over the mark logs itself. Cutting a count short or letting the probe slide off
// the grille spoils the reading.
import { define, machine, room, rf, ri, shuffle, clamp } from './kit.js';

const MARK = 0.6;
export default define({
  job: { billet: 'armory', label: 'Force-field emitter test', type: 'loop' },
  title: 'Brig emitter three-count', dept: 'security', host: 'room', siteName: 'Housing', verb: 'Test',
  how: 'Keep the probe on the grille and hold E through the three-second count. FLICKER means re-read: hold again. A steady average under the lower mark: tap E to hang a weak-tag.',
  keys: ['E hold: three-second reading', 'E tap: hang weak-tag', 'keep the view on the grille'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'three-count read', input: 'e-hold+e-tap+look', win: 'each corridor emitter given a full three-second probe reading, noisy ones re-read and every steady weak one weak-tagged',
    fail: 'cutting a count short, sliding the probe off the grille, tagging a flicker, or leaving a weak emitter untagged',
    rule: 'Aim at the grille and hold E for three seconds. FLICKER: hold again for a clean count. Average under the lower mark: tap E within two seconds to tag it. Over the mark logs itself.' },
  rush: 'Listened for the hum walking past and called the corridor good.',
  captions: { 'cut short': 'tester chirps', 'probe slipped': 'probe scrapes', 'tagged a flicker': 'tag rustles', 'weak left untagged': 'field hum dips' },
  says: { 'cut short': 'You let go before the three-second count finished.', 'probe slipped': 'The probe slid off the grille: keep your view on it while you hold.',
    'tagged a flicker': 'That was a FLICKER, not a reading. Hold E again for a fresh count.', 'weak left untagged': 'That emitter read under the lower mark. Tap E to hang the weak-tag.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [1, 2, 3, 4].map(n => ({ name: `Emitter housing ${n}`, prop: 'cellfield' }))), r = m.rnd;
    const kinds = shuffle(r, ['sound', 'noisy', 'weak', ['sound', 'weak', 'noisy'][ri(r, 0, 2)]]), aim = m.calm ? 0.24 : 0.18;
    m.em = kinds.map(k => ({ k, mean: k === 'weak' ? rf(r, 0.36, 0.52) : rf(r, 0.68, 0.88), spread: k === 'noisy' ? 0.26 : 0.05, reads: 0, cnt: 0, st: 'idle', armed: false, wait: 0, live: 0.5, avg: 0 }));
    const E = () => m.em[m.next];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const e = E(), on = Math.abs(inp.look || 0) < aim;
      if (!inp.hold) e.armed = true;
      if (inp.hold && (e.st === 'idle' || (e.st === 'flicker' && e.armed && inp.press))) { e.st = 'read'; e.cnt = 0; e.armed = false; }
      if (e.st === 'read') {
        if (inp.hold && on) { e.cnt += dt; e.live = clamp(e.mean + Math.sin(m.t * 23 + e.mean * 9) * e.spread); }
        else if (inp.hold && e.cnt > 0.2) { m.fault('probe slipped'); e.cnt = 0; }
        if (rel) { if (e.cnt > 0.2) m.fault(e.reads ? 'tagged a flicker' : 'cut short'); e.cnt = 0; e.st = e.reads ? 'flicker' : 'idle'; }
        if (e.cnt >= 3) {
          e.reads++; e.armed = false; e.cnt = 0;
          if (e.k === 'noisy' && e.reads === 1) e.st = 'flicker'; else if (e.mean < MARK) { e.st = 'weak'; e.wait = 0; } else { m.ev('logged'); m.finish(m.next); return; }
        }
      }
      if (e.st === 'weak') {
        e.wait += dt; if (inp.press && e.armed) { m.ev('tagged'); m.finish(m.next); return; }
        if (e.wait > (m.calm ? 3 : 2)) { m.fault('weak left untagged'); e.wait = 0; }
      }
      s.prog = s.done ? 1 : clamp(e.cnt / 3) * 0.9;
    };
    m.hint = () => {
      const e = E(); if (!e) return { at: -1 };
      if (e.st === 'idle' || e.st === 'read') return { at: m.next, hold: true, look: 0 };
      if (!e.armed) return { at: m.next, hold: false, look: 0 };
      return { at: m.next, press: true, hold: true, look: 0 };
    };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 45 < 30, press: f % 45 === 0, look: 0 });
    m.view = () => ({ em: m.em.map(e => [e.k, +e.mean.toFixed(2)]) });
    m.panel = (i) => {
      const e = m.em[i]; if (!e) return null;
      if (e.st === 'read') return { label: `${e.reads ? 'Re-read' : 'Count'} ${Math.min(3, e.cnt).toFixed(1)} / 3 s`, value: `${Math.round(e.live * 100)}`, bar: e.live, band: [MARK, 1] };
      if (e.st === 'flicker') return { label: 'FLICKER', value: `spread ±${Math.round(e.spread * 100)}: re-read`, bar: e.mean, band: [MARK, 1] };
      if (e.st === 'weak') return { label: 'Steady average', value: `${Math.round(e.mean * 100)} UNDER MARK`, bar: e.mean, band: [MARK, 1] };
      return { label: 'Emitter', value: m.sites[i].done ? 'logged' : 'not read', bar: 0, band: [MARK, 1] };
    };
    m.prompt = (i) => {
      const e = m.em[i]; if (!e) return '';
      return e.st === 'flicker' ? 'FLICKER: press and hold [E] again for a fresh three-count' : e.st === 'weak' ? 'Under the lower mark: tap [E] to hang a weak-tag'
        : 'Keep the probe on the grille and hold [E] through the three-second count';
    };
    return m;
  },
});
