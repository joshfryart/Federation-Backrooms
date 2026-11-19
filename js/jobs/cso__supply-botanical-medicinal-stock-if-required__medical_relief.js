// Chief science officer: supply botanical medicinal stock. At each medicinal bed, look along the row to the plant whose tag is on the
// requisition (the panel names the plant you face). The stem sways steadily in the air flow, so its leaf node swings past the open snips:
// tap E to cut just as the node passes the blade. Cutting off the node's beat (too high or too low) wastes the stem and can kill the plant;
// cutting a plant that is not requisitioned, or one already filled, takes the wrong stock. Both are faults.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

const LK = [0.3, 0, -0.3], PLANTS = ['Feverfew', 'Willowbark', 'Yarrow', 'Comfrey', 'Valerian', 'Echinacea', 'Arnica'];
export default define({
  job: { billet: 'cso', label: 'Supply botanical medicinal stock if required', type: 'task:medical_relief' },
  title: 'Snip on the swaying node', dept: 'sciences', host: 'room', siteName: 'Bed', verb: 'Snip',
  how: 'Face the requisitioned plant in each bed. Its stem sways steadily: tap E to cut exactly as the leaf node swings past the snips, once per stem, until the requisition count is met.',
  keys: ['aim: pick the plant', 'E tap: cut on the node'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'snip on sway', input: 'e-tap+look+rhythm', win: 'each requisitioned stem cut from the right plant at its leaf node as the sway carries it past the blade, until every bed count is met',
    fail: 'cutting off the sway beat so the stem is cut above or below its node, or taking a stem from a plant not on the requisition',
    rule: 'Face the plant the requisition names. The node meter swings back and forth on a steady beat; tap E only while it reads AT BLADE. One cut per stem; the next stem starts at the top of its swing.' },
  rush: 'Grabbed a handful of whatever looked medicinal and bagged it.',
  captions: { 'bad cut': 'stem tears', 'wrong species': 'snips click' },
  says: { 'bad cut': 'Missed the node — that cut was too high or too low. Wait for AT BLADE.', 'wrong species': 'That plant is not on the requisition (or its count is filled).' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Medicinal bed A', prop: 'growbed' }, { name: 'Medicinal bed B', prop: 'plant' }]), r = m.rnd, tol = m.calm ? 0.12 : 0.09, win = m.calm ? 0.35 : 0.25;
    m.beds = m.sites.map(() => { const sp = shuffle(r, PLANTS).slice(0, 3), want = ri(r, 0, 2); return { sp, want, need: ri(r, 2, 3), got: 0, per: rf(r, 1.5, 1.9) * (m.calm ? 1.2 : 1), t0: rf(r, -0.5, 0) }; });
    const sway = (b) => Math.cos(6.283 * (m.t - b.t0) / b.per), faced = (inp) => LK.findIndex(v => Math.abs((inp.look || 0) - v) <= tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, b = m.beds[i];
      if (inp.press) { const j = faced(inp); if (j < 0) return;
        if (j !== b.want) m.fault('wrong species'); else if (Math.abs(sway(b)) < win) { b.got++; b.t0 = m.t; if (b.got >= b.need) { m.finish(i); return; } } else { m.fault('bad cut'); b.t0 = m.t; } }
      if (!s.done) s.prog = clamp(b.got / b.need, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.beds[i], go = Math.abs(sway(b)) < win * 0.6; return { at: i, look: LK[b.want], press: go, hold: go }; };
    m.bad = (f = 0) => { const i = m.next, b = m.beds[i]; return { at: i, look: LK[(b.want + 1) % 3], press: f % 10 === 0, hold: f % 10 === 0 }; };
    m.view = () => ({ beds: m.beds.map(b => [b.sp.join('/'), b.want, b.need]) });
    m.panel = (i) => { const b = m.beds[i]; if (!b) return null; const v = sway(b); return { label: `Requisition: ${b.need} × ${b.sp[b.want]} · cut ${b.got}`, value: Math.abs(v) < win ? 'AT BLADE' : v > 0 ? 'node above' : 'node below', bar: (v + 1) / 2, band: [0.5 - win / 2, 0.5 + win / 2] }; };
    m.prompt = (i) => { const b = m.beds[i]; if (!b) return ''; return `Face the ${b.sp[b.want]} (${['left', 'middle', 'right'][b.want]}; others: ${b.sp.filter((_, k) => k !== b.want).join(', ')}) and tap [E] as the node passes the blade`; };
    return m;
  },
});
