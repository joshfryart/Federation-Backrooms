// Comms officer, quiet watch: routine relay sweep. At each relay card read the status lamp. A dim lamp window must be wiped first: sweep the
// view side to side across it (the cloth strokes). Then tap E to press the test button and listen. A sound relay clicks at once; a drifting
// one only clicks after a few presses, and each press needs a moment's listen: jabbing the button again before the click could come jams it.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'comms', label: 'Routine relay sweep', type: 'task:quiet_watch' },
  title: 'Relay test-press sweep', dept: 'operations', host: 'room', siteName: 'Relay', verb: 'Test',
  how: 'Wipe a dim lamp window clean by sweeping the view side to side across it, then tap E to press the test button, pausing between presses, until the relay clicks.',
  keys: ['sweep view left-right: wipe', 'E tap: test press (pause between)'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'wipe then press', input: 'e-tap+swing', win: 'every relay lamp readable and every card clicked over by unhurried test presses',
    fail: 'pressing a test button behind a dim window, or jabbing it again before the click could come',
    rule: 'If the panel says DIM, swing the view back and forth across the card until it reads CLEAN. Then tap E; a drifting relay needs several presses at least half a second apart.' },
  rush: 'Ticked every lamp green on the sweep card from the doorway.',
  captions: { 'pressed dim': 'button clicks unseen', jabbed: 'test button sticks', click: 'relay clicks over', wipe: 'cloth squeaks' },
  says: { 'pressed dim': 'You cannot read that lamp — wipe the window before you test.', jabbed: 'Too quick — give each press a moment to click.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Relay card 1', prop: 'relayrack' }, { name: 'Relay card 2', prop: 'servers' }, { name: 'Relay card 3', prop: 'relayrack' }, { name: 'Relay card 4', prop: 'commsstation' }]), r = m.rnd;
    const dims = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 2, 3))), gap = m.calm ? 0.3 : 0.4, strokes = m.calm ? 3 : 4;
    m.cards = m.sites.map((_, i) => ({ dim: dims.has(i), wipes: 0, sgn: 0, presses: ri(r, 1, 3), got: 0, last: -9 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, c = m.cards[i], sw = inp.swing || 0;
      if (c.dim && Math.abs(sw) > 0.8) { const g = Math.sign(sw); if (g !== c.sgn) { c.sgn = g; c.wipes++; m.ev('wipe', { site: i }); if (c.wipes >= strokes) c.dim = false; } }
      if (inp.press) {
        if (c.dim) m.fault('pressed dim');
        else if (m.t - c.last < gap) { m.fault('jabbed'); c.got = 0; }
        else if (++c.got >= c.presses) { m.ev('click', { site: i }); m.finish(i); return; }
        c.last = m.t;
      }
      s.prog = clamp((c.dim ? 0.4 * c.wipes / strokes : 0.4) + 0.5 * c.got / c.presses, 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cards[i];
      if (c.dim) return { at: i, swing: (Math.floor(f / 6) % 2 ? 1.5 : -1.5) }; const tap = f % 18 === 0; return { at: i, hold: tap, press: tap }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 2 === 0, press: f % 2 === 0 });
    m.view = () => ({ c: m.cards.map(c => [c.dim, c.presses]) });
    m.panel = (i) => { const c = m.cards[i]; return c ? { label: c.dim ? 'Lamp DIM' : 'Lamp CLEAN', value: c.dim ? `wipe ${c.wipes} / ${strokes}` : `presses ${c.got} · no click yet`, bar: c.dim ? c.wipes / strokes : c.got / c.presses } : null; };
    m.prompt = (i) => { const c = m.cards[i]; return !c ? '' : c.dim ? 'Lamp window is dim — sweep the view left and right to wipe it' : 'Tap [E] to press the test button; pause and listen between presses'; };
    return m;
  },
});
