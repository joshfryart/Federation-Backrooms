// Counsellor: check on the engineering crew after a fault. At the fault panel, wait for the crew to finish the reset before you step in (tap E
// once the reset reads DONE). At the junior crewman, tap E to ask whether they think the fault was theirs. From then their self-blame climbs.
// At the reset log, turn your view along the entries and tap E on the one that shows the SYSTEM cause, so you can point to it. Tapping the
// entry with the junior's own action on it pins the blame on them; taking too long lets them freeze.
import { define, machine, room, rf, pick, shuffle } from './kit.js';

const JUN = ['Crewman Elkin', 'Crewman Payne', 'Ensign Rook', 'Crewman Adisa', 'Ensign Vell'];
const SYS = ['SYS  coolant relay tripped (auto)', 'SYS  sensor bus timeout, plasma flow', 'SYS  injector firmware fault 7-B', 'SYS  breaker cascade from deck 9'];
export default define({
  job: { billet: 'counsel', label: 'Check on the engineering crew after a fault', type: 'task:shakedown' },
  title: 'Point to the system fault in the log', dept: 'medical', host: 'room', siteName: 'Stop', verb: 'Check',
  how: 'Wait for the reset to finish, then tap E at the panel. Tap E to ask the junior if they blame themselves. At the log, turn your view to the SYSTEM entry and tap E to point to it.',
  keys: ['E tap: step in / ask / point', 'look along the log'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'point out cause', input: 'e-tap+look', win: 'the reset left to finish, the junior asked, and the log entry showing the system cause pointed out before their self-blame sets',
    fail: 'stepping in during the reset, pointing at the entry with the junior\'s own action on it, or leaving them to freeze in their guilt',
    rule: 'Tap E at the panel only once the reset reads DONE. Tap E to ask the junior. At the log, the panel names the entry under your view; aim at the SYS line (±0.12 rad) and tap E.' },
  rush: 'Told the crew "these things happen" from the doorway.',
  captions: { 'interrupted reset': 'reset aborts with a buzz', 'blamed the junior': 'junior crewman flinches', froze: 'junior goes silent' },
  says: { 'interrupted reset': 'You stepped in mid-reset — it aborted. Wait until it reads DONE.', 'blamed the junior': 'That entry is their own manual step — you just pinned it on them.', froze: 'You took too long; their guilt has set.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Fault panel', prop: 'relayrack' }, { name: 'Junior crewman', prop: 'pumpskid' }, { name: 'Reset log', prop: 'console' }]), r = m.rnd, tol = m.calm ? 0.16 : 0.12;
    m.jun = pick(r, JUN); m.resetAt = rf(r, 3.0, 5.0); m.reset = 0; m.blame = 0; m.asked = false;
    const lines = shuffle(r, [[pick(r, SYS), 'sys'], [`MAN  ${m.jun}: manual override`, 'jun'], [`MAN  ${m.jun}: valve 3 opened`, 'jun'], ['LOG  shift handover noted', 'note']]);
    const bears = [-0.45, -0.15, 0.15, 0.45]; m.log = lines.map(([s, k], i) => ({ s, k, at: bears[i] + rf(r, -0.04, 0.04) }));
    const under = (lk) => m.log.find(x => Math.abs(lk - x.at) <= tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; m.lk = inp.look || 0; m.reset = Math.min(1, m.reset + dt / m.resetAt);
      if (m.asked) { m.blame += dt * (m.calm ? 0.045 : 0.06); if (m.blame >= 1) { m.fault('froze'); m.blame = 0.4; } }
      const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.press) { if (m.reset < 1) { m.fault('interrupted reset'); m.reset = 0; } else { m.finish(0); return; } } s.prog = m.reset * 0.9; return; }
      if (i === 1) { if (inp.press) { m.asked = true; m.finish(1); } return; }
      const u = under(inp.look || 0); if (inp.press && u) { if (u.k === 'sys') { m.finish(2); return; } if (u.k === 'jun') { m.fault('blamed the junior'); m.blame = Math.min(0.95, m.blame + 0.3); } }
      s.prog = 0.5 * (1 - m.blame);
    };
    const tgt = () => m.log.find(x => x.k === 'sys').at;
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, press: m.reset >= 1 && f % 6 === 0 }; if (i === 1) return { at: 1, press: f % 6 === 0 }; return { at: 2, look: tgt(), press: f % 6 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i === 0 && m.reset < 0.9) return { at: 0, press: f % 6 === 0 }; if (i < 2) return { at: i, press: f % 6 === 0 }; return { at: 2, look: m.log.find(x => x.k === 'jun').at, press: f % 6 === 0 }; };
    m.view = () => ({ jun: m.jun, reset: +m.resetAt.toFixed(2), log: m.log.map(x => [x.s, +x.at.toFixed(2)]) });
    m.panel = (i) => i === 0 ? { label: m.reset >= 1 ? 'Reset DONE' : 'Reset running…', value: `${Math.round(m.reset * 100)} %`, bar: m.reset, band: [0.99, 1] }
      : i === 1 ? { label: m.jun, value: 'avoiding the lead\'s eye', bar: 0 } : { label: `${m.jun}: self-blame`, value: under(m.lk || 0)?.s || 'look along the log to read entries', bar: m.blame };
    m.prompt = (i) => i === 0 ? (m.reset >= 1 ? 'Reset done — tap [E] to step in' : 'Let them finish the reset — wait') : i === 1 ? `Tap [E] to ask ${m.jun} whether they think the fault was theirs`
      : 'Turn your view along the log entries; tap [E] on the SYS line that shows the system cause';
    return m;
  },
});
