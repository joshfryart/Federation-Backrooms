// Second officer: check shuttlebay readiness for transfers. Press each transfer shuttle's hatch seal (tap E) and then keep still and listen.
// A sound seal clicks within the second; only then may you tap again to mark its ready-board line. If the listen runs out in silence, press it
// again; a seal silent twice is left open on the board. Tapping again while still listening marks a line on a click you never heard: a fault.
import { define, machine, room, rf, ri, shuffle } from './kit.js';

export default define({
  job: { billet: 'so', label: 'Check shuttlebay readiness for transfers', type: 'task:cargo_run' },
  title: 'Hatch seal press and listen', dept: 'command', host: 'room', siteName: 'Hatch', verb: 'Press',
  how: 'Tap E to press a hatch seal, then wait and listen: tap again to mark the line only after it clicks; if it stays silent, press once more, and a twice-silent seal is left open.',
  keys: ['E tap: press seal / mark line', 'wait for the click'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'press and listen', input: 'e-tap', win: 'every hatch seal pressed and heard to click before its ready line is marked, and every silent seal left open after a second press',
    fail: 'tapping to mark a line before the click is heard, so a seal that never clicked goes on the board as ready',
    rule: 'Tap E once to press the seal, then do nothing while LISTENING. CLICK: tap to mark ready. SILENT: tap to press again; silent twice and the line is left open for you.' },
  rush: 'Read the shuttle ready board on the door frame and signed every line.',
  captions: { 'marked unheard': 'stylus tap over silence', click: 'seal clicks', silent: 'faint hiss' },
  says: { 'marked unheard': 'You marked it before you heard anything. Press, then wait for the click.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Shuttle Mayflower hatch', prop: 'shuttle' }, { name: 'Shuttle Halley hatch', prop: 'workpod' }, { name: 'Shuttle Tasman hatch', prop: 'shuttle' }, { name: 'Cargo pod hatch', prop: 'workpod' }]), r = m.rnd;
    const listen = m.calm ? 1.4 : 1.1, bad = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.hatches = m.sites.map((_, i) => ({ bad: bad.has(i), clickAt: rf(r, 0.3, 0.8), st: 'idle', lt: 0, silent: 0, fuel: ri(r, 55, 98) }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, h = m.hatches[i];
      if (h.st === 'listen') {
        h.lt += dt;
        if (inp.press) { m.fault('marked unheard'); return; }
        if (!h.bad && h.lt >= h.clickAt) { h.st = 'click'; m.ev('click', { site: i }); }
        else if (h.lt >= listen) { h.silent++; m.ev('silent', { site: i }); if (h.silent >= 2) { m.finish(i); return; } h.st = 'silent'; }
      } else if (inp.press) {
        if (h.st === 'click') { m.finish(i); return; }
        h.st = 'listen'; h.lt = 0;
      }
      s.prog = h.st === 'click' ? 0.8 : h.st === 'listen' ? 0.2 + 0.4 * Math.min(1, h.lt / listen) : h.silent * 0.4;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.hatches[i]; return { at: i, press: h.st !== 'listen', hold: false }; };
    m.bad = () => ({ at: m.next, press: true, hold: false });
    m.view = () => ({ h: m.hatches.map(h => [h.bad, +h.clickAt.toFixed(2)]) });
    m.panel = (i) => {
      const h = m.hatches[i]; if (!h) return null;
      const v = { idle: 'not pressed', listen: 'LISTENING… keep still', click: 'CLICK ✓ tap to mark ready', silent: `SILENT (${h.silent}) press again` }[h.st];
      return { label: `Seal · fuel ${h.fuel} %`, value: v, bar: h.st === 'listen' ? Math.min(1, h.lt / listen) : h.st === 'click' ? 1 : 0 };
    };
    m.prompt = (i) => { const h = m.hatches[i]; return !h ? '' : h.st === 'listen' ? 'Listen for the seal click: do not touch it' : h.st === 'click' ? 'It clicked: tap [E] to mark the ready line' : 'Tap [E] to press the hatch seal'; };
    return m;
  },
});
