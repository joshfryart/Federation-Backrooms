// Yeoman: relay sickbay requests to the captain and the bridge. At the request panel take each slip (tap E) and flick it onto the right pile
// with a quick turn of the view: requests that need the captain's authority go left, requests that need the bridge to act go right. Then walk
// each pile to its receiver and hand the slips over one by one, waiting for each read-back before handing the next.
import { define, machine, room, shuffle, clamp } from './kit.js';

const CAPT = ['Approve evacuating deck 6 to sickbay overflow', 'Authorise release of the reserve plasma stock', 'Approve diverting two engineers as stretcher bearers',
  'Authorise opening the officers\' mess as a ward', 'Approve a transport request to the relief ship'];
const BRDG = ['Hold the ship steady: surgery under way in bay 2', 'Route a clear channel to the planet clinic', 'Give sickbay priority power on deck 5',
  'Slow to one-quarter impulse for the transfer', 'Keep the transporter locked on the casualty site'];

export default define({
  job: { billet: 'yeoman', label: 'Relay sickbay requests to captain and bridge', type: 'task:medical_relief' },
  title: 'Flick slips to captain or bridge, then hand over', dept: 'command', host: 'room', siteName: 'Desk', verb: 'Relay',
  how: 'At the request panel tap E to take a slip, then flick your view left (captain: anything needing approval) or right (bridge: anything needing action). At each receiver tap E to hand over a slip and wait for the read-back before the next.',
  keys: ['E tap: take or hand a slip', 'quick turn left / right: file the slip'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'flick and hand', input: 'e-tap+swing', win: 'every sickbay slip flicked to the pile that can act on it and handed to that receiver with each read-back heard',
    fail: 'flicking an approval to the bridge or an action to the captain, or handing the next slip over the receiver\'s read-back',
    rule: 'Tap E to pick up a slip, read it, then turn the view sharply: left files it for the captain (approve, authorise), right for the bridge (hold, route, power). At a receiver tap E once per slip and wait for READ BACK before tapping again.' },
  rush: 'Read all the sickbay requests out on the open channel.',
  captions: { 'wrong pile': 'slip lands on the wrong tray', 'no read-back': 'receiver: "say again?"' },
  says: { 'wrong pile': 'That request belongs on the other pile: approvals to the captain, actions to the bridge.', 'no read-back': 'Wait for the read-back before handing over the next slip.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sickbay request panel', prop: 'commsstation' }, { name: 'Captain\'s chair', prop: 'captain_chair' }, { name: 'Helm duty officer', prop: 'helm' }]), r = m.rnd;
    const nC = 2 + (r() < 0.5 ? 1 : 0), rb = m.calm ? 1.6 : 1.2, flick = 1.2;
    m.slips = shuffle(r, [...shuffle(r, CAPT).slice(0, nC).map(s => ({ s, capt: true })), ...shuffle(r, BRDG).slice(0, 5 - nC).map(s => ({ s, capt: false }))]);
    m.k = 0; m.hand = false; m.piles = [[], []]; m.given = 0; m.wait = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, sw = inp.swing || 0;
      if (i === 0) {
        if (!m.hand) { if (inp.press) m.hand = true; }
        else if (Math.abs(sw) > flick) { const q = m.slips[m.k], left = sw > 0; if (left !== q.capt) m.fault('wrong pile'); m.piles[q.capt ? 0 : 1].push(q); m.hand = false; m.k++; if (m.k >= m.slips.length) m.finish(0); }
        s.prog = clamp(m.k / m.slips.length) * 0.95; return;
      }
      const pile = m.piles[i - 1]; m.wait = Math.max(0, m.wait - dt);
      if (inp.press) { if (m.wait > 0) m.fault('no read-back'); else { m.given++; m.wait = rb; } }
      if (m.given >= pile.length && m.wait <= 0) { m.given = 0; m.finish(i); return; }
      s.prog = clamp((m.given - (m.wait > 0 ? 1 : 0)) / Math.max(1, pile.length)) * 0.95;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) { if (!m.hand) return { at: 0, press: f % 3 === 0, swing: 0 }; const q = m.slips[m.k]; return { at: 0, swing: q.capt ? 2 : -2 }; }
      return { at: i, press: m.wait <= 0 && m.given < m.piles[i - 1].length && f % 3 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i !== 0) return { at: i, press: f % 2 === 0 }; if (!m.hand) return { at: 0, press: true }; const q = m.slips[m.k]; return { at: 0, swing: q.capt ? -2 : 2 }; };
    m.view = () => ({ slips: m.slips.map(q => [q.s, q.capt]) });
    m.panel = (i) => {
      if (i === 0) { const q = m.slips[m.k]; return q ? { label: m.hand ? 'In hand: flick ◀ captain / bridge ▶' : `Slip ${m.k + 1} of ${m.slips.length}`, value: q.s, bar: m.k / m.slips.length } : null; }
      const pile = m.piles[i - 1] || []; return { label: `${pile.length} slip${pile.length === 1 ? '' : 's'} for ${i === 1 ? 'the captain' : 'the bridge'}`, value: m.wait > 0 ? 'reading back…' : m.given ? 'READ BACK ✓' : 'ready', bar: pile.length ? m.given / pile.length : 1 };
    };
    m.prompt = (i) => (i === 0 ? (m.hand ? 'Turn sharply: left = captain (approvals), right = bridge (actions)' : 'Tap [E] to take the next request slip') : 'Tap [E] to hand a slip; wait for the read-back');
    return m;
  },
});
