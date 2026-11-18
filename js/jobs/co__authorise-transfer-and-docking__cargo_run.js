// Captain: authorise transfer and docking. First key the berth the traffic board actually assigns (its number; the request may quote a
// stale one). Then the helm reads the clearance code back one character at a time: the moment a character is wrong, say "negative" (Space)
// and the helm starts again. Authorise (Enter) only after a complete, exact readback. Two docking requests.
import { define, machine, DIG, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const CH = 'ABCDEFGHKMNPQRTVWXY3456789';
const STN = ['Starbase 12', 'Kessik Yard', 'Rigel Depot', 'Vega Hub', 'Tarsas Relay'];

export default define({
  job: { billet: 'co', label: 'Authorise transfer and docking', type: 'task:cargo_run' },
  title: 'Clearance code readback catch', dept: 'command', host: 'console', tool: 'Docking request screen and authorise key',
  how: 'Key the berth the traffic board shows, then listen to the helm read the clearance code back; stop them at the first wrong character, and authorise only an exact readback.',
  keys: ['1-9 berth', 'Space "negative, say again"', 'Enter authorise'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'catch the readback', input: 'digits+space+enter', win: 'both dockings authorised on the board berth after an exact character-for-character readback of the clearance code',
    fail: 'keying the stale berth from the request, letting a misread character stand, interrupting a correct readback, or authorising early',
    rule: 'Press the berth digit from the traffic board. As the helm reads the code back, compare each new character with the code: Space as soon as one differs, otherwise wait. Enter when the full readback matches.' },
  rush: 'Pressed authorise as soon as the helm started talking.',
  captions: { 'wrong bay': 'traffic control objects', 'misread code': 'station rejects clearance', 'needless repeat': 'helm: "as read, sir?"', 'authorised early': 'authorise key buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, step = m.calm ? 0.7 : 0.5, late = m.calm ? 2.0 : 1.5, errs = shuffle(r, [true, r() < 0.6]);
    m.reqs = errs.map(err => {
      const code = Array.from({ length: 6 }, () => pick(r, CH)), at = ri(r, 1, 5); let wrong = pick(r, CH); while (wrong === code[at]) wrong = pick(r, CH);
      const board = ri(r, 1, 9), stale = r() < 0.5; let req = board; if (stale) while (req === board) req = ri(r, 1, 9);
      return { code, err, at, wrong, board, req, stn: pick(r, STN) };
    });
    m.ri = 0; m.phase = 'berth'; m.rb0 = 0; m.take = 0; m.rounds = 2; m.round = 0;
    const Q = () => m.reqs[m.ri], n = () => Math.min(6, Math.floor((m.t - m.rb0) / step)), dirty = () => Q().err && m.take === 0;
    const ch = (i) => dirty() && i === Q().at ? Q().wrong : Q().code[i], wrongShown = () => dirty() && n() > Q().at;
    const restart = () => { m.take++; m.rb0 = m.t; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d) { if (m.phase !== 'berth') return true; if (d !== Q().board) { m.fault('wrong bay'); return true; } m.phase = 'rb'; m.rb0 = m.t; m.take = 0; return true; }
      if (SPACE(code)) { if (m.phase !== 'rb') return true; if (wrongShown()) { m.ev('negative'); restart(); } else m.fault('needless repeat'); return true; }
      if (ENTER(code)) {
        if (m.phase !== 'rb' || n() < 6) { m.fault('authorised early'); return true; } if (wrongShown()) { m.fault('misread code'); restart(); return true; }
        m.round++; m.ri++; m.phase = 'berth'; if (m.ri >= 2) m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'rb' && wrongShown() && m.t - m.rb0 - (Q().at + 1) * step > late) { m.fault('misread code'); restart(); } };
    m.hint = () => { if (m.ri >= 2) return []; if (m.phase === 'berth') return [['Digit' + Q().board, true]]; if (wrongShown()) return [['Space', true]]; return n() >= 6 ? [['Enter', true]] : []; };
    m.bad = () => 'Enter';
    m.view = () => ({ reqs: m.reqs.map(q => [q.code.join(''), q.err, q.at, q.board, q.req]) });
    m.buttons = () => [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => ['Digit' + k, String(k)]), ['Space', 'Negative'], ['Enter', 'Authorise']];
    m.draw = (c, W, H, P) => {
      if (m.ri >= 2) return; const q = Q();
      txt(c, `DOCKING REQUEST ${m.ri + 1} / 2 · ${q.stn}`, 10, 16, { size: 11, col: COL.gold });
      txt(c, `request quotes berth ${q.req}`, 10, 36, { size: 11 }); txt(c, `traffic board: berth ${q.board}`, 200, 36, { size: 11, col: COL.pale });
      txt(c, 'CLEARANCE CODE', 10, 64, { size: 9, col: COL.dim }); txt(c, 'HELM READBACK', 10, 112, { size: 9, col: COL.dim });
      for (let i = 0; i < 6; i++) {
        box(c, 10 + i * 34, 70, 30, 28, 'rgba(255,255,255,.06)', COL.peri, 4); txt(c, q.code[i], 25 + i * 34, 90, { size: 16, align: 'center' });
        const shown = m.phase === 'rb' && i < n(), c2 = shown ? ch(i) : '·';
        box(c, 10 + i * 34, 118, 30, 28, 'rgba(255,255,255,.04)', null, 4); txt(c, c2, 25 + i * 34, 138, { size: 16, align: 'center', col: shown ? COL.ink : COL.dim });
      }
      txt(c, m.phase === 'berth' ? 'key the board berth' : n() < 6 ? 'helm reading back…' : 'readback complete', 230, 100, { size: 11, col: COL.pale });
      if (m.take > 0) txt(c, `say-again ×${m.take}`, 230, 120, { size: 10, col: COL.dim });
    };
    return m;
  },
});
