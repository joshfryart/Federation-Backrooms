// Guard: routine patrol of all decks on a quiet watch. Climb landing by landing. At each landing hold E to press the lift door seal until it
// sits firm, let go, then stand still and listen to the closed doors along the corridor. Voices only come through once you have been still for
// a moment: tap E to note them. A quiet landing clears after a full listen. Turning away mid-listen means you walked on without hearing it;
// noting voices that were never there, missing real ones or letting go of the seal early are faults. The round is logged at the quarters end.
import { define, machine, room, rf, shuffle, ri } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Routine patrol of all decks', type: 'task:quiet_watch' },
  title: 'Landing seal and listen round', dept: 'security', host: 'room', siteName: 'Landing', verb: 'Listen',
  how: 'At each landing hold E to press the lift seal until it is firm, then let go and stand still to listen. If voices come through, tap E to note them. Keep your head still while you listen.',
  keys: ['E hold: press the seal', 'stand still and listen', 'E tap: note voices'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'press and listen', input: 'e-hold+e-tap+turn',
    win: 'every deck landing seal pressed firm and a still full listen at each, real voices noted and quiet landings left clean before the round is logged',
    fail: 'turning away mid-listen, noting voices that were not there, missing real ones, or releasing the seal before it is firm',
    rule: 'Hold E until the seal meter is full, release, then keep the view still. After about a second voices may show: tap E. Turning your head resets the listen.' },
  rush: 'Took the ladder two rungs at a time and logged every deck quiet.',
  captions: { 'seal unchecked': 'seal hisses', 'walked on': 'footsteps hurry on', phantom: 'pencil scratch', 'missed voices': 'muffled voices fade' },
  says: { 'seal unchecked': 'Press the seal until it sits firm.', 'walked on': 'You turned away mid-listen. Stand still.', phantom: 'There were no voices there.', 'missed voices': 'There were voices behind that door. Note them.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Deck 6 landing', prop: 'airlock_doors' }, { name: 'Deck 5 landing', prop: 'airlock_doors' }, { name: 'Deck 4 landing', prop: 'airlock_doors' }, { name: 'Quarters corridor log', prop: 'console' }]), r = m.rnd;
    const loud = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2))), full = m.calm ? 2.1 : 1.7;
    m.land = [0, 1, 2].map(i => ({ voices: loud.has(i), hearAt: rf(r, 0.7, 1.1), seal: 0, ph: 'seal', still: 0, rate: rf(r, 1.1, 1.5) }));
    m.log = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { m.log = inp.hold ? m.log + dt : 0; if (m.log >= 0.8) m.finish(3); s.prog = Math.min(0.9, m.log); return; }
      const L = m.land[i];
      if (L.ph === 'seal') { if (inp.hold) L.seal = Math.min(1, L.seal + L.rate * dt); if (rel) { if (L.seal >= 1) { L.ph = 'listen'; L.still = 0; } else { m.fault('seal unchecked'); L.seal = 0; } } }
      else {
        if ((inp.turn || 0) > 0.6) { if (L.still > 0.3) m.fault('walked on'); L.still = 0; }
        else L.still += dt;
        const audible = L.voices && L.still >= L.hearAt;
        if (inp.press) { if (audible) { m.ev('noted', { site: i }); m.finish(i); return; } m.fault('phantom'); }
        if (L.still >= full) { if (L.voices) m.fault('missed voices'); m.finish(i); return; }
      }
      s.prog = L.ph === 'seal' ? L.seal * 0.3 : 0.3 + 0.6 * Math.min(1, L.still / full);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: 3, hold: true };
      const L = m.land[i]; if (L.ph === 'seal') return { at: i, hold: L.seal < 1 }; return { at: i, turn: 0, press: L.voices && L.still >= L.hearAt }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const L = m.land[i] || {}; if (L.ph === 'seal') return { at: i, hold: f % 20 < 8 }; return { at: i, turn: 2, press: false }; };
    m.view = () => ({ land: m.land.map(L => [L.voices, +L.hearAt.toFixed(2)]) });
    m.panel = (i) => { if (i === 3) return { label: 'Round log', value: 'hold to log', bar: Math.min(1, m.log / 0.8) }; const L = m.land[i]; if (!L) return null;
      if (L.ph === 'seal') return { label: 'Seal', value: L.seal >= 1 ? 'FIRM: let go' : `${Math.round(L.seal * 100)} %`, bar: L.seal, band: [0.98, 1] };
      const audible = L.voices && L.still >= L.hearAt; return { label: audible ? 'VOICES' : 'Listening', value: audible ? 'behind a cabin door' : 'quiet…', bar: Math.min(1, L.still / full) }; };
    m.prompt = (i) => { if (i === 3) return 'Hold [E] to log the full round'; const L = m.land[i]; if (!L) return '';
      return L.ph === 'seal' ? 'Hold [E] on the lift seal until it is firm, then let go' : 'Stand still and listen; tap [E] only if you hear voices'; };
    return m;
  },
});
