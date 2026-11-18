// Deck crew: stand by for recovery and wash down probes. Each pod lies across the wash bay with its seams at different bearings. Aim the hose
// at a seam and hold E to rinse it. Runoff flows toward the drain end, so rinsing a seam re-soils every seam downstream of it: start at the far
// (upstream) end. Spraying with the hose on bare deck between seams spreads contamination across the bay (a fault).
import { define, machine, room, rf, ri, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Stand by for recovery and wash down probes', type: 'task:survey' },
  title: 'Probe pod seam rinse, upstream first', dept: 'flight', host: 'room', item: 'mop', siteName: 'Probe pod', verb: 'Rinse',
  how: 'At each pod aim at a seam and hold E to rinse it. Runoff re-soils the seams toward the drain, so start at the end away from the drain. Never spray the deck between seams.',
  keys: ['Look: aim the hose at a seam', 'E hold: rinse'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'rinse upstream', input: 'e-hold+look', win: 'every seam of every probe pod reads clean at once, then the pod is racked',
    fail: 'spraying the open deck between seams so contamination spreads across the bay',
    rule: 'Each seam has its own contamination reading. Holding E on a seam cleans it, but its runoff adds to every seam on the drain side. Work from the far end toward the drain; hose off-seam for half a second is a spill.' },
  rush: 'Hosed the pods down from one side and racked them dripping.',
  captions: { spread: 'water splashes across the deck' }, says: { spread: 'That spray hit the deck and spread the residue. Keep the hose on a seam.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Probe pod A', prop: 'crate' }, { name: 'Probe pod B', prop: 'maint_stand' }, { name: 'Probe pod C', prop: 'workpod' }]), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.065, rate = m.calm ? 1.1 : 0.9;
    m.pods = m.sites.map(() => { const n = ri(r, 3, 4), drain = pick(r, [1, -1]), seams = []; for (let k = 0; k < n; k++) seams.push({ b: -0.42 + 0.84 * k / (n - 1) + rf(r, -0.03, 0.03), dirt: rf(r, 0.6, 1) }); return { seams, drain, off: 0 }; });
    // downstream of seam s = seams nearer the drain side (drain = +1: toward positive look / left)
    const down = (p, s) => p.seams.filter(x => (x.b - s.b) * p.drain > 0.01);
    const aimed = (p, look) => p.seams.find(x => Math.abs(x.b - (look || 0)) < tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, p = m.pods[i]; m.lk = inp.look || 0;
      if (inp.hold) { const x = aimed(p, inp.look); if (x) { p.off = 0; const c = Math.min(x.dirt, rate * dt); x.dirt -= c; for (const y of down(p, x)) y.dirt = Math.min(1, y.dirt + c * 0.5); }
        else { p.off += dt; if (p.off > 0.5) { m.fault('spread'); p.off = 0; for (const y of p.seams) y.dirt = Math.min(1, y.dirt + 0.2); } } } else p.off = 0;
      const worst = Math.max(...p.seams.map(x => x.dirt)); if (worst < 0.03) { m.finish(i); return; }
      s.prog = clamp(1 - p.seams.reduce((a, x) => a + x.dirt, 0) / p.seams.length, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pods[i]; const up = p.seams.slice().sort((a, b) => (a.b - b.b) * p.drain); const x = up.find(y => y.dirt >= 0.03); return x ? { at: i, hold: true, look: x.b } : { at: i }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0.5 });
    m.view = () => ({ pods: m.pods.map(p => [p.drain, p.seams.map(x => +x.b.toFixed(2))]) });
    m.panel = (i) => { const p = m.pods[i]; if (!p) return null; const marks = p.seams.map((x, k) => `${k + 1}:${Math.round(x.dirt * 100)}`).join(' '); const on = aimed(p, m.lk); return { label: `${on ? 'Hose on seam ' + (p.seams.indexOf(on) + 1) : 'Hose on DECK ✖'} · drain ${p.drain > 0 ? '◀' : '▶'}`, value: marks, bar: 1 - Math.max(...p.seams.map(x => x.dirt)) }; };
    m.prompt = (i) => { const p = m.pods[i]; return !p ? '' : `Aim at the seam farthest from the drain (${p.drain > 0 ? 'rightmost' : 'leftmost'} dirty one) and hold [E]`; };
    return m;
  },
});
