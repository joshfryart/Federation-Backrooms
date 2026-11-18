// XO: keep the watch bill covered for long scans. Each post loses its officer before the scan ends, leaving a gap on the timeline. Chain
// rested officers into the gap: each covers from where the cover line stops, for as many hours as they have left. An officer must hold the
// post's rating and be rested by the hour they would take over. Seal the bill only when no gap remains anywhere on it.
import { define, machine, DIG, ENTER, shuffle, ri, txt, box, COL } from './kit.js';

const POSTS = [['Sensor watch', 'SCI'], ['Helm', 'FLT'], ['EPS watch', 'ENG']];
const NAMES = ['Lt Aziz', 'Ens Park', 'Lt Coyle', 'Ens Ibarra', 'CPO Wren', 'Lt Fosse', 'Ens Kiri', 'Lt Dahl'];
const END = 14;
export default define({
  job: { billet: 'xo', label: 'Keep the watch bill covered for long scans', type: 'task:survey' },
  title: 'Long-scan cover chain', dept: 'command', host: 'console', tool: 'Ready room watch bill and rest roster',
  how: 'Pick officers by number to chain cover into each post\'s gap from where the cover line stops, then press Enter to seal the bill once no gap is left.',
  keys: ['1 – 6 put an officer on', 'Enter seal the bill'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'chain cover', input: 'digits+enter', win: 'every post\'s gap chained shut to scan end by rated officers rested before they take over, then the bill sealed',
    fail: 'putting on an officer still resting or without the rating, or sealing the bill with a gap left',
    rule: 'The cover line for the highlighted post stops at an hour. Press an officer\'s number: they must hold the post rating and be rested by that hour; they cover as many hours as they have. Enter seals the bill when every line reaches scan end.' },
  rush: 'Asked the watch already on post to stay on for the whole scan.',
  captions: { 'still resting': 'roster refusal tone', 'not rated': 'roster refusal tone', 'gap left': 'bill rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, NAMES); let k = 0; const offs = [];
    m.posts = shuffle(r, POSTS).slice(0, 2 + (r() < 0.5 ? 1 : 0)).map(([post, rat]) => {
      const g = ri(r, 3, 8), L = END - g, two = L > 7 || r() < 0.4, a = two ? ri(r, 3, L - 3) : L;
      offs.push({ name: nm[k++], rat, rest: g - ri(r, 0, 2), hrs: a + ri(r, 0, 1) }); if (two) offs.push({ name: nm[k++], rat, rest: g + a - ri(r, 0, 1), hrs: L - a + ri(r, 0, 2) });
      return { post, rat, cov: g, gap0: g };
    });
    const p0 = m.posts[0]; if (offs.length < 6) offs.push({ name: nm[k++], rat: p0.rat, rest: END + 1, hrs: 8 });
    if (offs.length < 6) offs.push({ name: nm[k++], rat: POSTS.find(p => !m.posts.some(q => q.rat === p[1]))?.[1] || 'MED', rest: 0, hrs: 10 });
    m.offs = shuffle(r, offs).map(o => ({ ...o, used: false })); m.sealed = false; m.rounds = m.posts.length; m.round = 0;
    const cur = () => m.posts.find(p => p.cov < END), ok = (o, p) => !o.used && o.rat === p.rat && o.rest <= p.cov;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), p = cur();
      if (ENTER(code)) { if (p) { m.fault('gap left'); return true; } m.win(); return true; }
      if (!d || d > m.offs.length) return false; if (!p) return true; const o = m.offs[d - 1]; if (o.used) return true;
      if (o.rat !== p.rat) { m.fault('not rated'); return true; } if (o.rest > p.cov) { m.fault('still resting'); return true; }
      o.used = true; o.on = p.post; o.from = p.cov; p.cov = Math.min(END, p.cov + o.hrs); m.ev('cover', { o: o.name, to: p.cov }); if (p.cov >= END) m.round++; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = cur(); if (!p) return [['Enter', true]]; const i = m.offs.findIndex(o => ok(o, p)); return i < 0 ? [] : [['Digit' + (i + 1), true]]; };
    m.bad = () => { const p = cur(); if (!p) return 'Enter'; const i = m.offs.findIndex(o => !o.used && !ok(o, p)); return i < 0 ? 'Enter' : 'Digit' + (i + 1); };
    m.view = () => ({ posts: m.posts.map(p => [p.post, p.gap0]), offs: m.offs.map(o => [o.name, o.rat, o.rest, o.hrs]) });
    m.buttons = () => [...m.offs.map((o, i) => ['Digit' + (i + 1), String(i + 1)]), ['Enter', 'Seal bill']];
    m.draw = (c, W, H, P) => {
      const X = (h) => 100 + h / END * (W - 112), p = cur();
      m.posts.forEach((q, i) => { const y = 8 + i * 20, s = q === p; txt(c, `${q.post} ${q.rat}`, 10, y + 12, { size: 10, col: s ? COL.gold : COL.ink });
        box(c, X(0), y + 3, X(q.gap0) - X(0), 11, COL.peri, null, 2); if (q.cov > q.gap0) box(c, X(q.gap0), y + 3, X(q.cov) - X(q.gap0), 11, P.good, null, 2);
        if (q.cov < END) { c.strokeStyle = P.bad; c.lineWidth = 2; c.strokeRect(X(q.cov), y + 3, X(END) - X(q.cov), 11); txt(c, `gap from ${q.cov} h`, X(END) - 4, y + 12, { size: 9, col: P.bad, align: 'right' }); } });
      txt(c, `scan ends ${END} h`, W - 10, 74, { size: 9, col: COL.dim, align: 'right' });
      m.offs.forEach((o, i) => { const y = 80 + i * 14; txt(c, `${i + 1} ${o.name}`, 10, y + 10, { size: 10, col: o.used ? COL.dim : COL.ink });
        txt(c, `rating ${o.rat}`, 120, y + 10, { size: 10, col: p && o.rat === p.rat ? P.good : COL.dim }); txt(c, `rested from ${o.rest} h`, 200, y + 10, { size: 10, col: p && o.rest <= p.cov ? P.good : COL.dim });
        txt(c, o.used ? `on ${o.on}` : `${o.hrs} h left`, 310, y + 10, { size: 10, col: COL.pale }); });
    };
    return m;
  },
});
