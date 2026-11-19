// Doctor: screen the away team for exposure after the sensor sweeps. On the exposure mat, hold E and turn slowly so the dosimeter wand passes
// over chest, back and hands: the needle only registers at a slow pass, and a fast wave skips (a fault). With the sweep covered, tap E to draw
// and label the blood tube; that brings up the sweep log's dose for that crewman. The latent case reads low on the wand but high in the log.
// Stamp the exposure card: aim left and tap for CLEAR, right for FLAG. Anything over the limit line, on the wand or in the log, is a flag.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Screen away team for exposure after sensor sweeps', type: 'task:survey' },
  title: 'Dosimeter pass and latent-dose card', dept: 'medical', host: 'room', siteName: 'Crewman', verb: 'Screen',
  how: 'Hold E and turn slowly to pass the wand over the crewman until the sweep is covered, tap E to draw the blood tube, then stamp the card: aim left CLEAR, right FLAG. Flag if the wand or the sweep log is over the limit.',
  keys: ['E hold + turn slowly: wand pass', 'E tap: draw tube', 'aim left clear / right flag + E'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'wand and stamp', input: 'e-hold+turn+look+e-tap', win: 'each away-team member passed with the wand slowly enough to register, blood drawn and the exposure card stamped against wand and sweep-log dose',
    fail: 'waving the wand too fast so the needle skips, or stamping clear a crewman whose wand or sweep-log dose is over the limit line',
    rule: 'Hold E and turn the view at a slow, steady rate to fill the coverage meter (too fast is a skip). Tap E at the centre to draw blood. Then aim left for CLEAR or right for FLAG and tap.' },
  rush: 'Waved the wand once across each chest and stamped the cards clear.',
  captions: { 'wand skipped': 'dosimeter clicks off', 'cleared exposed': 'card stamp thuds', 'no blood': 'draw kit rattles', 'false flag': 'card stamp thuds' },
  says: { 'wand skipped': 'Too fast: the needle cannot rise on a wave like that. Slow, steady pass.', 'cleared exposed': 'You stamped clear a crewman over the limit line. It builds up in the blood.', 'no blood': 'Draw and label the blood tube before you stamp the card.', 'false flag': 'Wand and log are both under the line: that crewman is clear.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Away team: lead', prop: 'exam_couch' }, { name: 'Away team: sensor tech', prop: 'biobed' }, { name: 'Away team: pilot', prop: 'biobed' }]), r = m.rnd;
    const LIM = 50, fast = m.calm ? 1.9 : 1.5, need = 1.4, kinds = shuffle(r, ['open', 'latent', r() < 0.5 ? 'clean' : 'latent']);
    m.crew = kinds.map(k => ({ k, wand: k === 'open' ? Math.round(rf(r, 58, 80)) : Math.round(rf(r, 12, 38)), log: k === 'latent' ? Math.round(rf(r, 56, 90)) : Math.round(rf(r, 8, 40)), cov: 0, cool: 0, phase: 'sweep', drawT: 0 }));
    const exposed = (c) => c.wand > LIM || c.log > LIM, side = 0.22;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, c = m.crew[i], look = inp.look || 0, turn = Math.abs(inp.turn || 0);
      c.cool = Math.max(0, c.cool - dt);
      if (c.phase === 'sweep') { if (inp.hold && turn > fast) { if (!c.cool) { m.fault('wand skipped'); c.cool = 0.8; } } else if (inp.hold && turn > 0.2) c.cov = clamp(c.cov + turn * dt / need); if (c.cov >= 1) c.phase = 'draw'; }
      else if (c.phase === 'draw') { if (inp.press && Math.abs(look) < side) { c.phase = 'drawing'; c.drawT = 0; } }
      else if (c.phase === 'drawing') { c.drawT += dt; if (c.drawT >= 0.6) c.phase = 'stamp'; }
      if (inp.press && Math.abs(look) >= side && c.phase !== 'sweep') {
        if (c.phase !== 'stamp') m.fault('no blood');
        else { const flag = look < 0; if (exposed(c) && !flag) m.fault('cleared exposed'); else if (!exposed(c) && flag) m.fault('false flag'); else { m.finish(i); return; } }
      }
      s.prog = s.done ? 1 : c.phase === 'sweep' ? 0.6 * c.cov : c.phase === 'stamp' ? 0.9 : 0.7;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.crew[i], tap = f % 3 === 0;
      if (c.phase === 'sweep') return { at: i, hold: true, turn: 0.9, look: 0.3 * Math.sin(f / 10) };
      if (c.phase === 'draw') return { at: i, press: tap, hold: tap, look: 0 };
      if (c.phase === 'drawing') return { at: i, look: 0 };
      return { at: i, press: tap, hold: tap, look: exposed(c) ? -0.4 : 0.4 }; };
    m.bad = () => ({ at: m.next, hold: true, turn: 3, look: 0 });
    m.view = () => ({ crew: m.crew.map(c => [c.k, c.wand, c.log]) });
    m.panel = (i) => { const c = m.crew[i]; if (!c) return null;
      if (c.phase === 'sweep') return { label: `Wand coverage · needle ${Math.round(c.wand * c.cov)} (limit ${LIM})`, value: `${Math.round(c.cov * 100)} %`, bar: c.cov, band: [0.98, 1] };
      if (c.phase !== 'stamp') return { label: `Wand peak ${c.wand} · limit ${LIM}`, value: c.phase === 'draw' ? 'draw the tube' : 'labelling…', bar: c.wand / 100, band: [0, LIM / 100] };
      return { label: `Wand ${c.wand} · sweep log ${c.log} · limit ${LIM}`, value: '◀ CLEAR · FLAG ▶', bar: Math.max(c.wand, c.log) / 100, band: [0, LIM / 100] }; };
    m.prompt = (i) => { const c = m.crew[i]; return !c ? '' : c.phase === 'sweep' ? 'Hold [E] and turn slowly to pass the wand over chest, back and hands' : c.phase === 'draw' ? 'Tap [E] to draw and label the blood tube' : c.phase === 'drawing' ? 'Labelling the tube…' : 'Aim left and tap [E] to stamp CLEAR, right to FLAG'; };
    return m;
  },
});
