// Deputy security chief, survey mission: post an officer at the shuttlebay door for away-team traffic. At the roster slate the names cycle
// past with their rest hours: tap E on a rested one (8 h or more) to take them. Then stand them on the marked post by the bay door and stay:
// each shuttle crossing lights the traffic board for a moment and must be logged with a tap of E while it shows. A tap with no crossing is a
// phantom entry; a crossing that goes by unlogged is a hole in the record; walking off the post mid-flight leaves it unmanned.
import { define, machine, room, ri, rf, shuffle, pick } from './kit.js';

const CREW = ['Ensign Ruiz', 'Crewman Oduya', 'Ensign Pryce', 'Lt Haddad', 'Crewman Voss', 'Ensign Lark', 'Crewman Teague'];
const CRAFT = ['Kepler', 'Halley', 'Meitner', 'Tereshkova', 'Galileo', 'Herschel'];
export default define({
  job: { billet: 'dep', label: 'Post an officer at the shuttlebay for away-team traffic', type: 'task:survey' },
  title: 'Shuttlebay post and crossing log', dept: 'security', host: 'room', siteName: 'Post', verb: 'Post',
  how: 'At the roster slate tap E when a rested officer (8 h+) is showing. Then stand on the post by the bay door and tap E each time a crossing lights the board, until the flight is done.',
  keys: ['E tap: take the rested officer', 'E tap: log a crossing'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'post and log', input: 'e-tap', win: 'a rested officer chosen and walked to the post, then every away-team crossing logged while it showed, without leaving the post',
    fail: 'posting a tired officer, logging a crossing that did not happen, missing one, or walking off the post mid-flight',
    rule: 'Roster names cycle with rest hours: tap E on 8 h or more. At the post a crossing lights the board for about a second: tap E while it is lit; never tap on a dark board, never step away.' },
  rush: 'Told the nearest ensign to keep an eye on the bay and went back to the brig.',
  captions: { 'tired posted': 'yawn on the comm', phantom: 'log scratch', unlogged: 'shuttle doors cycle', abandoned: 'empty post chime' },
  says: { 'tired posted': 'That officer is short on rest — wait for a rested name.', phantom: 'No crossing showing — only log what you see.', unlogged: 'A crossing went by unlogged.', abandoned: 'You left the post mid-flight — stay on it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Roster slate', prop: 'baycontrol' }, { name: 'Bay door post', prop: 'airlock_doors' }]), r = m.rnd, win = m.calm ? 1.8 : 1.2, per = m.calm ? 1.4 : 1.1;
    m.crew = shuffle(r, CREW).slice(0, 5).map((n, i) => ({ n, rest: i < 2 ? ri(r, 9, 13) : ri(r, 3, 7) })); m.crew = shuffle(r, m.crew);
    m.cyc = 0; m.ct = 0; m.who = null;
    let t = rf(r, 1.0, 1.6); m.cross = Array.from({ length: 4 }, () => { const c = { a: t, craft: pick(r, CRAFT), dir: r() < 0.5 ? 'out' : 'in', log: false, miss: false }; t += win + rf(r, 1.0, 2.2); return c; });
    m.end = t; m.wt = -1; m.away = 0; m.rounds = 4; m.round = 0;
    const live = () => m.cross.find(c => !c.log && !c.miss && m.wt >= c.a && m.wt < c.a + win);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return;
      if (m.next === 1 && m.wt >= 0) { if (inp.at !== 1) { m.away += dt; if (m.away > 0.6) { m.fault('abandoned'); m.away = 0; } } else m.away = 0;
        m.wt += dt; for (const c of m.cross) if (!c.log && !c.miss && m.wt >= c.a + win) { c.miss = true; m.fault('unlogged'); }
        m.sites[1].prog = Math.min(0.95, m.wt / m.end); if (m.wt >= m.end && m.state === 'play') { m.finish(1); return; } }
      const s = m.cur(inp); m.released(inp); if (!s) return;
      if (m.next === 0) { m.ct += dt; if (m.ct >= per) { m.ct = 0; m.cyc = (m.cyc + 1) % m.crew.length; }
        if (inp.press) { const o = m.crew[m.cyc]; if (o.rest < 8) m.fault('tired posted'); else { m.who = o; m.finish(0); m.wt = 0; } } return; }
      if (inp.press) { const c = live(); if (c) { c.log = true; m.round++; m.ev('logged', { craft: c.craft }); } else m.fault('phantom'); }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) { const p = m.crew[m.cyc].rest >= 8 && m.ct > 0.15 && f % 3 === 0; return { at: 0, press: p, hold: p }; } const c = live(), p = !!c && m.wt > c.a + 0.15 && f % 3 === 0; return { at: 1, press: p, hold: p }; };
    m.bad = (f = 0) => { const p = f % 3 === 0; return { at: m.next, press: p, hold: p }; };
    m.view = () => ({ crew: m.crew.map(o => o.n + o.rest), cross: m.cross.map(c => +c.a.toFixed(2)) });
    m.panel = (i) => { if (i === 0) { const o = m.crew[m.cyc]; return { label: o.n, value: `${o.rest} h rest${o.rest < 8 ? ' — SHORT' : ''}`, bar: Math.min(1, o.rest / 12), band: [8 / 12, 1] }; } const c = live(); return { label: c ? `CROSSING · ${c.craft} ${c.dir}` : 'Traffic board', value: m.wt < 0 ? 'take the post' : `${m.round} / 4 logged`, bar: Math.max(0, m.wt) / m.end }; };
    m.prompt = (i) => i === 0 ? 'Tap [E] when a rested officer (8 h+) is showing' : live() ? 'Crossing! Tap [E] to log it' : 'Hold the post — log each crossing as it lights';
    return m;
  },
});
