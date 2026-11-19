// Deputy security chief: deck patrol and door checks along the cargo corridor. At each door tap E to press the badge to the reader, then WAIT
// for the reader to answer. A beep means the lock seated: the door is ticked on the route card. A silent reader means the lock never seated:
// hold E on the handle long enough to test the seal and write the anomaly on the card. Tapping a silent door off as secure is the fault the
// job exists to catch; pressing on before the reader has answered skips the check.
import { define, machine, room, rf, shuffle } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Deck patrol and door checks', type: 'loop' },
  title: 'Badge-reader door round', dept: 'security', host: 'room', siteName: 'Door', verb: 'Badge',
  how: 'At each door tap E to badge the reader and wait for it to answer. A beep ticks the door off; a silent reader means the lock never seated, so hold E on the handle to test the seal and log it.',
  keys: ['E tap: badge the reader', 'E hold: test the seal of a silent door'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'badge and listen', input: 'e-tap+e-hold', win: 'every reader badged and answered, and every silent reader followed by a full seal test written on the route card',
    fail: 'tapping a silent door off as secure, or badging on before the reader has answered',
    rule: 'Tap E to badge, then wait about half a second for BEEP or SILENT. BEEP: the door is done. SILENT: hold E on the handle until the seal meter fills; a quick tap logs it secure and is a fault.' },
  rush: 'Waved the badge at each reader in passing and ticked the whole card.',
  captions: { 'logged secure': 'route card scratch', 'skipped beep': 'reader chirps late', beep: 'reader beeps' },
  says: { 'logged secure': 'That reader never beeped — you ticked an unseated lock as secure. Hold E on the handle to test the seal.', 'skipped beep': 'Wait for the reader to answer before you move on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cargo corridor door', prop: 'airlock_doors' }, { name: 'Bay 2 hatch', prop: 'crate' }, { name: 'Stores door', prop: 'shelving' }, { name: 'Bulkhead door', prop: 'airlock_doors' }]), r = m.rnd;
    const silent = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, 1 + Math.floor(r() * 2))), need = m.calm ? 1.0 : 1.3;
    m.doors = m.sites.map((_, i) => ({ silent: silent.has(i), wait: rf(r, 0.4, 0.8), ph: 'badge', t: 0, seal: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.doors[i];
      if (d.ph === 'badge') { if (inp.press) { d.ph = 'wait'; d.t = 0; } }
      else if (d.ph === 'wait') {
        if (inp.press) { m.fault('skipped beep'); d.ph = 'badge'; return; }
        d.t += dt; if (d.t >= d.wait) { if (d.silent) { d.ph = 'seal'; d.seal = 0; m.ev('silent', { site: i }); } else { m.ev('beep', { site: i }); m.finish(i); return; } }
      } else if (d.ph === 'seal') {
        if (inp.hold) { d.seal += dt; if (d.seal >= need) { m.ev('logged', { site: i }); m.finish(i); return; } }
        if (rel) { if (d.seal < 0.35) m.fault('logged secure'); d.seal = 0; }
      }
      s.prog = d.ph === 'badge' ? 0 : d.ph === 'wait' ? 0.25 : 0.3 + 0.6 * d.seal / need;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.doors[i]; if (d.ph === 'badge') { const p = f % 4 === 0; return { at: i, press: p, hold: p }; } return { at: i, hold: d.ph === 'seal' }; };
    m.bad = (f = 0) => { const p = f % 4 === 0; return { at: m.next, press: p, hold: p }; };
    m.view = () => ({ doors: m.doors.map(d => [d.silent, +d.wait.toFixed(2)]) });
    m.panel = (i) => { const d = m.doors[i]; if (!d) return null; return d.ph === 'badge' ? { label: 'Reader', value: 'badge it', bar: 0 } : d.ph === 'wait' ? { label: 'Reader', value: 'listening…', bar: d.t / d.wait } : d.ph === 'seal' ? { label: 'SILENT — seal', value: `${Math.round(d.seal / need * 100)} %`, bar: d.seal / need, band: [0.97, 1] } : { label: 'Reader', value: 'BEEP', bar: 1 }; };
    m.prompt = (i) => { const d = m.doors[i]; return !d ? '' : d.ph === 'badge' ? 'Tap [E] to press your badge to the reader' : d.ph === 'wait' ? 'Wait for the reader to answer…' : 'No beep — hold [E] on the handle to test the seal and log it'; };
    return m;
  },
});
