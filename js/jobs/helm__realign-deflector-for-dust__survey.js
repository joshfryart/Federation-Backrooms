// Helm: realign the deflector for dust. Under the helm console the deflector alignment ring turns one detent per tap of E, only one way,
// and wraps round after eight. Each detent shows its hull-pitting risk. Several detents dip; only one is the deepest. Click the whole way
// round once, remember the deepest dip, click on to it, and hold E to lock the harmonic. Locking a shallower dip leaves the hull pitting.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Realign deflector for dust', type: 'task:survey' },
  title: 'Detent ring deepest-dip lock', dept: 'flight', host: 'room', siteName: 'Ring', verb: 'Align',
  how: 'Tap E to click the deflector ring round one detent at a time and read the pitting risk at each. Go all the way round, then come back to the lowest reading and hold E to lock it.',
  keys: ['tap E: one detent', 'hold E: lock'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'survey the detents', input: 'e-tap+e-hold', win: 'both deflector rings locked at the single deepest pitting dip after a full turn of the detents',
    fail: 'locking the first lower reading when a deeper dip waits further round the ring',
    rule: 'Each tap of E moves the ring one detent (one way, wrapping after eight) and shows that detent\'s pitting risk. Holding E for a second locks the current detent; only the deepest of the dips is right.' },
  rush: 'Locked the deflector at the first notch that looked a bit better.',
  captions: { 'shallow dip locked': 'pitting alarm ticks' }, says: { 'shallow dip locked': 'There is a deeper dip further round. Keep clicking and find the lowest.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Port deflector ring', prop: 'helm' }, { name: 'Starboard deflector ring', prop: 'console' }]), r = m.rnd, lockT = m.calm ? 0.8 : 1.0;
    m.rings = m.sites.map(() => {
      const v = Array.from({ length: 8 }, () => ri(r, 55, 90)), d = shuffle(r, [1, 2, 3, 4, 5, 6, 7]).slice(0, 3);
      v[d[0]] = ri(r, 12, 20); v[d[1]] = ri(r, 28, 36); v[d[2]] = ri(r, 30, 42);
      return { v, best: d[0], pos: 0, seen: new Set([0]), holdT: 0 };
    });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, g = m.rings[i];
      if (inp.hold) { g.holdT += dt; if (g.holdT >= lockT) { g.holdT = -99; if (g.pos === g.best) { m.finish(i); return; } m.fault('shallow dip locked'); } }
      if (rel) { if (g.holdT > 0 && g.holdT < 0.3) { g.pos = (g.pos + 1) % 8; g.seen.add(g.pos); } g.holdT = 0; }
      s.prog = clamp(g.seen.size / 8) * 0.8;
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const g = m.rings[i];
      if (g.seen.size >= 8 && g.pos === g.best) return { at: i, hold: true };
      const t = f % 6 === 0; return { at: i, hold: t, press: t };
    };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ rings: m.rings.map(g => g.v) });
    m.panel = (i) => { const g = m.rings[i]; return g ? { label: `Detent ${g.pos + 1}/8 · pitting risk`, value: `${g.v[g.pos]} %`, bar: g.v[g.pos] / 100, band: [0, 0.22] } : null; };
    m.prompt = (i) => { const g = m.rings[i]; return !g ? '' : g.seen.size < 8 ? 'Tap [E] to click the ring round one detent; read every detent' : 'Click on to the lowest reading, then hold [E] to lock it'; };
    return m;
  },
});
