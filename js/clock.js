// Ship clock and watches. Pure logic, no three.js, no DOM.
//   ShipClock: ship hour 0..24; a ~20 real-minute run is ~6 ship hours (1 real second = 0.005 ship hours); time-skip.
//   Watches: alpha (ship hour 0-8), beta (8-16), gamma (16-24). Every crew member belongs to one; their daily_template
//   (js/crew-sim data, `h` = ship hours since their watch began) is read at `localHour(person)`.
import { mulberry32 } from './data.js';

export const HOURS_PER_SECOND = 0.005;
export const WATCHES = ['alpha', 'beta', 'gamma'];
export const WATCH_START = { alpha: 0, beta: 8, gamma: 16 };
// billets that can stand a bridge post (used so no watch is ever left without one)
export const BRIDGE_BILLETS = ['co', 'xo', 'so', 'cfo', 'helm', 'nav', 'ops', 'comms'];
const COMMAND_HEADS = new Set(['co', 'xo', 'so', 'cfo', 'ops', 'ce', 'cos', 'cso', 'cmo', 'qm']);

export const hash = (...parts) => { let h = 2166136261; for (const p of parts) for (const ch of String(p)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h ^ (h >>> 13)) >>> 0; };
export const hash01 = (...parts) => mulberry32(hash(...parts))();

export class ShipClock {
  constructor({ seed = 1, startHour = null, rate = HOURS_PER_SECOND } = {}) {
    this.seed = seed; this.rate = rate; this.real = 0; this.skipped = 0;
    // the run begins in the first part of some watch so that a watch change falls inside a ~6 hour run most of the time
    const r = mulberry32(hash('clock', seed));
    this.start = startHour ?? (Math.floor(r() * 3) * 8 + r() * 4);
  }
  get hour() { return (this.start + this.real * this.rate + this.skipped) % 24; }
  get elapsedHours() { return this.real * this.rate + this.skipped; }
  get runMinutes() { return this.real / 60; }
  // advance by real seconds; returns the watch-change boundary crossed (0, 8 or 16) or null
  advance(dt) {
    const before = this.start + this.elapsedHours; this.real += dt;
    const after = this.start + this.elapsedHours; return this._crossed(before, after);
  }
  skip(hours) { const before = this.start + this.elapsedHours; this.skipped += hours; return this._crossed(before, this.start + this.elapsedHours); }
  _crossed(a, b) { const na = Math.floor(a / 8), nb = Math.floor(b / 8); return nb > na ? (nb * 8) % 24 : null; }
  // watch currently on duty
  get dutyWatch() { return WATCHES[Math.floor(this.hour / 8) % 3]; }
  // ship hours since this person's watch began (0..24); the index into their daily_template
  localHour(person) { return (((this.hour - WATCH_START[this.watchOf(person)]) % 24) + 24) % 24; }
  format() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`; }

  // Deterministic watch per person from the seed. Command and department heads lean alpha. assign(roster) additionally
  // guarantees every watch has at least one bridge officer, so the bridge is never unmanned on paper (fallback: Second Officer).
  watchOf(person) {
    if (person.watch) return person.watch;
    return this._rawWatch(person);
  }
  _rawWatch(person) {
    const r = hash01('watch', this.seed, person.id ?? person.billet), head = COMMAND_HEADS.has(person.billet);
    const w = head ? [0.62, 0.24, 0.14] : [0.38, 0.32, 0.30];
    return WATCHES[r < w[0] ? 0 : r < w[0] + w[1] ? 1 : 2];
  }
  assign(roster) {
    const P = roster.people; for (const p of P) p.watch = this._rawWatch(p);
    const bridgeFolk = () => P.filter(p => BRIDGE_BILLETS.includes(p.billet));
    for (let pass = 0; pass < 6; pass++) {
      let fixed = false;
      for (const w of WATCHES) {
        if (bridgeFolk().some(p => p.watch === w)) continue;
        // move a bridge officer from the watch that has the most of them (keep one there); the Second Officer first
        const counts = Object.fromEntries(WATCHES.map(x => [x, bridgeFolk().filter(p => p.watch === x).length]));
        const donor = WATCHES.reduce((a, x) => counts[x] > counts[a] ? x : a, WATCHES[0]);
        const pool = bridgeFolk().filter(p => p.watch === donor); if (pool.length < 2) continue;
        const so = pool.find(p => p.billet === 'so'), low = pool.filter(p => p.billet !== 'co' && p.billet !== 'xo').sort((a, b) => a.rank - b.rank || a.id - b.id);
        (so || low[0] || pool[pool.length - 1]).watch = w; fixed = true;
      }
      if (!fixed) break;
    }
    return P;
  }
}
