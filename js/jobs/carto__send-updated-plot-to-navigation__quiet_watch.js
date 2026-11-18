// Cartographer, quiet watch: send the updated plot to navigation. At the sent queue, hold E: the queue scrolls one entry at a time; let go
// on the entry with the LATEST time stamp to copy its version onto your slate (version numbers are not in order, the clock is). At the nav
// station tap E to send and wait for the receipt line. If the receipt version matches the slate, hold E to log it; if it shows an older
// version (a silent send of the old plot), tap E to resend.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'carto', label: 'Send updated plot to navigation', type: 'task:quiet_watch' },
  title: 'Plot send receipt-version check', dept: 'sciences', host: 'room', item: 'padd', siteName: 'Station', verb: 'Send',
  how: 'Hold E at the sent queue and let go on the newest time stamp to copy its version, then tap E at the nav station to send; hold E to log a matching receipt, tap again to resend an old one.',
  keys: ['queue: hold E, let go on the newest', 'nav: tap E send / resend', 'nav: hold E log the receipt'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'slate and resend', input: 'e-hold+e-tap', win: 'the newest plot version copied to the slate and a receipt carrying that same version logged at the nav station',
    fail: 'copying an older version to the slate, logging a receipt with an old version, or resending a plot that already arrived',
    rule: 'Queue: hold E and release on the latest time stamp. Nav: tap to send, read the receipt; same version as the slate → hold to log, older → tap to resend.' },
  rush: 'Hit send, saw "delivered" flash and logged it without reading the receipt version.',
  captions: { 'old slate': 'slate scratch', 'stale plot': 'nav using old plot alarm', 'double send': 'duplicate file chirp', 'no receipt': 'log refused' },
  says: { 'old slate': 'That is not the newest entry — check the time stamps, not the version numbers.', 'stale plot': 'The receipt showed an older version. Navigation is flying the old plot.', 'double send': 'That receipt already matched. Resending just confuses navigation.', 'no receipt': 'Nothing to log yet: send and wait for the receipt line.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sent queue', prop: 'opsstation' }, { name: 'Nav station', prop: 'navstation' }]), r = m.rnd;
    const maj = ri(r, 3, 8), mins = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 4), times = [ri(r, 400, 700)]; for (let k = 1; k < 4; k++) times.push(times[k - 1] + ri(r, 7, 40));
    const tOrd = shuffle(r, [0, 1, 2, 3]); m.q = mins.map((mi, k) => ({ v: `${maj}.${mi}`, t: times[tOrd[k]] }));
    m.newest = m.q.reduce((b, e, k) => e.t > m.q[b].t ? k : b, 0); m.newV = m.q[m.newest].v;
    m.show = (m.newest + ri(r, 1, 3)) % 4; m.scroll = 0; m.per = m.calm ? 1.0 : 0.7; m.slate = null;
    const olds = m.q.filter((e, k) => k !== m.newest).map(e => e.v), nOld = ri(r, 0, 2);
    m.rcpts = [...Array.from({ length: nOld }, () => olds[ri(r, 0, olds.length - 1)]), m.newV]; m.att = 0;
    m.ph = 'ready'; m.wait = 0; m.hT = 0; m.logNeed = 0.8;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (m.ph === 'wait') { m.wait -= dt; if (m.wait <= 0) m.ph = 'rcpt'; }
      if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold) { m.scroll += dt; if (m.scroll >= m.per) { m.scroll = 0; m.show = (m.show + 1) % 4; } }
        if (rel) { if (m.show === m.newest) { m.slate = m.newV; m.finish(0); } else { m.fault('old slate'); m.show = (m.newest + 2) % 4; } m.scroll = 0; }
        s.prog = 0.3 * (m.scroll / m.per); return; }
      if (inp.hold) { m.hT += dt; if (m.hT >= m.logNeed) { m.hT = -99;
        if (m.ph !== 'rcpt') m.fault('no receipt'); else if (m.rcpts[m.att] !== m.slate) { m.fault('stale plot'); m.ph = 'ready'; m.att = Math.min(m.att + 1, m.rcpts.length - 1); } else { m.finish(1); return; } } }
      if (rel) { if (m.hT >= 0 && m.hT < 0.35) {
        if (m.ph === 'ready') { m.ph = 'wait'; m.wait = rf(r, 0.9, 1.6); }
        else if (m.ph === 'rcpt') { if (m.rcpts[m.att] === m.slate) m.fault('double send'); else { m.att++; m.ph = 'wait'; m.wait = rf(r, 0.9, 1.6); } } }
        m.hT = 0; }
      s.prog = clamp((m.ph === 'rcpt' ? 0.5 : m.ph === 'wait' ? 0.3 : 0.1) + (m.hT > 0 ? m.hT / m.logNeed * 0.4 : 0), 0, 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: m.show !== m.newest };
      if (m.ph === 'wait') return { at: 1 }; if (m.ph === 'rcpt' && m.rcpts[m.att] === m.slate) return { at: 1, hold: true };
      const tap = f % 8 === 0; return { at: 1, hold: tap, press: tap }; };
    m.bad = (f = 0) => m.next === 0 ? { at: 0, hold: f % 2 === 0, press: f % 2 === 0 } : { at: 1, hold: true };
    m.view = () => ({ q: m.q.map(e => [e.v, e.t]), r: m.rcpts });
    const hhmm = (t) => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}${String(t % 60).padStart(2, '0')}`;
    m.panel = (i) => {
      if (i === 0) { const e = m.q[m.show]; return { label: `Sent queue ${m.show + 1}/4`, value: `v${e.v} · sent ${hhmm(e.t)}`, bar: m.scroll / m.per }; }
      const rc = m.ph === 'rcpt' ? `receipt v${m.rcpts[m.att]}` : m.ph === 'wait' ? 'waiting for receipt…' : 'ready to send';
      return { label: `Slate v${m.slate || '?'}`, value: rc, bar: m.hT > 0 ? m.hT / m.logNeed : 0 };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] to scroll the queue; let go on the latest time stamp' : m.ph === 'rcpt' ? 'Receipt matches the slate: hold [E] to log. Older: tap [E] to resend' : m.ph === 'wait' ? 'Wait for the receipt line' : 'Tap [E] to send the plot';
    return m;
  },
});
