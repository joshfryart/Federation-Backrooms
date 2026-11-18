// EPS tech: junction and tap inspection round. Hold the tricorder steady on each tap (E held, view on the tap) until the load reading settles;
// a snap reading taken before it settles is worthless. Then judge the breaker: a tap that has tripped for the first time gets ONE reset (tap E);
// a tap whose junction book already shows a trip has tripped again and must be tagged out (hold E), never reset a second time.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Junction and tap inspection round', type: 'loop' },
  title: 'Tap dwell-read and one-reset rule', dept: 'engineering', host: 'room', item: 'tricorder_eng', siteName: 'Tap', verb: 'Read',
  how: 'At each tap hold E with the tricorder aimed on it until the load settles, then let go. A first trip gets one reset (tap E); a tap the book shows tripped before is tagged out (hold E).',
  keys: ['E hold, view on the tap: read', 'E tap: reset a first trip', 'E hold: tag out a repeat tripper'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'dwell-read and reset', input: 'e-hold+look+e-tap', win: 'every tap read only after its load settled, first trips reset exactly once and repeat trippers tagged out',
    fail: 'snatching a reading before it settles, or resetting a breaker the junction book shows has already tripped',
    rule: 'Hold E with the tricorder on the tap (view inside the aim marks) until SETTLED, then let go. TRIPPED with 0 prior trips: one tap of E resets it. TRIPPED with a prior trip in the book: hold E to tag it out; a tap there is a blackout.' },
  rush: 'Glanced at each tap in passing and slapped every breaker back in.',
  captions: { 'snap reading': 'tricorder chirps short', blackout: 'junction thumps dark' },
  says: { 'snap reading': 'You pulled the tricorder off before the load settled. Hold it on the tap until it reads SETTLED.', blackout: 'That tap had tripped before: resetting it again dropped the section. Tag repeat trippers out.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Tap 1', prop: 'relayrack' }, { name: 'Tap 2', prop: 'servers' }, { name: 'Tap 3', prop: 'baycontrol' }, { name: 'Tap 4', prop: 'reactorstation' }]), r = m.rnd;
    const dwell = 1.2, aim = m.calm ? 0.35 : 0.25, tagT = m.calm ? 0.9 : 1.1;
    const kinds = shuffle(r, ['first', 'repeat', ...shuffle(r, ['ok', 'ok', 'first', 'repeat']).slice(0, 2)]);
    m.taps = m.sites.map((_, i) => ({ kind: kinds[i], load: ri(r, 48, 97), read: 0, phase: 'read', h: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, k = m.taps[i];
      if (k.phase === 'read') {
        if (inp.hold) { if (Math.abs(inp.look || 0) < aim) k.read = Math.min(dwell, k.read + dt); else k.read = 0; }
        if (rel) { if (k.read < dwell) { m.fault('snap reading'); k.read = 0; } else if (k.kind === 'ok') { m.finish(i); return; } else { k.phase = 'judge'; m.ev('tripped', { site: i }); } }
        s.prog = k.read / dwell * 0.6;
      } else {
        if (inp.press) k.h = 0;
        if (inp.hold) { k.h += dt; if (k.kind === 'first') { m.finish(i); return; } if (k.h >= tagT) { m.finish(i); return; } }
        if (rel && k.kind === 'repeat' && k.h < tagT) { if (k.h < 0.35) m.fault('blackout'); k.h = 0; }
        s.prog = 0.6 + clamp(k.h / tagT) * 0.35;
      }
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.taps[i]; if (k.phase === 'read') return { at: i, hold: k.read < dwell, look: 0 }; return { at: i, hold: true, press: !m.prev, look: 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 8 < 3, press: f % 8 === 0, look: 0 });
    m.view = () => ({ taps: m.taps.map(k => [k.kind, k.load]) });
    m.panel = (i) => { const k = m.taps[i]; if (!k) return null; if (k.phase === 'read') return { label: k.read >= dwell ? 'SETTLED' : 'Load (settling)', value: k.read >= dwell ? `${k.load} %` : `${Math.round(k.load * (0.4 + 0.6 * k.read / dwell))} %…`, bar: k.read / dwell, band: [0.98, 1] };
      return { label: k.kind === 'first' ? 'TRIPPED · book: 0 prior' : 'TRIPPED AGAIN · book: 1 prior', value: k.kind === 'first' ? 'reset once' : 'tag out', bar: clamp(k.h / tagT) }; };
    m.prompt = (i) => { const k = m.taps[i]; if (!k) return ''; if (k.phase === 'read') return k.read >= dwell ? 'Settled: let go of [E] and check the breaker' : 'Hold [E] with the tricorder on the tap until the load settles';
      return k.kind === 'first' ? 'First trip: tap [E] once to reset it' : 'It has tripped before: hold [E] to tag it out, do not reset'; };
    return m;
  },
});
