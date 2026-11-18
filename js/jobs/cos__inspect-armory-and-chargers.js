// Chief of security: inspect the armory and chargers. Every charger lamp on the rack shows amber. A cycling charger's amber is steady and its
// cell figure creeps up while you watch; a stuck amber looks the same but the figure never moves. Aim at each lamp and hold E to watch it:
// let go after the watch mark to pass a creeping one, keep watching to the tag mark to tag a stuck one. A glance proves nothing (a fault).
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const POS = [0.3, 0, -0.3], AIM = 0.12;
export default define({
  job: { billet: 'cos', label: 'Inspect armory and chargers', type: 'loop' },
  title: 'Steady or stuck amber watch', dept: 'security', host: 'room', siteName: 'Charger bank', verb: 'Watch',
  how: 'Aim at each amber charger lamp and hold E to watch its cell figure. If it creeps up, let go after the watch mark; if it never moves, keep holding to the tag mark.',
  keys: ['look: aim at a lamp', 'E hold: watch it'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'watch the amber', input: 'look+e-hold', win: 'every amber charger lamp watched long enough to see whether its cell figure creeps, cycling ones passed and stuck ones tagged',
    fail: 'passing a stuck amber so a half-charged cell is signed into the log, or judging a lamp from a glance',
    rule: 'Aim at a lamp and hold E. After 1.5 s the watch mark is reached: let go if the cell figure has crept, otherwise keep holding to 3 s to tag it stuck. Letting go before the watch mark is a glance.' },
  rush: 'Signed the armory log on the lamp colours alone.',
  captions: { glanced: 'stylus taps', 'half-charged passed': 'log chime', 'tagged good': 'tag tears' },
  says: { glanced: 'A glance tells you nothing: watch the figure until the watch mark.', 'half-charged passed': 'That amber was stuck — the figure never moved. A half-charged cell went into the log.', 'tagged good': 'That one was creeping up: it was cycling, not stuck.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Charger rack, upper bank', prop: 'chargerack' }, { name: 'Charger rack, lower bank', prop: 'weaponrack' }]), r = m.rnd;
    const stuck = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 1 + Math.floor(r() * 2))), MARK = 1.5, TAG = 3.0;
    m.banks = m.sites.map((_, b) => POS.map((pos, k) => ({ pos, stuck: stuck.has(b * 3 + k), cell: Math.round(rf(r, 38, 82)), rate: rf(r, 1.6, 2.6), w: 0, res: 0 })));
    const aimed = (b, look) => b.find(l => !l.res && Math.abs(look - l.pos) < AIM);
    let prev = false, cur = null;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) { prev = !!inp.hold; return; } const i = m.next, bank = m.banks[i];
      const hold = !!inp.hold, l = aimed(bank, inp.look || 0);
      if (hold) { if (!cur) cur = l || null; if (cur && cur === l) { cur.w += dt; if (cur.w >= TAG) { cur.res = 2; if (!cur.stuck) m.fault('tagged good'); m.ev('tag', { site: i }); cur = null; } } }
      else if (prev && cur) { if (cur.w < MARK) { m.fault('glanced'); cur.w = 0; } else { cur.res = 1; if (cur.stuck) m.fault('half-charged passed'); } cur = null; }
      prev = hold; s.prog = bank.filter(x => x.res).length / 3 * 0.95; if (bank.every(x => x.res)) m.finish(i);
    };
    m.read = (l) => l.cell + (l.stuck ? 0 : l.rate * l.w);
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const l = m.banks[i].find(x => !x.res); if (!l) return { at: i }; return { at: i, look: l.pos, hold: l.stuck ? true : l.w < MARK + 0.1 }; };
    m.bad = (f = 0) => { const i = m.next, l = i >= 0 && m.banks[i].find(x => !x.res); return { at: i, look: l ? l.pos : 0, hold: f % 8 < 4 }; };
    m.view = () => ({ banks: m.banks.map(b => b.map(l => [l.stuck, l.cell])) });
    m.panel = (i) => { const b = m.banks[i]; if (!b) return null; const l = cur || b.find(x => !x.res); if (!l) return { label: 'Bank', value: 'done', bar: 1 };
      return { label: l.w >= MARK ? 'Watched' : 'Amber lamp', value: `cell ${m.read(l).toFixed(1)} %  (Δ ${(m.read(l) - l.cell).toFixed(1)})`, bar: clamp(l.w / TAG), band: [MARK / TAG, MARK / TAG + 0.08] }; };
    m.prompt = (i) => { const b = m.banks[i]; if (!b) return ''; const l = cur; if (l && l.w >= MARK) return m.read(l) > l.cell ? 'It crept up — let go of [E] to pass it' : 'No change — keep holding [E] to tag it stuck';
      return 'Aim at an amber lamp and hold [E] to watch its cell figure'; };
    return m;
  },
});
