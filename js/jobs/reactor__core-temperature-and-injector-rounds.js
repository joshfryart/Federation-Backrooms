// Reactor specialist: core temperature and injector rounds. Walk the core platform and sight along each injector nozzle against its painted
// line. Hold E to lean in on the rail and bring your eye (the view) onto the nozzle's bearing; keep it there, steady, for a full sighting count
// while the platform hums. Jerk your head round while leaning in and you knock the sight off and start again; the count only runs on the line.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Core temperature and injector rounds', type: 'loop' },
  title: 'Injector nozzle sight-line round', dept: 'engineering', host: 'room', siteName: 'Injector', verb: 'Sight',
  how: 'At each injector hold E to lean in, turn your view onto the nozzle bearing shown on the panel and keep it there, steady, until the sighting count fills.',
  keys: ['E hold: lean in and sight', 'aim the view at the nozzle', 'keep the view still'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'sight the nozzle', input: 'e-hold+look+turn', win: 'each injector nozzle sighted against its painted line for a full steady count',
    fail: 'jerking the view while leaning in so the sight is knocked off the nozzle',
    rule: 'Hold E at an injector: the panel shows how far the nozzle bearing is from your eye line. Aim the view onto it and keep still; the count fills only on the line, and a fast head turn while sighting is a knocked sight.' },
  rush: 'Glanced along the nozzles from the platform steps and signed the core sheet.',
  captions: { knocked: 'rail clangs', drifted: 'injector whine' }, says: { knocked: 'You jerked your head while leaning on the rail and lost the sight line. Turn slowly onto the nozzle.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Injector 1', prop: 'warpcore' }, { name: 'Injector 2', prop: 'reactorstation' }, { name: 'Injector 3', prop: 'injector_crate' }, { name: 'Core sheet', prop: 'console' }]), r = m.rnd;
    const tol = m.calm ? 0.1 : 0.07, need = m.calm ? 0.9 : 0.8;
    m.noz = m.sites.map((_, i) => ({ aim: rf(r, 0.12, 0.34) * (r() < 0.5 ? -1 : 1), sway: rf(r, 0.03, 0.06), ph: rf(r, 0, 6), cnt: 0, off: +(rf(r, 0, 0.6)).toFixed(2), temp: Math.round(rf(r, 1880, 2140)), jolt: 0 }));
    m.noz[3].aim = rf(r, -0.12, 0.12);
    m.aimNow = (i) => { const n = m.noz[i]; return n.aim + n.sway * Math.sin(m.t * 0.9 + n.ph); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, n = m.noz[i];
      n.jolt = Math.max(0, n.jolt - dt);
      if (inp.hold) {
        if ((inp.turn || 0) > 1.0 && n.cnt > 0.1 && !n.jolt) { m.fault('knocked'); n.cnt = 0; n.jolt = 0.5; }
        else if (Math.abs((inp.look || 0) - m.aimNow(i)) < tol && (inp.turn || 0) < 0.5) n.cnt += dt;
        else n.cnt = Math.max(0, n.cnt - dt * 0.5);
        if (n.cnt >= need) { m.ev('sighted', { site: i, off: n.off }); m.finish(i); return; }
      } else n.cnt = Math.max(0, n.cnt - dt);
      s.prog = clamp(n.cnt / need) * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: true, look: m.aimNow(i), turn: 0 }; };
    m.bad = (f = 0) => { const i = m.next; return { at: i, hold: true, look: m.aimNow(i) + (f % 20 < 10 ? 0 : 0.01), turn: f % 20 < 10 ? 0 : 2 }; };
    m.view = () => ({ noz: m.noz.map(n => [+n.aim.toFixed(3), n.temp]) });
    m.panel = (i) => { const n = m.noz[i]; if (!n) return null; const d = m.aimNow(i), dir = d > 0 ? 'left' : 'right';
      return { label: i === 3 ? `Sheet: core ${m.noz[0].temp} K` : `Nozzle ${Math.abs(d).toFixed(2)} ${dir}`, value: n.cnt > 0 ? `sighting ${Math.round(clamp(n.cnt / need) * 100)} %` : 'off the line', bar: clamp(n.cnt / need), band: [0.97, 1] }; };
    m.prompt = (i) => i === 3 ? 'Hold [E] and look at the sheet line to sign the temperatures and alignment' : 'Hold [E] to lean in; turn slowly onto the nozzle bearing and keep still';
    return m;
  },
});
