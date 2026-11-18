// Comms officer, cargo run: link the cargo and transporter channels. The junction board is a row of look-alike jacks. Aim along the row until
// the panel names the jack you are on, and hold E to work it: pull the CARGO lead from its jack, then seat it in the TRANSPORTER jack on the
// second board. Pulling or plugging any other jack silences a live channel. Last, hold the handset steady while the transporter chief talks.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const LABELS = ['CARGO', 'TRANSPORTER', 'SICKBAY', 'BRIDGE', 'SCIENCE'];
const SPOTS = [0.4, 0.2, 0, -0.2, -0.4];

export default define({
  job: { billet: 'comms', label: 'Link cargo and transporter channels', type: 'task:cargo_run' },
  title: 'Junction jack pick and repatch', dept: 'operations', host: 'room', siteName: 'Board', verb: 'Patch',
  how: 'Sweep your aim along the junction board until the panel names the right jack, then hold E to pull the cargo lead, seat it in the transporter jack, and hold the handset for the voice check.',
  keys: ['aim along the board', 'E hold: pull / seat / listen'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pick the jack', input: 'e-hold+look', win: 'the cargo lead pulled from its own jack and seated in the transporter jack, then confirmed by voice',
    fail: 'pulling or plugging a neighbouring jack and silencing a live crew channel',
    rule: 'Five jacks sit side by side; the panel names the jack under your aim. Hold E on the named jack only; drifting off it mid-pull lets go.' },
  rush: 'Swapped the leads by colour and hoped nobody was talking.',
  captions: { 'live cut': 'channel goes silent', seated: 'jack clicks home', voice: 'chief speaking on the new line' },
  says: { 'live cut': 'Wrong jack — a live crew channel just went silent. Read the label under your aim before you pull.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction board: cargo jack', prop: 'relayrack' }, { name: 'Junction board: transporter jack', prop: 'servers' }, { name: 'Handset check', prop: 'commsstation' }]), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.07, need = m.calm ? 0.6 : 0.75;
    m.boards = [0, 1].map(() => shuffle(r, LABELS).map((l, i) => ({ l, at: SPOTS[i] + rf(r, -0.03, 0.03) })));
    m.want = ['CARGO', 'TRANSPORTER']; m.work = 0; m.talk = rf(r, 1.2, 1.8);
    const aimed = (b, look) => m.boards[b].find(j => Math.abs((look || 0) - j.at) < tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next; m.lk = inp.look || 0;
      if (!inp.hold) { m.work = 0; s.prog = 0; return; }
      if (i === 2) { if (Math.abs(inp.look || 0) > 0.25) { m.work = 0; return; } m.work += dt; s.prog = clamp(m.work / m.talk * 0.9); if (m.work >= m.talk) m.finish(i); return; }
      const j = aimed(i, inp.look); if (!j) { m.work = 0; s.prog = 0; return; }
      m.work += dt; s.prog = clamp(m.work / need * 0.9);
      if (m.work >= need) { m.work = 0; if (j.l !== m.want[i]) { m.fault('live cut'); return; } m.ev('seated', { site: i }); m.finish(i); }
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 2) return { at: i, hold: true, look: 0 }; return { at: i, hold: true, look: m.boards[i].find(j => j.l === m.want[i]).at }; };
    m.bad = () => { const i = m.next; if (i === 2 || i < 0) return { at: i, hold: true, look: 0 }; return { at: i, hold: true, look: m.boards[i].find(j => j.l !== m.want[i]).at }; };
    m.view = () => ({ b: m.boards.map(b => b.map(j => j.l)) });
    m.lk = 0;
    m.panel = (i) => { if (i === 2) return { label: 'Handset', value: m.work > 0 ? 'chief speaking…' : 'hold to listen', bar: clamp(m.work / m.talk) };
      const j = m.boards[i] && aimed(i, m.lk); return { label: `Find ${m.want[i]}`, value: j ? `aimed at: ${j.l} jack` : 'between jacks', bar: clamp(m.work / need) }; };
    m.prompt = (i) => i === 2 ? 'Hold [E] on the handset and listen for the chief on the new line' : `Aim along the board to the ${m.want[i]} jack, then hold [E] to ${i === 0 ? 'pull the lead' : 'seat the lead'}`;
    return m;
  },
});
