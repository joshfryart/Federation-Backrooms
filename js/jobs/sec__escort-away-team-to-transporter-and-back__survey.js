// Security, survey: escort the away team to the transporter and back. At the junction the team files past one at a time: tap E to count
// each one off, but hold E to stop anyone whose comm unit is missing. On return at the pad the team beams back one at a time and the roster
// is no longer on the panel: from memory, tap E for each of your own people and hold E on anyone who was not in the team. Last, give the
// count: tap E if everyone came back, hold E if someone is still missing. A name let pass uncounted, a stranger waved in, or a wrong final
// count are faults.
import { define, machine, room, shuffle, clamp } from './kit.js';

const POOL = ['Ens. Kade', 'Lt. Varo', 'Ens. Mirren', 'PO Dask', 'Lt. Oyelaran', 'Ens. Thale', 'Spec. Ruiz', 'Lt. Senn', 'Ens. Abara', 'PO Iliev'];
export default define({
  job: { billet: 'sec', label: 'Escort away team to transporter and back', type: 'task:survey' },
  title: 'Count out, count back', dept: 'security', host: 'room', item: 'padd', siteName: 'Count', verb: 'Count',
  how: 'Going out: tap E for each team member, hold E on anyone with no comm unit. Coming back: tap E for your own people, hold E on a stranger, then tap (all back) or hold (someone missing).',
  keys: ['E tap: count them', 'E hold: stop them / raise the alert'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'count both ways', input: 'e-tap+e-hold', win: 'every member counted out with comm units checked, every returnee recognised from memory, strangers stopped and the return count called right',
    fail: 'letting someone pass uncounted, waving a stranger off the pad, or calling the team complete with someone left behind',
    rule: 'Names pass one per second. Out: tap = counted, hold = stop (no comm). Back: tap = ours, hold = not on the team. Final: tap all back, hold someone missing.' },
  rush: 'Waved the team through and counted heads roughly on the way back.',
  captions: { uncounted: 'name went by uncounted', 'no comm': 'away with no comm unit', 'held wrongly': 'crew member held for nothing', stranger: 'unknown person through', 'count wrong': 'count called wrong' },
  says: { uncounted: 'Someone went by uncounted.', 'no comm': 'That one had no comm unit — you should have stopped them.', 'held wrongly': 'Nothing wrong there: tap to count them.', stranger: 'That person was not in your team!', 'count wrong': 'Your count was wrong.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Corridor junction', prop: 'airlock_doors' }, { name: 'Transporter pad', prop: 'pad' }]), r = m.rnd;
    const names = shuffle(r, POOL), n = 4 + Math.floor(r() * 2), team = names.slice(0, n), noComm = Math.floor(r() * n), mode = r();
    const out = team.map((nm, k) => ({ site: 0, name: nm, info: k === noComm ? 'badge OK · NO COMM UNIT' : 'badge OK · comm OK', want: k === noComm ? 'hold' : 'tap', why: k === noComm ? 'no comm' : 'held wrongly' }));
    let back = shuffle(r, team); const missing = mode < 0.35; if (missing) back = back.slice(1);
    const back2 = back.map(nm => ({ site: 1, name: nm, info: 'on the pad', want: 'tap', why: 'held wrongly' }));
    if (mode > 0.65) back2.splice(Math.floor(r() * (back2.length + 1)), 0, { site: 1, name: names[n + 1], info: 'on the pad', want: 'hold', why: 'stranger' });
    m.q = [...out, ...back2, { site: 1, name: 'Return count', info: `${back.length} of your people back`, want: missing ? 'hold' : 'tap', why: 'count wrong', final: true }];
    m.k = 0; m.w = 0; m.hT = 0; m.held = false; m.done1 = false; const W = m.calm ? 1.7 : 1.25, HOLD = 0.6;
    const act = (kind) => { const it = m.q[m.k]; if (kind !== it.want) m.fault(kind === 'tap' && it.want === 'hold' ? it.why : it.final ? 'count wrong' : 'held wrongly'); m.ev(kind, { k: m.k }); m.k++; m.w = -0.3;
      if (m.k >= m.q.length) m.finish(1); else if (m.q[m.k].site === 1 && !m.sites[0].done) m.finish(0); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const it = m.q[m.k]; if (!it) return; m.w += dt;
      if (m.w < 0) { m.hT = 0; m.held = !!inp.hold; return; }
      if (inp.hold) { if (!m.held) m.hT = 0; m.hT += dt; if (m.hT >= HOLD && m.hT - dt < HOLD) act('hold'); }
      else if (m.held && m.hT > 0 && m.hT < 0.4) act('tap');
      m.held = !!inp.hold;
      if (!it.final && m.w > W && m.q[m.k] === it) { m.fault('uncounted'); m.k++; m.w = -0.3; if (m.k < m.q.length && m.q[m.k].site === 1 && !m.sites[0].done) m.finish(0); }
      s.prog = clamp(m.k / m.q.length) * 0.9;
    };
    m.hint = () => { const it = m.q[m.k]; if (!it || m.next < 0) return { at: -1 }; if (m.w < 0.15) return { at: m.next };
      return { at: m.next, hold: it.want === 'hold' ? true : !(m.held && m.hT > 0) }; };
    m.bad = () => ({ at: m.next });
    m.view = () => ({ q: m.q.map(it => [it.name, it.want]) });
    m.panel = (i) => { const it = m.q[m.k]; if (!it || it.site !== i) return { label: 'waiting', value: '' }; const vis = m.w >= 0;
      return { label: vis ? it.name : '…', value: vis ? it.info : '', bar: it.final ? clamp(m.hT / HOLD) : clamp(1 - m.w / W) }; };
    m.prompt = (i) => { const it = m.q[m.k]; if (!it) return ''; if (it.final) return 'Everyone back? Tap [E]. Someone missing? Hold [E]';
      return i === 0 ? 'Tap [E] to count them off — hold [E] to stop anyone with no comm unit' : 'One of yours? Tap [E]. Not on your team? Hold [E]'; };
    return m;
  },
});
