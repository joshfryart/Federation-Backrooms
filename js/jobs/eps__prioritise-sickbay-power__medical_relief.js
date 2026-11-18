// EPS tech: prioritise sickbay power (medical relief). Each feed on the sickbay junction has a priority rotary. Read the bed card: a critical
// patient's bed goes to priority 1, a stable patient's bed to 2, the lights to 3. Tap E to click the rotary round, then hold E and watch that
// feed's lamp through the count. A feed on the wrong rung flickers during the watch (a fault): treatment power must never dip.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Prioritise sickbay power', type: 'task:medical_relief' },
  title: 'Priority ladder by patient risk', dept: 'engineering', host: 'room', siteName: 'Feed', verb: 'Rank',
  how: 'At each feed read the card (critical bed: 1, stable bed: 2, lights: 3). Tap E to click its rotary to that rung, then hold E and watch its lamp for the full count.',
  keys: ['E tap: click the rotary', 'E hold: watch the lamp count'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'rank the feeds', input: 'e-tap+e-hold', win: 'every sickbay feed set on its risk rung and watched through a full count without a flicker',
    fail: 'watching a feed sat on the wrong rung so its biobed lamp flickers mid-treatment',
    rule: 'A short tap of E clicks the rotary 1, 2, 3, round again. Holding E starts the lamp watch; it only completes if the rung matches the card (critical 1, stable 2, lights 3). A wrong rung flickers about a second in.' },
  rush: 'Put everything on priority one and hoped the reactor kept up.',
  captions: { flicker: 'biobed monitor blips' }, says: { flicker: 'The lamp flickered: that feed is on the wrong rung. Check the card and click the rotary round.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biobed 1 feed', prop: 'biobed' }, { name: 'Biobed 2 feed', prop: 'biobed' }, { name: 'Biobed 3 feed', prop: 'exam_couch' }, { name: 'Lights feed', prop: 'nursestation' }]), r = m.rnd;
    const count = m.calm ? 2.0 : 2.4, tapT = 0.3, crit = shuffle(r, [true, true, false]).map((c, k) => k === 2 && r() < 0.5 ? !c : c);
    m.feeds = m.sites.map((_, i) => { const need = i === 3 ? 3 : crit[i] ? 1 : 2; let p = ri(r, 1, 3); if (p === need) p = need % 3 + 1; return { need, p, h: 0, flick: 0 }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, f = m.feeds[i];
      if (inp.hold) { f.h += dt; if (f.h > tapT && f.p !== f.need && f.h > tapT + 1.0) { m.fault('flicker'); f.h = tapT; } if (f.h - tapT >= count && f.p === f.need) { m.finish(i); return; } }
      if (rel) { if (f.h > 0 && f.h < tapT) { f.p = f.p % 3 + 1; m.ev('click', { site: i, p: f.p }); } f.h = 0; }
      s.prog = clamp((f.h - tapT) / count) * 0.95;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.feeds[i]; if (d.p !== d.need) { const p = f % 4 < 2; return { at: i, hold: p, press: f % 4 === 0 }; } return { at: i, hold: true, press: !m.prev }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ f: m.feeds.map(d => [d.need, d.p]) });
    m.panel = (i) => { const d = m.feeds[i]; if (!d) return null; const card = i === 3 ? 'Lights' : d.need === 1 ? 'Card: CRITICAL' : 'Card: stable'; return { label: `${card} · rotary on ${d.p}`, value: d.h > tapT ? `watching ${Math.max(0, d.h - tapT).toFixed(1)} / ${count} s` : 'tap to click, hold to watch', bar: clamp((d.h - tapT) / count) }; };
    m.prompt = (i) => { const d = m.feeds[i]; return !d ? '' : 'Tap [E] to click the rotary to the card\'s rung (critical 1, stable 2, lights 3), then hold [E] and watch the lamp'; };
    return m;
  },
});
