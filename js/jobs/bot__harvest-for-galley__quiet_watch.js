// Botanist, quiet watch: harvest for galley. The cook's order slip splits the pick across the rack. Each stem sways in the air-handler draught,
// so the node drifts past the snip blades and back on a steady beat. Tap E to cut only as the node passes the blades: a cut off the beat lands
// too far above the node, drops the stem and costs the plant a fruit (a fault). Cut a plant's share of the order and move on to the next.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Harvest for galley', type: 'task:quiet_watch' },
  title: 'Snip on the sway', dept: 'sciences', host: 'room', siteName: 'Plant', verb: 'Snip',
  how: 'Each stem sways on a steady beat. Tap E just as the node swings through the blades to cut a finger above it; cut each plant’s share of the order slip.',
  keys: ['E tap on the beat: snip at the node'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'snip on beat', input: 'e-tap+rhythm', win: 'the order slip count cut, every stem snipped as its swaying node crossed the blades',
    fail: 'snipping off the beat so the cut lands far above the node and the stem drops',
    rule: 'The node marker swings left and right through the blade line on a regular beat. Tap E as it crosses the line; each clean cut adds one to the count bar.' },
  rush: 'Hacked a bunch off the top of the rack and called it the order.',
  captions: { 'cut above node': 'stem drops to the floor' },
  says: { 'cut above node': 'Cut off the beat, too far above the node: the stem dropped. Wait for it to swing through the blades.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Fruiting rack top', prop: 'tree' }, { name: 'Fruiting rack middle', prop: 'plant' }, { name: 'Fruiting rack low', prop: 'tree' }]), r = m.rnd;
    const tol = m.calm ? 0.26 : 0.19;
    m.plants = m.sites.map(() => ({ share: ri(r, 1, 3), cut: 0, per: rf(r, 1.1, 1.6) * (m.calm ? 1.15 : 1), ph: rf(r, 0, 6.28) }));
    m.order = m.plants.reduce((a, p) => a + p.share, 0);
    m.off = (p) => Math.sin(m.t * 6.283 / p.per + p.ph);   // -1..1, 0 = node at the blades
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.plants[i];
      if (inp.press) { if (Math.abs(m.off(p)) <= tol) { p.cut++; m.ev('snip', { site: i }); if (p.cut >= p.share) { m.finish(i); return; } } else m.fault('cut above node'); }
      s.prog = clamp(p.cut / p.share, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.plants[i]; const ok = Math.abs(m.off(p)) <= tol * 0.6 && m.t - (m.lastHint ?? -9) > 0.3;
      if (ok) m.lastHint = m.t; return { at: i, press: ok }; };
    m.bad = (f = 0) => { const i = m.next, p = m.plants[i]; return { at: i, press: f % 6 === 0 && Math.abs(m.off(p)) > 0.7 }; };
    m.view = () => ({ plants: m.plants.map(p => [p.share, +p.per.toFixed(2)]) });
    m.panel = (i) => { const p = m.plants[i]; if (!p) return null; const o = m.off(p); return { label: Math.abs(o) <= tol ? 'NODE AT BLADES' : 'Node swaying', value: `${p.cut}/${p.share} cut · order ${m.plants.reduce((a, q) => a + q.cut, 0)}/${m.order}`, bar: (o + 1) / 2, band: [0.5 - tol / 2, 0.5 + tol / 2] }; };
    m.prompt = (i) => (m.plants[i] ? 'Watch the node swing; tap [E] as it crosses the blades (the green band)' : '');
    return m;
  },
});
