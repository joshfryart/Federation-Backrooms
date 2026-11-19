// Counsellor: counsel the evacuees on arrival. Kneel by the biobed. First meet what they ask for (1 water, 2 blanket, 3 a call to family).
// Then tell them what happens next in three short sentences: each turn pick the short plain sentence (1 – 3), and only while they are looking
// at you, never while they are sipping. Last, check the wristband with the nurse: the arrivals sheet steps through its lines; press Enter on
// the line that matches the band. Jargon, talking over a sip, or the wrong need all add to the overload.
import { define, machine, ENTER, DIG, rf, pick, shuffle, txt, box, bar, COL } from './kit.js';

const NAMES = ['Mira Coll', 'Dath Orren', 'Isel Vane', 'Tomas Rhee', 'Junia Pell', 'Kaz Tibor', 'Ona Fiske', 'Reth Amari'];
const NEEDS = [['"I\'m so thirsty…"', 1], ['"It\'s freezing in here."', 2], ['"Does my brother know I\'m alive?"', 3]];
const STEPS = [['You are safe on our ship.', 'You have been transported to a Federation vessel under emergency protocol.'], ['A nurse will check you soon.', 'Medical will run a full triage diagnostic and bio-scan sequence shortly.'],
  ['Then you can rest.', 'Following assessment you will be allocated berthing per the evacuee manifest.'], ['I will stay with you.', 'Counselling services remain available through the duty roster.'], ['Your family will be told.', 'Next-of-kin notification proceeds via subspace relay once processed.']];
export default define({
  job: { billet: 'counsel', label: 'Counsel the evacuees on arrival', type: 'task:medical_relief' },
  title: 'Three plain sentences at the biobed', dept: 'medical', host: 'console', tool: 'Water cup, blanket, arrivals sheet',
  how: 'Meet their need (1 water, 2 blanket, 3 call). Then, only while they look at you, pick the short plain sentence (1 – 3) three times. Last, press Enter when the sheet line matches the wristband.',
  keys: ['1 – 3 need / sentence', 'Enter match wristband'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'speak plainly', input: 'digits+enter', win: 'the evacuee\'s need met, three short plain next-step sentences spoken between sips, and their wristband matched to the arrivals sheet',
    fail: 'jargon, talking over them while they drink, the wrong comfort, or confirming the wrong name so panic spreads',
    rule: 'Answer the need with 1 – 3. Then while the face shows LOOKING (not SIPPING) press the number of the shortest plainest sentence. Finally Enter when the stepping sheet line equals the band name.' },
  rush: 'Read them the evacuee protocol and moved to the next bed.',
  captions: { overloaded: 'evacuee starts to shake', 'talked over': 'evacuee chokes on water', 'wrong name': 'nurse stops you' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cyc = m.calm ? 1.1 : 0.8;
    m.name = pick(r, NAMES); m.need = pick(r, NEEDS); m.lines = shuffle(r, NAMES.filter(n => n !== m.name)).slice(0, 3).concat(m.name); m.lines = shuffle(r, m.lines);
    m.turns = shuffle(r, STEPS).slice(0, 3).map(([plain, jar]) => { const decoy = pick(r, STEPS.filter(s => s[0] !== plain))[1]; const o = shuffle(r, [[plain, true], [jar, false], [decoy, false]]); return { o, ans: o.findIndex(x => x[1]) + 1 }; });
    m.ph = 'need'; m.k = 0; m.over = 0.3; m.sip = false; m.sc = rf(r, 1.0, 1.6); m.li = 0; m.lc = 0; m.rounds = 5; m.round = 0;
    const load = (why) => { m.over = Math.min(1, m.over + 0.25); m.fault(why); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 3) {
        if (m.ph === 'need') { if (d === m.need[1]) { m.ph = 'talk'; m.round = 1; m.over = Math.max(0, m.over - 0.15); } else load('overloaded'); }
        else if (m.ph === 'talk') { if (m.sip) { load('talked over'); return true; } if (d !== m.turns[m.k].ans) { load('overloaded'); return true; }
          m.k++; m.round++; m.over = Math.max(0, m.over - 0.08); m.sip = true; m.sc = rf(r, 1.0, 1.6) * (m.calm ? 0.8 : 1); if (m.k >= 3) { m.ph = 'band'; m.sip = false; } }
        return true;
      }
      if (ENTER(code)) { if (m.ph !== 'band') return true; if (m.lines[m.li] === m.name) m.win(); else { m.fault('wrong name'); } return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.ph === 'talk') { m.sc -= dt; if (m.sc <= 0) { m.sip = !m.sip; m.sc = m.sip ? rf(r, 1.0, 1.6) : rf(r, 1.6, 2.4); } }
      if (m.ph === 'band') { m.lc += dt; if (m.lc >= cyc) { m.lc = 0; m.li = (m.li + 1) % m.lines.length; } }
    };
    m.hint = () => m.ph === 'need' ? [['Digit' + m.need[1], true]] : m.ph === 'talk' ? (!m.sip && m.sc > 0.2 ? [['Digit' + m.turns[m.k].ans, true]] : []) : (m.lines[m.li] === m.name && m.lc > 0.1 && m.lc < cyc - 0.1 ? [['Enter', true]] : []);
    m.bad = () => m.ph === 'need' ? 'Digit' + (m.need[1] % 3 + 1) : m.ph === 'talk' ? 'Digit' + (m.turns[m.k].ans % 3 + 1) : 'Enter';
    m.view = () => ({ name: m.name, need: m.need[1], lines: m.lines, turns: m.turns.map(t => t.o.map(o => o[0].slice(0, 10)).join('|')) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Enter', 'Match band']];
    m.draw = (c, W, H, P) => {
      txt(c, m.name, 14, 18, { size: 13, col: COL.gold }); txt(c, 'Overload', 230, 14, { size: 9, col: COL.dim }); bar(c, 230, 18, 156, 10, m.over, { col: m.over > 0.6 ? P.bad : COL.warn });
      if (m.ph === 'need') { txt(c, m.need[0], 14, 52, { size: 13, col: COL.pale }); ['1 cup of water', '2 blanket', '3 call to family'].forEach((s, j) => txt(c, s, 14 + j * 128, 100, { size: 12, col: COL.gold })); return; }
      if (m.ph === 'talk') { const t = m.turns[m.k]; txt(c, m.sip ? 'SIPPING… wait' : 'LOOKING at you', 386, 44, { size: 11, align: 'right', col: m.sip ? COL.warn : P.good }); txt(c, `next step ${m.k + 1} / 3`, 14, 44, { size: 10, col: COL.dim });
        t.o.forEach(([s], j) => { box(c, 10, 54 + j * 36, 380, 32, 'rgba(255,255,255,.05)', COL.lav); txt(c, String(j + 1), 20, 75 + j * 36, { size: 13, col: COL.gold }); txt(c, s.length > 62 ? s.slice(0, 60) + '…' : s, 36, 75 + j * 36, { size: 10 }); }); return; }
      box(c, 14, 40, 160, 40, 'rgba(255,255,255,.05)', COL.peri); txt(c, 'WRISTBAND', 22, 54, { size: 9, col: COL.dim }); txt(c, m.name, 22, 72, { size: 13, col: COL.gold });
      txt(c, 'ARRIVALS SHEET', 200, 54, { size: 9, col: COL.dim }); m.lines.forEach((n, j) => txt(c, `${j === m.li ? '▶ ' : '   '}${n}`, 200, 72 + j * 18, { size: 12, col: j === m.li ? COL.ink : COL.dim }));
    };
    return m;
  },
});
