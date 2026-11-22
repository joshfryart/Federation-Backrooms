// Yeoman: brief the captain on the schedule. The captain gives you a few seconds and a handful of words. For each roster item build a
// three-line brief from the phrase panel (time, subject, who is waiting) plus the clash line when the roster shows a double booking, all inside
// the word budget. Long-winded phrases blow the budget and lose the captain; a missing clash walks the captain into a double booking.
import { define, machine, DIG, SPACE, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

const SUBJ = [['Hull survey', 'the full results of the hull survey review'], ['Cargo audit', 'the quarterly audit of cargo bay holdings'], ['Crew review', 'a review of crew evaluations from last month'],
  ['Envoy call', 'the scheduled subspace call with the envoy'], ['Drill debrief', 'the debrief of yesterday\'s damage control drill'], ['Refit plan', 'the outline of the refit plan for spacedock']];
const WHO = [['Cdr Okafor', 'Commander Okafor, who has been waiting a while'], ['Dr Lin', 'Doctor Lin from sickbay, who came up early'], ['Lt Varga', 'Lieutenant Varga of engineering, standing by outside'],
  ['Ens Moreau', 'Ensign Moreau with the reports you asked for'], ['QM Haddad', 'the Quartermaster, Haddad, with the stores sheets']];
const words = (s) => s.split(' ').length;

export default define({
  job: { billet: 'yeoman', label: 'Brief captain on schedule', type: 'loop' },
  title: 'Three-line brief inside the word budget', dept: 'command', host: 'console', tool: 'Roster screen and brief panel',
  how: 'Toggle phrases (1-6) to build a brief with a time, a subject and who is waiting, plus the clash line if the roster shows one, then deliver (Space) inside the word budget.',
  keys: ['1-6 toggle a phrase', 'Space deliver the brief'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'trim to budget', input: 'digits+space', win: 'three briefs delivered each carrying time subject waiting party and any real clash within the word allowance',
    fail: 'padding the brief past the captain\'s word allowance, dropping a line, or leaving out or inventing a clash',
    rule: 'Each phrase shows its line type and word count. Pick exactly one time, one subject and one waiting-party phrase, add the clash line only if the roster marks a clash, keep the total under the budget, then press Space.' },
  rush: 'Read the whole roster out in one breath at the captain\'s elbow.',
  captions: { 'lost the captain': 'captain sighs', 'missing line': 'captain: "And?"', 'double booking': 'two visitors at the door', 'false clash': 'captain frowns', 'walked off': 'bridge door hisses' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, budget = m.calm ? 10 : 9, per = m.calm ? 11 : 7.5;
    const subs = shuffle(r, SUBJ), whos = shuffle(r, WHO), clashAt = ri(r, 0, 2), extra = r() < 0.5 ? (clashAt + 1 + ri(r, 0, 1)) % 3 : -1;
    m.items = [0, 1, 2].map(k => {
      const hh = 8 + k * 2 + ri(r, 0, 1), mm = pick(r, ['00', '15', '30', '45']), t = `${String(hh).padStart(2, '0')}${mm}`, clash = k === clashAt || k === extra;
      const other = whos[(k + 3) % whos.length][0], ph = [
        { tag: 'time', s: t, ok: 1 }, { tag: 'time', s: `at ${hh} ${mm === '00' ? 'hundred' : mm} hours or thereabouts`, ok: 0 },
        { tag: 'subject', s: subs[k][0], ok: 1 }, { tag: 'subject', s: subs[k][1], ok: 0 },
        { tag: 'waiting', s: whos[k][0], ok: 1 }, { tag: 'waiting', s: whos[k][1], ok: 0 }];
      ph.push(clash ? { tag: 'clash', s: `Clash: ${other}`, ok: 1 } : { tag: 'clash', s: `Clash: ${other}`, ok: 0, decoy: 1 });
      const lst = shuffle(r, ph).map(p => ({ ...p, n: words(p.s) })); const longs = lst.map((p, i) => (!p.ok && !p.decoy ? i : -1)).filter(i => i >= 0), drop = pick(r, longs);
      return { t, subj: subs[k][0], who: whos[k][0], clash, other, ph: lst.filter((_, i) => i !== drop) };
    });
    m.rounds = 3; m.round = 1; m.k = 0; m.sel = new Set(); m.clock = 0;
    const cur = () => m.items[Math.min(m.k, 2)], total = () => [...m.sel].reduce((a, i) => a + cur().ph[i].n, 0);
    const next = () => { m.k++; m.sel = new Set(); m.clock = 0; if (m.k >= 3) { if (m.state === 'play') m.win(); } else m.round = m.k + 1; };
    const deliver = () => {
      const it = cur(), ps = [...m.sel].map(i => it.ph[i]), has = (tag) => ps.filter(p => p.tag === tag).length;
      if (ps.some(p => p.decoy)) m.fault('false clash'); else if (has('time') !== 1 || has('subject') !== 1 || has('waiting') !== 1) m.fault('missing line');
      else if (it.clash && !has('clash')) m.fault('double booking'); else if (total() > budget) m.fault('lost the captain');
      next();
    };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (d >= 1 && d <= cur().ph.length) { if (down) { if (m.sel.has(d - 1)) m.sel.delete(d - 1); else m.sel.add(d - 1); } return true; }
      if (SPACE(code)) { if (down) deliver(); return true; } return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.clock += dt; if (m.clock > per) { m.fault('walked off'); next(); } };
    const want = (p) => (p.ok && (p.tag !== 'clash' || cur().clash)) ? 1 : 0;
    m.hint = () => { if (m.k >= 3) return []; const ph = cur().ph; for (let i = 0; i < ph.length; i++) if (want(ph[i]) !== (m.sel.has(i) ? 1 : 0)) return [[`Digit${i + 1}`, true]]; return [['Space', true]]; };
    m.bad = () => (m.sel.size ? 'Space' : `Digit${cur().ph.findIndex(p => !p.ok) + 1}`);
    m.view = () => ({ items: m.items.map(i => [i.t, i.subj, i.who, i.clash, i.ph.map(p => p.s)]) });
    m.buttons = () => [...cur().ph.map((_, i) => [`Digit${i + 1}`, String(i + 1)]), ['Space', 'Deliver']];
    m.draw = (c, W, H, P) => {
      if (m.k >= 3) return; const it = cur(); box(c, 8, 8, 130, 120, 'rgba(255,255,255,.06)', COL.peri, 8);
      txt(c, 'ROSTER', 16, 24, { size: 10, col: COL.peri }); txt(c, it.t, 16, 46, { size: 18, col: COL.gold }); txt(c, it.subj, 16, 66, { size: 11 }); txt(c, it.who, 16, 84, { size: 11, col: COL.pale });
      txt(c, it.clash ? `▲ CLASH: ${it.other}` : '○ no clash', 16, 112, { size: 10, col: it.clash ? P.bad : COL.dim });
      it.ph.forEach((p, i) => { const y = 16 + i * 19, on = m.sel.has(i); box(c, 146, y - 2, 246, 17, on ? 'rgba(244,194,91,.25)' : 'rgba(255,255,255,.04)', on ? COL.gold : null, 4);
        txt(c, `${i + 1} ${on ? '■' : '□'} ${p.tag.toUpperCase()} (${p.n})`, 150, y + 10, { size: 9, col: COL.lav }); txt(c, p.s.length > 30 ? p.s.slice(0, 29) + '…' : p.s, 250, y + 10, { size: 9 }); });
      const n = total(); txt(c, `words ${n} / ${budget}`, 146, 140, { size: 11, col: n > budget ? P.bad : COL.ink }); bar(c, 230, 132, 160, 9, n / 14, { band: [0, budget / 14] });
      txt(c, 'captain\'s patience', 8, 150, { size: 9, col: COL.dim }); bar(c, 8, 156, 384, 7, 1 - m.clock / per, { col: COL.peri });
    };
    return m;
  },
});
