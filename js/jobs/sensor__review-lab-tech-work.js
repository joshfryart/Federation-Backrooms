// Sensor officer: review lab tech work. Walk the bench run by run. At each run's tubes, look a little left and tap E to read the tube
// label, a little right and tap E to check the seal; the run's log line (result and initials) shows on the panel. Then decide: a run with a
// good label, an intact seal and a complete log line is signed off by holding E square-on; a run with anything wrong is handed back to its
// tech with a quick flick of the view away from the bench. Signing before both checks, signing a bad run or handing back a good one are faults.
import { define, machine, room, ri, pick, shuffle, clamp } from './kit.js';

const TECHS = ['Okafor', 'Lindqvist', 'Tamura', 'Reyes', 'Haddad', 'Novak', 'Pillai'];
export default define({
  job: { billet: 'sensor', label: 'Review lab tech work', type: 'loop' },
  title: 'Bench run sign-off or hand-back', dept: 'sciences', host: 'room', siteName: 'Run', verb: 'Review',
  how: 'At each run, look left and tap E to read the tube label, look right and tap E to check the seal, then hold E square-on to sign a clean run or flick the view away to hand a bad one back.',
  keys: ['look left + E tap: label', 'look right + E tap: seal', 'E hold square-on: sign', 'flick away: hand back'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'inspect then sign', input: 'e-tap+e-hold+look+swing', win: 'every bench run inspected label and seal first, clean runs signed with initials and faulty runs handed back to their tech',
    fail: 'signing a run without reading both its label and its seal, signing off a mislabelled, unsealed or unlogged run, or handing a clean run back',
    rule: 'Tap E looking left for the label and looking right for the seal; read the log line on the panel. All three good: hold E facing the tubes to sign. Anything wrong: flick the view away to hand it back.' },
  rush: 'Initialled the whole queue sheet from the doorway.',
  captions: { 'unchecked sign-off': 'pen scratch', 'signed a bad run': 'bridge gets bad data', 'needless hand-back': 'tech grumbles' },
  says: { 'unchecked sign-off': 'You signed before reading both the label and the seal.', 'signed a bad run': 'That run had a fault and you signed it — it goes to the bridge wrong.', 'needless hand-back': 'That run was clean. The tech has to redo it for nothing.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Run A tubes', prop: 'labbench' }, { name: 'Run B tubes', prop: 'workbench' }, { name: 'Run C tubes', prop: 'samplefridge' }]), r = m.rnd;
    const signT = m.calm ? 0.8 : 1.0, flick = 2.2, nBad = ri(r, 1, 2), bads = new Set(shuffle(r, [0, 1, 2]).slice(0, nBad)), techs = shuffle(r, TECHS);
    m.runs = m.sites.map((_, i) => { const bad = bads.has(i), what = bad ? pick(r, ['label', 'seal', 'result', 'initial']) : null;
      return { tech: techs[i], id: `S-${ri(r, 100, 999)}`, bad, what, label: null, seal: null, sg: 0, res: what === 'result' ? '—' : (ri(r, 10, 99) / 10).toFixed(1), init: what === 'initial' ? '—' : techs[i].slice(0, 2).toUpperCase() }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, k = m.runs[i], lk = inp.look || 0;
      if (inp.press && lk > 0.18) k.label = k.what === 'label' ? 'WRONG' : 'ok';
      if (inp.press && lk < -0.18) k.seal = k.what === 'seal' ? 'BROKEN' : 'ok';
      if (Math.abs(inp.swing || 0) > flick && k.label && k.seal) { if (k.bad) { m.ev('handed back', { site: i }); m.finish(i); } else { m.fault('needless hand-back'); k.label = k.seal = null; } return; }
      if (inp.hold && Math.abs(lk) < 0.15) { k.sg += dt; if (k.sg >= signT) { k.sg = 0; if (!k.label || !k.seal) m.fault('unchecked sign-off'); else if (k.bad) { m.fault('signed a bad run'); m.finish(i); } else m.finish(i); } }
      else k.sg = 0;
      if (!s.done) s.prog = clamp(((k.label ? 0.3 : 0) + (k.seal ? 0.3 : 0) + 0.3 * k.sg / signT), 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.runs[i], tap = f % 8 === 0;
      if (!k.label) return { at: i, look: 0.3, press: tap, hold: tap }; if (!k.seal) return { at: i, look: -0.3, press: tap, hold: tap };
      return k.bad ? { at: i, look: 0, swing: 3 } : { at: i, look: 0, hold: true }; };
    m.bad = () => ({ at: m.next, look: 0, hold: true });
    m.view = () => ({ runs: m.runs.map(k => [k.id, k.what]) });
    m.panel = (i) => { const k = m.runs[i]; if (!k) return null;
      return { label: `${k.id} · ${k.tech}`, value: `label ${k.label || '?'} · seal ${k.seal || '?'} · log ${k.res} / ${k.init}`, bar: k.sg / signT }; };
    m.prompt = (i) => { const k = m.runs[i]; if (!k) return ''; if (!k.label || !k.seal) return 'Look left + tap [E] for the label, look right + tap [E] for the seal';
      return 'Clean run: hold [E] facing the tubes to sign. Anything wrong (or a log line with —): flick the view away to hand it back'; };
    return m;
  },
});
