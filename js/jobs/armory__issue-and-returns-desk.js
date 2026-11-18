// Armory: the issue and returns desk. Requesters come to the desk one at a time. For an issue, the badge reader shows who they are and the
// request slip shows who signed it: hand over (Enter) only if the signature is on the Deputy's standing list. Otherwise refuse (Space), and keep
// refusing: the requester pushes back once or twice, and each push needs another Space within a few seconds. For a return, turn the zapper under
// the inspection lamp (← →) until all six faces have been seen, then code it 1 clean (back to the rack) or 2 fouled (to the workbench).
import { define, machine, DIG, ARROW, SPACE, ENTER, ri, pick, shuffle, txt, box, lamp, COL } from './kit.js';

const LIST = ['Dep. Rao', 'Lt Okafor', 'Cmdr Vale', 'Lt Imre'], ROGUE = ['Ens. Pike', 'PO Dacre', 'Lt Sallow'], CREW = ['Ens. Moru', 'PO Hesk', 'Lt Garza', 'Ens. Tull', 'PO Lind', 'Ens. Abeni'];
const PUSH = ['"It\'s urgent, come on."', '"The Deputy said it\'s fine."', '"I\'ll get it signed after."', '"You know me, just hand it over."'];
export default define({
  job: { billet: 'armory', label: 'Issue and returns desk', type: 'loop' },
  title: 'Desk refusals and lamp turn-over', dept: 'security', host: 'console', tool: 'Badge reader and inspection lamp',
  how: 'Issue (Enter) only when the slip is signed by someone on the standing list; otherwise refuse with Space and refuse again every time they push. Returns: turn the zapper (← →) through all six faces, then 1 clean or 2 fouled.',
  keys: ['Enter issue', 'Space refuse', '← → turn under lamp', '1 clean · 2 fouled'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'refuse and hold', input: 'arrows+digits+space+enter', win: 'every requester served: authorised slips issued, unsigned or unlisted ones refused through every push, and every return turned through all faces and coded',
    fail: 'issuing without authority, giving way when the requester pushes, refusing a valid slip, or coding a return before seeing every face',
    rule: 'Match the slip signature against the standing list: Enter issues, Space refuses, and each push back needs another Space. Returns: ← → shows each face under the lamp; after all six, 1 clean or 2 fouled.' },
  rush: 'Handed the gear across on a nod and dropped the returns in the rack.',
  captions: { 'no authority': 'Deputy\'s voice: who signed that?', caved: 'requester grins', 'refused valid': 'requester sighs', 'not inspected': 'lamp clicks off', 'wrong code': 'workbench bell' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, crew = shuffle(r, CREW), pushWin = m.calm ? 4.5 : 3;
    const types = shuffle(r, ['ok', 'blank', 'rogue', 'ret', 'ret']);
    m.q = types.map((ty, i) => ty === 'ret' ? { ret: true, who: crew[i], foul: r() < 0.55 ? ri(r, 1, 5) : -1, face: 0, seen: new Set([0]) }
      : { ret: false, who: crew[i], sig: ty === 'ok' ? pick(r, LIST) : ty === 'rogue' ? pick(r, ROGUE) : '', ok: ty === 'ok', pushes: ty === 'ok' ? 0 : ri(r, 1, 2), push: 0, wait: -1, gap: 0, refused: false });
    m.i = 0; m.gap = 0.4; m.rounds = 5; m.round = 0; m.say = '';
    const C = () => m.q[m.i];
    const done = () => { m.i++; m.round++; m.gap = 0.5; m.say = ''; if (m.i >= m.q.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const c = C(), d = DIG(code), a = ARROW(code);
      if (!(SPACE(code) || ENTER(code) || d || a)) return false; if (!c || m.gap > 0) return true;
      if (c.ret) {
        if (a === 'L' || a === 'R') { c.face = (c.face + (a === 'R' ? 1 : 5)) % 6; c.seen.add(c.face); return true; }
        if (d === 1 || d === 2) { if (c.seen.size < 6) { m.fault('not inspected'); return true; } if ((d === 2) !== (c.foul >= 0)) { m.fault('wrong code'); return true; } done(); }
        return true;
      }
      if (ENTER(code)) { if (!c.ok) { m.fault(c.refused ? 'caved' : 'no authority'); if (c.refused) c.wait = 0; return true; } done(); return true; }
      if (SPACE(code)) {
        if (c.ok) { m.fault('refused valid'); return true; }
        if (!c.refused) { c.refused = true; c.gap = 0.7; return true; }
        if (c.wait >= 0) { c.push++; c.wait = -1; m.say = '"Fine."'; if (c.push >= c.pushes) done(); else c.gap = 0.7; }
        return true;
      }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; return; } const c = C(); if (!c || c.ret || !c.refused) return;
      if (c.gap > 0) { c.gap -= dt; if (c.gap <= 0) { c.wait = 0; m.say = PUSH[(c.push + m.i) % PUSH.length]; } return; }
      if (c.wait >= 0) { c.wait += dt; if (c.wait > pushWin) { m.fault('caved'); c.wait = 0; } }
    };
    m.hint = () => {
      const c = C(); if (!c || m.gap > 0) return [];
      if (c.ret) { if (c.seen.size < 6) return [['ArrowRight', true]]; return [[c.foul >= 0 ? 'Digit2' : 'Digit1', true]]; }
      if (c.ok) return [['Enter', true]]; if (!c.refused || c.wait >= 0) return [['Space', true]]; return [];
    };
    m.bad = () => { const c = C(); return c?.ret ? 'Digit1' : 'Enter'; };
    m.view = () => ({ q: m.q.map(c => c.ret ? ['ret', c.foul] : [c.sig, c.pushes]) });
    m.buttons = () => [['Enter', 'Issue'], ['Space', 'Refuse'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Digit1', '1 Clean'], ['Digit2', '2 Fouled']];
    m.draw = (c, W, H, P) => {
      const q = C(); txt(c, `REQUESTER ${Math.min(m.i + 1, 5)} / 5`, 14, 20, { size: 11, col: COL.peri });
      txt(c, 'STANDING LIST', 290, 20, { size: 10, col: COL.dim }); LIST.forEach((n, k) => txt(c, n, 290, 38 + k * 16, { size: 12, col: COL.pale }));
      if (!q || m.gap > 0) { txt(c, 'next…', 14, 70, { size: 14, col: COL.dim }); return; }
      if (q.ret) {
        txt(c, `RETURN from ${q.who}`, 14, 42, { size: 13 }); box(c, 30, 60, 220, 60, '#14122a', COL.gold, 8);
        txt(c, `FACE ${q.face + 1} / 6`, 40, 80, { size: 11, col: COL.dim });
        if (q.face === q.foul) { lamp(c, 140, 98, 12, P.bad, 'triangle'); txt(c, 'SCORING / FOULING', 160, 102, { size: 12, col: P.bad }); } else txt(c, 'clean metal', 140, 102, { size: 12, col: COL.ink });
        for (let k = 0; k < 6; k++) lamp(c, 40 + k * 22, 140, 6, q.seen.has(k) ? COL.peri : '#333', q.seen.has(k) ? 'circle' : 'square');
        return;
      }
      txt(c, 'BADGE', 14, 44, { size: 10, col: COL.dim }); txt(c, q.who, 70, 44, { size: 14 });
      txt(c, 'SLIP SIGNED', 14, 70, { size: 10, col: COL.dim }); txt(c, q.sig || '— blank —', 100, 70, { size: 14, col: q.sig ? COL.gold : COL.warn });
      if (q.refused) txt(c, q.wait >= 0 ? m.say + '  [Space]' : 'refused…', 14, 110, { size: 13, col: q.wait >= 0 ? COL.warn : COL.dim });
      txt(c, 'Enter issue · Space refuse', 14, H - 14, { size: 10, col: COL.dim });
    };
    return m;
  },
});
