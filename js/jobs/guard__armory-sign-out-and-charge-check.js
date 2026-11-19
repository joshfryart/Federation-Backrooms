// Guard: armory sign-out and charge check. At each cradle, face the cradle and tap E to lift the sidearm; the grip indicator takes a moment to
// settle. Then put it somewhere: a good charge goes back in its own cradle (aim straight at the cradle and tap E); a low charge goes on the
// charger to the left (aim left and tap E), and the fresh sidearm you take off the charger goes back in the cradle. Racking a low one, swapping a
// good one, or deciding before the indicator settles are faults. The sheet is countersigned once every cradle is reconciled.
import { define, machine, room, ri, shuffle } from './kit.js';

const AIM = 0.2, CHG = 0.38;
export default define({
  job: { billet: 'guard', label: 'Armory sign-out and charge check', type: 'loop' },
  title: 'Sidearm lift and rehome', dept: 'security', host: 'room', siteName: 'Cradle', verb: 'Lift',
  how: 'Tap E at a cradle to lift the sidearm and wait for the grip charge to settle. Good: aim at the cradle and tap E to rack it. Low: aim left at the charger, tap E to swap, then rack the fresh one.',
  keys: ['E tap: lift / put down', 'aim: cradle ahead, charger to the left'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lift and rehome', input: 'e-tap+look',
    win: 'each sidearm lifted, its grip charge read, low ones exchanged at the charger and a full one back in every cradle before countersigning',
    fail: 'putting a low sidearm back in its cradle, swapping a full one, or setting one down before the grip reading settles',
    rule: 'Tap E to lift. Wait for the grip percentage. At or above 60 % aim ahead and tap E; below, aim left to the charger, tap E, then aim ahead and tap E.' },
  rush: 'Counted the cradles from the doorway and signed the sheet.',
  captions: { unread: 'grip indicator still ticking', 'low racked': 'cradle clunks', 'needless swap': 'charger beeps' },
  says: { unread: 'Wait for the grip indicator to settle before you put it down.', 'low racked': 'That one was low — it should have gone on the charger.', 'needless swap': 'That sidearm was charged. Rack it, do not swap it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cradle A', prop: 'weaponrack' }, { name: 'Cradle B', prop: 'weaponrack' }, { name: 'Cradle C', prop: 'weaponrack' }, { name: 'Sign-out sheet', prop: 'secdesk' }]), r = m.rnd;
    const lows = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2))), settle = m.calm ? 0.9 : 0.7;
    m.guns = [0, 1, 2].map(i => ({ pct: lows.has(i) ? ri(r, 8, 41) : ri(r, 68, 99), ph: 'rack', rd: 0 }));
    const aim = (inp) => { const l = inp.look || 0; return Math.abs(l) < AIM ? 'cradle' : l > CHG - 0.1 ? 'charger' : null; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next;
      if (i === 3) { if (inp.press && aim(inp) === 'cradle') m.finish(3); s.prog = 0.5; return; }
      const g = m.guns[i]; if (g.ph === 'read') { g.rd += dt; if (g.rd >= settle) g.ph = 'hand'; }
      if (inp.press) { const a = aim(inp);
        if (g.ph === 'rack' && a === 'cradle') { g.ph = 'read'; g.rd = 0; m.ev('lift', { site: i }); }
        else if (g.ph === 'read' && a) m.fault('unread');
        else if (g.ph === 'hand' && a === 'cradle') { if (g.pct < 60) { m.fault('low racked'); g.ph = 'rack'; } else m.finish(i); }
        else if (g.ph === 'hand' && a === 'charger') { if (g.pct >= 60) m.fault('needless swap'); else { g.pct = ri(r, 95, 100); g.ph = 'fresh'; m.ev('swap', { site: i }); } }
        else if (g.ph === 'fresh' && a === 'cradle') m.finish(i); }
      s.prog = s.done ? 1 : { rack: 0, read: 0.3, hand: 0.5, fresh: 0.75 }[g.ph];
    };
    const lk = (k) => (k === 'charger' ? CHG : 0);
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3) return { at: 3, look: 0, press: f % 4 === 0 };
      const g = m.guns[i], want = g.ph === 'hand' && g.pct < 60 ? 'charger' : 'cradle'; return { at: i, look: lk(want), press: g.ph !== 'read' && f % 4 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0 || i === 3) return { at: i, press: true }; return { at: i, look: 0, press: f % 4 === 0 }; };
    m.view = () => ({ pct: m.guns.map(g => g.pct) });
    m.panel = (i) => { if (i === 3) return { label: 'Sheet', value: 'countersign', bar: 1 }; const g = m.guns[i]; if (!g) return null;
      if (g.ph === 'rack') return { label: 'Grip', value: 'in cradle', bar: 0 };
      if (g.ph === 'read') return { label: 'Grip', value: 'settling…', bar: g.rd / settle };
      return { label: g.ph === 'fresh' ? 'Fresh grip' : g.pct < 60 ? 'Grip LOW' : 'Grip OK', value: `${g.pct} %`, bar: g.pct / 100, band: [0.6, 1] }; };
    m.prompt = (i) => { if (i === 3) return 'Face the sheet and tap [E] to countersign'; const g = m.guns[i]; if (!g) return '';
      return g.ph === 'rack' ? 'Face the cradle and tap [E] to lift the sidearm' : g.ph === 'read' ? 'Hold it still: the grip indicator is settling'
        : g.ph === 'fresh' ? 'Aim at the cradle and tap [E] to rack the fresh one' : g.pct < 60 ? 'Low: aim left at the charger and tap [E] to swap' : 'Charged: aim at the cradle and tap [E] to rack it'; };
    return m;
  },
});
