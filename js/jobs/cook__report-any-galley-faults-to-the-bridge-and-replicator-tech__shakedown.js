// Cook: report galley faults. Fault cards scroll past, each tagged. Heat, fire and power faults go to the bridge (Space); feed, seal and buffer
// faults go to the replicator tech (Enter); NOISE tags are just logged and need no call. Send each within its time.
import { define, machine, SPACE, ENTER, pick, rf, txt, COL } from './kit.js';
const BR = ['HEAT', 'FIRE', 'POWER'], TE = ['FEED', 'SEAL', 'BUFFER'];

export default define({
  job: { billet: 'cook', label: 'Report any galley faults to the bridge and Replicator Tech', type: 'task:shakedown' },
  title: 'Call each fault to the right ear', dept: 'services', host: 'console', tool: 'Galley intercom',
  how: 'Space calls the bridge for HEAT, FIRE or POWER cards. Enter calls the replicator tech for FEED, SEAL or BUFFER cards. Do nothing for NOISE.',
  keys: ['Space call the bridge', 'Enter call the replicator tech'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'dispatch by tag', input: 'space+enter', win: 'six fault cards each called to the bridge or the tech by tag, noise cards left alone',
    fail: 'calling the wrong party, calling in a noise card, or letting a real fault card pass uncalled',
    rule: 'Each card is on screen about two seconds. HEAT/FIRE/POWER: Space (bridge). FEED/SEAL/BUFFER: Enter (tech). NOISE: no call at all.' },
  rush: 'Radioed the bridge about everything and let the replicator tech find out on their own.',
  captions: { 'wrong call': 'intercom crackles', missed: 'fault left unreported' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, life = m.calm ? 3 : 2.3; m.n = 6; m.round = 0; m.cards = [];
    for (let i = 0; i < m.n; i++) { const k = r(); m.cards.push({ a: 1 + i * 2.6 + rf(r, 0, 0.3), tag: k < 0.2 ? 'NOISE' : k < 0.6 ? pick(r, BR) : pick(r, TE), done: false }); }
    const want = (c) => c.tag === 'NOISE' ? null : BR.includes(c.tag) ? 'Space' : 'Enter', cur = () => m.cards.find(c => !c.done && m.t >= c.a && m.t < c.a + life);
    const res = (c) => { c.done = true; m.round++; if (m.round >= m.n) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !(SPACE(code) || ENTER(code))) return false; const c = cur(), k = SPACE(code) ? 'Space' : 'Enter';
      if (!c || want(c) !== k) { m.fault('wrong call'); if (c) res(c); return true; } res(c); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const c of m.cards) if (!c.done && m.t >= c.a + life) { if (want(c)) m.fault('missed'); res(c); } };
    m.hint = () => { const c = cur(); return c && want(c) && m.t - c.a > 0.5 ? [[want(c), true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ tags: m.cards.map(c => c.tag) });
    m.buttons = () => [['Space', 'Bridge'], ['Enter', 'Tech']];
    m.draw = (c, W, H, P) => { const k = cur(); txt(c, 'HEAT FIRE POWER = bridge (Space)', 20, 28, { size: 11, col: COL.dim }); txt(c, 'FEED SEAL BUFFER = tech (Enter)', 20, 44, { size: 11, col: COL.dim });
      txt(c, k ? `[${k.tag}]` : 'quiet', 200, 100, { size: 30, align: 'center', col: k && k.tag === 'NOISE' ? COL.dim : COL.warn }); txt(c, k ? (want(k) ? `call: ${want(k) === 'Space' ? 'bridge' : 'tech'}` : 'log only') : '', 200, 130, { size: 12, align: 'center' });
      txt(c, `${m.round} / ${m.n} handled`, 16, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
