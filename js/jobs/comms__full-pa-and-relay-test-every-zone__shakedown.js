// Comms officer, shakedown: full PA and relay test, every zone. At each zone plate key the mic and speak the four-beat test phrase in time:
// tap E on each beat of the cadence ("zone — test — one — two"). Off the beat the phrase is garbled. Then listen at the grille: a clean echo
// is a pass (tap E to mark it), a dead grille or a clipped echo is a fail (hold E to mark it, noting the speaker). Marking before the echo
// has come back, or marking it wrong, are faults.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const ECHO = { clean: 'clean echo', dead: 'DEAD — no echo', clip: 'CLIPPED echo' };

export default define({
  job: { billet: 'comms', label: 'Full PA and relay test, every zone', type: 'task:shakedown' },
  title: 'Zone phrase cadence and grille verdict', dept: 'operations', host: 'room', siteName: 'Zone', verb: 'Test',
  how: 'At each zone plate tap E on the four beats of the test phrase, listen to what comes back from the grille, then tap E to mark a clean zone or hold E to mark a dead or clipped one.',
  keys: ['E taps on the beat: speak', 'E tap: pass', 'E hold: fail'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'cadence and verdict', input: 'e-tap+e-hold+rhythm', win: 'every zone spoken to in cadence, its echo heard out, and passed or failed correctly on the checklist',
    fail: 'garbling the phrase off the beat, marking before the echo returns, or passing a dead or clipped zone',
    rule: 'First tap starts the beat; tap again on each of the next three beats. Wait for the echo line, then tap for clean, hold for dead or clipped.' },
  rush: 'Tested the zone next to the junction and ticked the rest as passed.',
  captions: { garbled: 'phrase garbles', early: 'checklist smudged', 'mis-marked': 'checklist crossed out', beat: 'syllable' },
  says: { garbled: 'Off the beat — the phrase garbled. Start again and keep the cadence.', early: 'You marked it before the echo came back. Listen first.', 'mis-marked': 'Wrong mark for what the grille gave back.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'PA zone plate, deck 2', prop: 'commsstation' }, { name: 'PA zone plate, deck 3', prop: 'console' }, { name: 'PA zone plate, deck 4', prop: 'relayrack' }, { name: 'PA zone plate, deck 5', prop: 'servers' }]), r = m.rnd;
    const T = m.calm ? 0.7 : 0.6, win = m.calm ? 0.17 : 0.13, lis = 0.9, bad = shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2));
    m.zones = m.sites.map((_, i) => ({ echo: bad.includes(i) ? (r() < 0.5 ? 'dead' : 'clip') : 'clean', ph: 'speak', t0: -1, k: 0, lt: 0, mh: -1 }));
    const reset = (z) => { z.ph = 'speak'; z.t0 = -1; z.k = 0; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, z = m.zones[i];
      if (z.ph === 'speak') {
        if (z.t0 >= 0 && m.t > z.t0 + z.k * T + win) reset(z);
        if (inp.press) { if (z.t0 < 0) { z.t0 = m.t; z.k = 1; } else if (Math.abs(m.t - (z.t0 + z.k * T)) <= win) z.k++; else { m.fault('garbled'); reset(z); }
          m.ev('beat', { site: i }); if (z.k >= 4) { z.ph = 'listen'; z.lt = 0; } }
        s.prog = 0.4 * z.k / 4; return;
      }
      if (z.ph === 'listen') { if (inp.press) { m.fault('early'); return; } z.lt += dt; if (z.lt >= lis) { z.ph = 'mark'; z.mh = -1; } s.prog = 0.4 + 0.3 * z.lt / lis; return; }
      if (inp.press) z.mh = 0; if (inp.hold && z.mh >= 0) z.mh += dt;
      if (z.mh >= 0.75 || (rel && z.mh >= 0)) { const failMark = z.mh >= 0.75; if (!failMark && z.mh > 0.3) { z.mh = -1; return; } z.mh = -2;
        if (failMark === (z.echo !== 'clean')) { m.finish(i); return; } m.fault('mis-marked'); z.mh = -1; }
      s.prog = 0.7 + 0.25 * clamp(Math.max(0, z.mh) / 0.75);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const z = m.zones[i];
      if (z.ph === 'speak') { const go = z.t0 < 0 || m.t >= z.t0 + z.k * T - 0.02; return { at: i, hold: go, press: go }; }
      if (z.ph === 'listen') return { at: i, hold: false };
      if (z.echo === 'clean') return z.mh === -1 ? { at: i, hold: true, press: true } : { at: i, hold: false };
      return z.mh === -1 ? { at: i, hold: true, press: true } : { at: i, hold: z.mh >= 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 3 === 0, press: f % 3 === 0 });
    m.view = () => ({ z: m.zones.map(z => z.echo) });
    m.panel = (i) => { const z = m.zones[i]; if (!z) return null; if (z.ph === 'speak') return { label: 'Phrase', value: ['zone', 'test', 'one', 'two'].map((w, k) => k < z.k ? w.toUpperCase() : w).join(' · '), bar: z.k / 4 };
      if (z.ph === 'listen') return { label: 'Grille', value: 'listening…', bar: z.lt / lis }; return { label: 'Grille', value: ECHO[z.echo], bar: clamp(Math.max(0, z.mh) / 0.75) }; };
    m.prompt = (i) => { const z = m.zones[i]; return !z ? '' : z.ph === 'speak' ? 'Tap [E] on each beat of the test phrase' : z.ph === 'listen' ? 'Listen at the grille…' : 'Tap [E] to pass a clean zone, hold [E] to fail it'; };
    return m;
  },
});
