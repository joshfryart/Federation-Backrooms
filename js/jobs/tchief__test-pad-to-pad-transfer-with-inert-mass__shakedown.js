// Transporter chief: test a pad-to-pad transfer with the inert mass block. At the source pad hold E to energize until the source mass count
// reaches zero (letting go mid-transfer aborts it). At the destination the block lands on the load plate and the needle swings: tap E to
// take the reading only once it has settled, or you write down a swing. At the transfer log, compare the destination weight with the source
// mass: look left and tap E for intact, look right and tap E to log a mass loss.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Test pad-to-pad transfer with inert mass', type: 'task:shakedown' },
  title: 'Inert block weigh-in after transfer', dept: 'operations', host: 'room', siteName: 'Station', verb: 'Test',
  how: 'Hold E at the source pad until its mass count reads zero. At the destination plate wait for the needle to settle, then tap E to read it. At the log, look left + tap E for intact, look right + tap E for a mass loss over 0.5 kg.',
  keys: ['E hold: energize', 'E tap: read the settled needle', 'look left/right + E tap: log'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'weigh the arrival', input: 'e-hold+e-tap+look', win: 'the inert block transferred whole, weighed on the destination plate once its needle settled, and logged intact or lossy against the source mass',
    fail: 'aborting the transfer mid-beam, reading the load plate while the needle still swings, or logging a loss as intact',
    rule: 'Source: keep E held until the count hits zero. Plate: the needle swings and settles; tap E once the swing is under the tolerance mark. Log: a difference over 0.5 kg is a loss (look right), otherwise intact (look left).' },
  rush: 'Watched the console say transfer complete and logged the block intact.',
  captions: { aborted: 'beam abort tone', misread: 'scale chirp', 'wrong log': 'log reject tone' },
  says: { aborted: 'Let go mid-transfer: the beam aborted and the block rematerialised on the source pad.', misread: 'The needle was still swinging: that reading is not the block\'s weight.', 'wrong log': 'Check the difference again: over 0.5 kg is a loss.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Source pad', prop: 'pad' }, { name: 'Destination load plate', prop: 'pad' }, { name: 'Transfer log', prop: 'console' }]), r = m.rnd;
    const src = +rf(r, 40, 60).toFixed(1), loss = r() < 0.5 ? 0 : +rf(r, 0.8, 2).toFixed(1), tol = m.calm ? 0.35 : 0.25;
    m.x = { src, dest: +(src - loss + rf(r, -0.15, 0.15)).toFixed(1), loss, amp: rf(r, 5, 8), w: rf(r, 5, 7), k: rf(r, 1.4, 1.9), beam: 0, since: 0, read: null };
    const needle = () => m.x.dest + m.x.amp * Math.exp(-m.x.k * m.x.since) * Math.cos(m.x.w * m.x.since);
    const swing = () => m.x.amp * Math.exp(-m.x.k * m.x.since);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, x = m.x;
      if (i === 0) {
        if (inp.hold) { x.beam = Math.min(1, x.beam + dt / 1.6); if (x.beam >= 1) { m.finish(0); x.since = 0; return; } }
        if (rel && x.beam > 0 && x.beam < 1) { m.fault('aborted'); x.beam = 0; }
        s.prog = x.beam * 0.95; return;
      }
      if (i === 1) { x.since += dt; if (inp.press) { if (swing() > tol) m.fault('misread'); else { x.read = +needle().toFixed(1); m.finish(1); } } s.prog = clamp(1 - swing() / x.amp) * 0.9; return; }
      x.since += dt;
      if (inp.press && Math.abs(inp.look || 0) > 0.25) { const saysLoss = (inp.look || 0) < 0, isLoss = src - x.read > 0.5; if (saysLoss !== isLoss) m.fault('wrong log'); m.finish(2); }
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const x = m.x;
      if (i === 0) return { at: 0, hold: true };
      if (i === 1) { const t = swing() < tol * 0.7 && f % 4 === 0; return { at: 1, press: t, hold: t }; }
      const t = f % 4 === 0; return { at: 2, look: src - x.read > 0.5 ? -0.4 : 0.4, press: t, hold: t };
    };
    m.bad = (f = 0) => (m.next === 0 ? { at: 0, hold: f % 20 < 10 } : { at: m.next, press: f % 4 === 0, hold: f % 4 === 0, look: m.x.loss ? 0.4 : -0.4 });
    m.view = () => ({ src, loss, dest: m.x.dest });
    m.panel = (i) => {
      const x = m.x;
      if (i === 0) return { label: 'Source pad mass count', value: `${(src * (1 - x.beam)).toFixed(1)} kg`, bar: 1 - x.beam };
      if (i === 1) { const sw = swing(); return { label: sw > tol ? 'Load plate needle swinging' : 'Load plate needle settled', value: `${needle().toFixed(1)} kg (swing ±${sw.toFixed(2)})`, bar: clamp(1 - sw / x.amp), band: [1 - tol / x.amp, 1] }; }
      if (i === 2) return { label: 'Transfer log', value: x.read == null ? '—' : `source ${src.toFixed(1)} kg · plate ${x.read.toFixed(1)} kg · diff ${(src - x.read).toFixed(1)}`, bar: 0.5 };
      return null;
    };
    m.prompt = (i) => ['Hold [E] to energize until the source count reads zero', 'Wait for the needle to settle, then tap [E] to read it', 'Look left + tap [E] = intact, look right + tap [E] = mass loss (> 0.5 kg)'][i] || '';
    return m;
  },
});
