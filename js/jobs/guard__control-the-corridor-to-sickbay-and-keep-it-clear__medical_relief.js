// Guard: control the corridor to sickbay and keep the stretcher lane clear. Standing at the corner, the crowd leans into the lane from the
// port or the starboard side, and the leaning side shifts. Face the side that is pressing in (aim the view left for port, right for
// starboard) and hold E to hold your arm out and ease them back to the wall. Stretchers come through on a schedule: the lane must be open
// while one passes. Letting a side spill into the lane, a jammed stretcher, or pushing on people who have already stepped back are faults.
import { define, machine, room, rf } from './kit.js';

const SIDE = 0.25;
export default define({
  job: { billet: 'guard', label: 'Control the corridor to sickbay and keep it clear', type: 'task:medical_relief' },
  title: 'Stretcher corner arm brace', dept: 'security', host: 'room', siteName: 'Post', verb: 'Hold',
  how: 'Face the side of the crowd that is leaning into the lane (look left for port, right for starboard) and hold E to ease them back. Let go once they are at the wall. Keep the lane open as each stretcher passes.',
  keys: ['aim at the leaning side', 'E hold: arm out'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'brace the crowd', input: 'e-hold+look',
    win: 'three stretchers through the corner with both port and starboard crowds held back from the lane, then the ward door latch checked',
    fail: 'a side spilling into the stretcher lane, a stretcher jammed in a crowd, or shoving people who are already at the wall',
    rule: 'Two lean meters, port and starboard. Aim at the higher one and hold E to push it down; release when it is near zero. Both must be low while a stretcher passes.' },
  rush: 'Shouted at the crowd once and let the stretcher crews barge through.',
  captions: { spilled: 'crowd surges', jammed: 'stretcher wheels stop', shoved: 'startled yelp' },
  says: { spilled: 'That side spilled into the lane. Watch the leaning side.', jammed: 'The stretcher had to stop. Keep the lane clear when it comes.', shoved: 'They were already at the wall. Ease off.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Corridor corner', prop: 'airlock_doors' }, { name: 'Ward door latch', prop: 'nursestation' }]), r = m.rnd;
    const up = m.calm ? 0.32 : 0.42, push = 1.0;
    m.lean = []; let t = 0; while (t < 60) { m.lean.push([+t.toFixed(2), r() < 0.5 ? 0 : 1]); t += rf(r, 1.4, 2.4); }
    m.str = [0, 1, 2].map(k => ({ at: +(2.6 + k * rf(r, 3.0, 3.6)).toFixed(2), jam: false }));
    m.p = [rf(r, 0.1, 0.3), rf(r, 0.1, 0.3)]; m.lt = 0; m.shove = 0; m.latch = 0;
    const leaning = () => { let s = 0; for (const [a, k] of m.lean) if (m.lt >= a) s = k; return s; };
    const passing = () => m.str.find(x => m.lt >= x.at && m.lt < x.at + 1.2);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next;
      if (i === 1) { m.latch = inp.hold ? m.latch + dt : 0; if (m.latch >= 0.8) m.finish(1); s.prog = Math.min(0.9, m.latch); return; }
      m.lt += dt; const L = leaning(), look = inp.look || 0, face = look > SIDE ? 0 : look < -SIDE ? 1 : -1;
      for (let k = 0; k < 2; k++) { m.p[k] += dt * (k === L ? up : 0.06); if (inp.hold && face === k) m.p[k] -= dt * push; m.p[k] = Math.max(0, m.p[k]);
        if (m.p[k] >= 1) { m.fault('spilled'); m.p[k] = 0.5; } }
      if (inp.hold && face >= 0 && m.p[face] < 0.04) { m.shove += dt; if (m.shove > 0.6) { m.fault('shoved'); m.shove = 0; } } else m.shove = 0;
      const x = passing(); if (x && !x.jam && Math.max(...m.p) > 0.6) { x.jam = true; m.fault('jammed'); }
      if (m.lt >= m.str[2].at + 1.2) { m.finish(0); return; }
      s.prog = Math.min(0.9, m.lt / (m.str[2].at + 1.2));
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 1) return { at: 1, hold: true };
      const k = m.p[0] >= m.p[1] ? 0 : 1; return { at: 0, look: k === 0 ? 0.4 : -0.4, hold: m.p[k] > 0.12 }; };
    m.bad = () => ({ at: m.next, look: 0, hold: true });
    m.view = () => ({ lean: m.lean.slice(0, 6), str: m.str.map(x => x.at) });
    m.panel = (i) => { if (i === 1) return { label: 'Ward latch', value: 'hold to check', bar: Math.min(1, m.latch / 0.8) };
      const nx = m.str.find(x => m.lt < x.at + 1.2), pass = passing(), hi = m.p[0] >= m.p[1] ? 'PORT' : 'STBD';
      return { label: `${hi} leaning`, value: `port ${Math.round(m.p[0] * 100)} % · stbd ${Math.round(m.p[1] * 100)} % · ${pass ? 'STRETCHER PASSING' : nx ? `stretcher in ${Math.max(0, nx.at - m.lt).toFixed(1)} s` : 'clear'}`, bar: Math.max(...m.p), band: [0, 0.6] }; };
    m.prompt = (i) => (i === 1 ? 'Hold [E] on the ward door latch to check it seated' : 'Face the leaning side (left = port, right = starboard) and hold [E] to ease them back');
    return m;
  },
});
