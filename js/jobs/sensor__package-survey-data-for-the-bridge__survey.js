// Sensor officer: package survey data for the bridge (survey). The survey records come down a belt one at a time and must be sorted before
// they slide off the end: 1 a raw noise frame goes to the noise bin; 2 a contact on a bearing already in the package is merged onto that
// entry; 3 a real contact with a LOW confidence tag is kept with its caveat; 4 a solid new contact is kept. The faint low-confidence
// contacts look like noise but carry a bearing: binning one drops a real contact. When the belt is empty, send the package (Enter).
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const PILE = ['', 'noise bin', 'merge', 'keep + caveat', 'keep'];
export default define({
  job: { billet: 'sensor', label: 'Package survey data for the bridge', type: 'task:survey' },
  title: 'Survey record belt sort', dept: 'sciences', host: 'console', tool: 'Bridge console package builder',
  how: 'Sort each survey record before it slides off: 1 noise bin, 2 merge onto a bearing already kept, 3 keep with caveat (LOW confidence), 4 keep. Send the package with Enter when the belt is empty.',
  keys: ['1 noise bin', '2 merge duplicate', '3 keep + caveat', '4 keep', 'Enter send'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'sort into piles', input: 'digits+enter', win: 'every survey record sorted off the belt into noise, merge, caveat or keep before it falls off, and the clean package sent to tactical',
    fail: 'binning a faint real contact, keeping a raw frame, keeping a duplicate bearing twice, dropping a caveat, or letting a record slide off unsorted',
    rule: 'Records slide along the belt one at a time. No bearing: noise (1). Bearing already in the package list: merge (2). Bearing with LOW tag: caveat (3). New solid bearing: keep (4). Enter once the belt is empty.' },
  rush: 'Sent the bridge every raw frame from both sweeps in one dump.',
  captions: { 'binned a contact': 'contact lost tone', 'kept noise': 'tactical screen speckles', 'double entry': 'duplicate warning', 'no caveat': 'confidence warning', 'needless caveat': 'bridge queries', 'off the belt': 'record drops', 'sent early': 'package incomplete' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, beltT = m.calm ? 4.4 : 3.4;
    const bs = shuffle(r, [12, 37, 64, 88, 115, 142, 171, 203, 236, 259, 288, 317, 344]).slice(0, 5).map(b => b + ri(r, 0, 9));
    let base = [{ k: 4, b: bs[0] }, { k: 4, b: bs[1] }, { k: r() < 0.5 ? 4 : 3, b: bs[2] }, { k: 3, b: bs[3] }, { k: 1 }, { k: 1 }, r() < 0.5 ? { k: 1 } : { k: 4, b: bs[4] }];
    base = shuffle(r, base); const kept = base.filter(x => x.k >= 3), n = ri(r, 1, 2);
    for (let j = 0; j < n; j++) { const o = kept[j], at = base.indexOf(o) + 1 + ri(r, 0, base.length - base.indexOf(o) - 1); base.splice(at, 0, { k: 2, b: o.b }); }
    m.items = base.map(x => ({ ...x, snr: x.k === 1 ? ri(r, 2, 9) / 10 : x.k === 3 ? ri(r, 10, 16) / 10 : ri(r, 28, 60) / 10, id: ri(r, 100, 999) }));
    m.i = 0; m.age = -0.6; m.pile = []; m.round = 0; m.rounds = m.items.length;
    const I = () => m.items[m.i], done = () => m.i >= m.items.length, adv = () => { m.i++; m.age = -0.3; m.round = m.i; };
    const judge = (d) => { const it = I(), k = it.k; if (d === k) { if (k >= 3) m.pile.push(it); adv(); return; }
      m.fault(k === 1 ? (d === 2 ? 'double entry' : 'kept noise') : d === 1 ? 'binned a contact' : k === 2 ? 'double entry' : k === 3 ? 'no caveat' : d === 3 ? 'needless caveat' : 'double entry'); adv(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!(d >= 1 && d <= 4) && !ENTER(code)) return false; if (!down) return true;
      if (ENTER(code)) { if (done()) m.win(); else m.fault('sent early'); return true; }
      if (!done() && m.age >= 0) judge(d); return true;
    };
    m.tick = (dt) => { if (!m.live(dt) || done()) return; m.age += dt; if (m.age >= beltT) { m.fault('off the belt'); adv(); } };
    m.hint = () => (done() ? [['Enter', true]] : m.age > 0.4 ? [['Digit' + I().k, true]] : []);
    m.bad = () => (done() ? 'Enter' : m.age > 0.2 ? 'Digit1' : null);
    m.view = () => ({ it: m.items.map(x => [x.k, x.b ?? 0]) });
    m.buttons = () => [['Digit1', '1 Noise'], ['Digit2', '2 Merge'], ['Digit3', '3 Caveat'], ['Digit4', '4 Keep'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, `BELT · record ${Math.min(m.i + 1, m.items.length)} / ${m.items.length}`, 14, 18, { size: 11, col: COL.gold });
      box(c, 14, 26, 230, 70, 'rgba(255,255,255,.04)', COL.dim, 4);
      if (!done() && m.age >= 0) { const it = I(), x = 20 + (1 - m.age / beltT) * 120; box(c, x, 34, 100, 54, COL.panel, COL.pale, 4);
        txt(c, `REC ${it.id}`, x + 6, 48, { size: 10, col: COL.dim }); txt(c, it.b != null ? `brg ${String(it.b).padStart(3, '0')}°` : 'RAW frame', x + 6, 64, { size: 12 });
        txt(c, `SNR ${it.snr.toFixed(1)}${it.k === 3 ? ' · LOW' : ''}`, x + 6, 80, { size: 10, col: it.k === 3 ? COL.warn : COL.dim }); }
      c.fillStyle = COL.warn; c.fillRect(14, 92, 230 * Math.max(0, 1 - m.age / beltT), 3);
      txt(c, 'PACKAGE', 262, 18, { size: 11, col: COL.gold });
      m.pile.forEach((it, j) => { lamp(c, 268, 30 + j * 16, 5, it.k === 3 ? COL.warn : P.good, it.k === 3 ? 'triangle' : 'circle'); txt(c, `brg ${String(it.b).padStart(3, '0')}°${it.k === 3 ? ' caveat' : ''}`, 278, 34 + j * 16, { size: 10 }); });
      PILE.slice(1).forEach((p, j) => txt(c, `${j + 1} ${p}`, 14 + j * 62, 116, { size: 9, col: COL.dim }));
      txt(c, done() ? 'Belt empty — Enter to send to tactical' : 'sort before it slides off', 14, 150, { size: 11, col: done() ? COL.gold : COL.dim });
    };
    return m;
  },
});
