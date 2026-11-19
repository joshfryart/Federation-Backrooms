// Armory, survey mission: receive and clean returned gear. Each zapper on the bench mat gets two pull-throughs from breech to muzzle: a dry patch,
// then a solvent patch. Hold E to grip the rod and turn the view to draw the patch through at an even pace: the dry patch wants a brisk pull,
// the solvent patch a slow one so it soaks the fouling. Pull too fast and the patch skips the fouling; dawdle and it snags; let go part way and
// the patch is left stuck in the barrel. One pass each, in one go.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'armory', label: 'Receive and clean gear on return', type: 'task:survey' },
  title: 'Breech-to-muzzle pull-through', dept: 'security', host: 'room', siteName: 'Zapper', verb: 'Clean',
  how: 'Hold E and turn the view at an even pace to draw the patch from breech to muzzle in one pass: brisk for the dry patch, slow for the solvent patch. Do not let go until it is out of the muzzle.',
  keys: ['E hold: grip the rod', 'turn: draw the patch', 'brisk dry, slow solvent'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'pull-through', input: 'e-hold+turn', win: 'every returned zapper given a dry then a solvent patch, each drawn breech to muzzle in one unbroken pass at that patch\'s pace',
    fail: 'drawing a patch faster than its pace so it skips fouling, stalling until it snags, or letting go with the patch still in the barrel',
    rule: 'Hold E and keep the view turning: the PACE bar must sit in the patch\'s band (higher for dry, lower for solvent) until the patch exits the muzzle; only then let go.' },
  rush: 'Gave each barrel a quick wipe with whatever patch was to hand and shelved it.',
  captions: { skipped: 'patch squeaks through', snagged: 'rod judders', 'left in barrel': 'patch stuck' },
  says: { skipped: 'Too fast: the patch skipped over the fouling. Ease the pace into the band.', snagged: 'Too slow: the patch snagged. Keep a steady turn.', 'left in barrel': 'You let go with the patch still in the barrel. One pass, breech to muzzle.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Zapper 1 on the bench mat', prop: 'workbench' }, { name: 'Zapper 2 on the bench mat', prop: 'workbench' }, { name: 'Zapper 3 on the bench mat', prop: 'workbench' }]), r = m.rnd;
    const w = m.calm ? 0.15 : 0;
    m.guns = [0, 1, 2].map(() => ({ len: rf(r, 0.85, 1.25), dry: [rf(r, 0.85, 1.0) - w, rf(r, 1.7, 1.9) + w], sol: [rf(r, 0.3, 0.4) - w / 2, rf(r, 0.8, 0.95) + w], pass: 0, p: 0, fast: false, stall: 0, wait: false, pace: 0 }));
    const G = () => m.guns[m.next], band = (g) => g.pass === 0 ? g.dry : g.sol;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const g = G(), [lo, hi] = band(g), tr = Math.abs(inp.turn || 0);
      g.pace = tr;
      if (rel && g.p > 0 && g.p < 1) { m.fault('left in barrel'); g.p = 0; }
      if (!inp.hold) { g.wait = false; g.stall = 0; g.fast = false; }
      else if (!g.wait) {
        if (tr > hi) { if (!g.fast) { g.fast = true; m.fault('skipped'); g.p = 0; } }
        else { g.fast = false; if (tr >= lo) { g.stall = 0; g.p += tr * dt / ((lo + hi) / 2) / (1.3 * g.len); } else if (g.p > 0) { g.stall += dt; if (g.stall > 0.7) { m.fault('snagged'); g.stall = 0; g.p = 0; } } }
        if (g.p >= 1) { g.p = 0; g.pass++; g.wait = true; m.ev('pass', { n: g.pass }); if (g.pass >= 2) { m.finish(m.next); return; } }
      }
      s.prog = s.done ? 1 : (g.pass + clamp(g.p)) / 2 * 0.9;
    };
    m.hint = () => { const g = G(); if (!g) return { at: -1 }; const [lo, hi] = band(g); return g.wait ? { at: m.next, hold: false } : { at: m.next, hold: true, turn: (lo + hi) / 2 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, turn: f % 20 < 10 ? 3 : 1.2 });
    m.view = () => ({ guns: m.guns.map(g => [+g.len.toFixed(2), +g.dry[0].toFixed(2), +g.sol[1].toFixed(2)]) });
    m.panel = (i) => { const g = m.guns[i]; if (!g) return null; const [lo, hi] = band(g); return { label: `${g.pass === 0 ? 'DRY patch' : 'SOLVENT patch'} · ${Math.round(clamp(g.p) * 100)} % to muzzle`, value: `pace ${g.pace.toFixed(1)}`, bar: clamp(g.pace / 2.4), band: [lo / 2.4, hi / 2.4] }; };
    m.prompt = (i) => { const g = m.guns[i]; return !g ? '' : g.wait ? 'Patch out of the muzzle: let go of [E], then the solvent patch' : g.pass === 0 ? 'Hold [E] and turn briskly to draw the dry patch through' : 'Hold [E] and turn slowly to draw the solvent patch through'; };
    return m;
  },
});
