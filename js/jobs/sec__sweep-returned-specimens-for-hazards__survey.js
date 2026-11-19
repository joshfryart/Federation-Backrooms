// Security, survey: sweep returned specimens for hazards. Hold E to run the handheld scanner and pass its head across each case from one end
// to the other (turn your view across it). The hazard meter lags behind the head: pass slowly and it climbs to the true reading over a hot
// spot; whip across and it never gets there, so a spore pocket reads clean. When the pass is done, let go and file the case by its peak:
// look left to the hazard shelf and tap E for a red peak, look right to the cleared tray and tap E otherwise.
import { define, machine, room, rf, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Sweep returned specimens for hazards', type: 'task:survey' },
  title: 'Slow pass with a lagging meter', dept: 'security', host: 'room', item: 'tricorder_sec', siteName: 'Case', verb: 'Scan',
  how: 'Hold E and turn slowly across the whole case: the meter lags, so a fast pass misses the peak. Then look left + tap E (hazard shelf) for a red peak, or look right + tap E (clear).',
  keys: ['E hold + turn slowly: scan across', 'look left + E tap: hazard shelf', 'look right + E tap: clear'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'slow-pass scan', input: 'e-hold+look+turn+e-tap', win: 'every case scanned end to end slowly enough for the meter to catch its hot spot, and filed to shelf or tray by its peak',
    fail: 'a fast pass that leaves a spore peak under the red line so a hazardous case is cleared, or a clean case shelved',
    rule: 'Hold E and sweep the view across the case; slow sweeps let the lagging meter reach the true level. Release, then look far left (shelf) or far right (clear) and tap E.' },
  rush: 'Waved the scanner over the whole stack at once and cleared it.',
  captions: { 'hazard through': 'spore alarm in the lab later', 'false tag': 'clean case sent to quarantine' },
  says: { 'hazard through': 'That case was hot. Your pass was too fast for the meter to catch it.', 'false tag': 'That case was clean — its peak never reached the red line.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Case 1', prop: 'labbench' }, { name: 'Case 2', prop: 'specimen_tank' }, { name: 'Case 3', prop: 'samplefridge' }, { name: 'Case 4', prop: 'labbench' }]), r = m.rnd;
    const nh = ri(r, 1, 3), RED = 0.6, tau = m.calm ? 0.09 : 0.12, sig = 0.07, cells = 10, E = 0.35;
    const order = shuffle(r, [0, 1, 2, 3]).slice(0, nh);
    m.cs = m.sites.map((_, i) => ({ H: order.includes(i) ? rf(r, 0.85, 1) : rf(r, 0.15, 0.4), pos: rf(r, -0.25, 0.25), kind: ['spores', 'radiation', 'chemical'][ri(r, 0, 2)], meter: 0, peak: 0, seen: new Array(cells).fill(false), scanned: false }));
    const cell = (l) => Math.floor(clamp((l + E) / (2 * E), 0, 0.999) * cells);
    m.hl = 0.42;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.cs[i], l = inp.look || 0;
      if (c.scanned && inp.press && Math.abs(l) > 0.42) { const shelf = l > 0, hot = c.H >= RED;
        if (shelf && !hot) m.fault('false tag'); else if (!shelf && hot) m.fault('hazard through'); m.ev(shelf ? 'shelved' : 'cleared', { site: i }); m.finish(i); return; }
      if (inp.hold) { if (c.scanned && inp.press) { c.scanned = false; c.peak = 0; c.seen.fill(false); }
        const sigv = c.H * Math.exp(-(((l - c.pos) / sig) ** 2)) + 0.05; c.meter += (sigv - c.meter) * clamp(dt / tau); c.peak = Math.max(c.peak, c.meter);
        if (Math.abs(l) <= E) c.seen[cell(l)] = true; }
      else { c.meter *= Math.max(0, 1 - dt * 4); if (c.seen.every(Boolean)) c.scanned = true; }
      s.prog = clamp(c.seen.filter(Boolean).length / cells) * 0.8;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cs[i];
      if (c.scanned) return { at: i, look: c.peak >= RED ? 0.46 : -0.46, press: true, hold: true };
      if (c.seen.every(Boolean)) { m.hl = 0.42; return { at: i, look: -0.38 }; }
      m.hl = Math.max(-0.38, m.hl - 0.25 / 30); return { at: i, hold: true, look: m.hl, turn: 0.25 }; };
    m.bad = (f = 0) => { const i = m.next, c = m.cs[i]; if (!c) return { at: -1 };
      if (c.scanned) return { at: i, look: c.H >= RED ? -0.46 : 0.46, press: true, hold: true };
      if (c.seen.every(Boolean)) return { at: i, look: -0.38 };
      return { at: i, hold: true, look: (f % 8) < 4 ? 0.38 : -0.38, turn: 3 }; };
    m.view = () => ({ cs: m.cs.map(c => [+c.H.toFixed(2), +c.pos.toFixed(2)]) });
    m.panel = (i) => { const c = m.cs[i]; if (!c) return null; return { label: c.scanned ? `Peak ${Math.round(c.peak * 100)} (${c.peak >= RED ? 'RED: ' + c.kind : 'under red'})` : `Hazard meter ${Math.round(c.meter * 100)}`, value: `${Math.round(c.seen.filter(Boolean).length / cells * 100)} % passed`, bar: c.scanned ? c.peak : c.meter, band: [RED, 1] }; };
    m.prompt = (i) => { const c = m.cs[i]; if (!c) return ''; if (c.scanned) return c.peak >= RED ? 'Red peak: look left to the hazard shelf and tap [E]' : 'Under the red line: look right to the clear tray and tap [E]';
      return c.seen.every(Boolean) ? 'Pass complete: let go of [E]' : 'Hold [E] and turn slowly across the whole case'; };
    return m;
  },
});
