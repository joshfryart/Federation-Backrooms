// Second officer: sign off the transfer log. Hold ↓ to read down the newest unsigned entry field by field (shuttle, time, cargo count,
// receiving station, transfer order). Only once every field has been read may you act: Enter types your initials and signs a sound entry;
// holding ← for a second bounces back an entry whose cargo count differs from your verified manifest, whose receiving station is blank, or
// whose order is unsigned. Signing unread, signing a bad entry or bouncing a sound one is a fault.
import { define, machine, ARROW, ENTER, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

const SH = ['Mayflower', 'Halley', 'Tasman', 'Drake', 'Cabot'];
const RX = ['Starbase 12 cargo deck', 'USS Lovell hold 2', 'Colony depot Kesh', 'Relief camp Bravo'];
const FIELDS = ['Shuttle', 'Departed', 'Cargo count', 'Receiving station', 'Transfer order'];

export default define({
  job: { billet: 'so', label: 'Sign off the transfer log', type: 'task:cargo_run' },
  title: 'Read-down transfer sign-off', dept: 'command', host: 'console', tool: 'Transfer log console and sign key',
  how: 'Hold ↓ to read every field of the entry, then Enter to initial a sound entry or hold ← to bounce one with a wrong count, no receiving station or no signed order.',
  keys: ['hold ↓ read down', 'Enter initial and sign', 'hold ← bounce back'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'read then initial', input: 'arrows-hold+enter', win: 'three transfer entries read field by field, the sound ones initialled and the faulty ones bounced back',
    fail: 'initialling before reading the cargo count, or putting your name to an entry with no receiving station or a wrong count',
    rule: 'Hold ↓ to read down the five fields. Then Enter initials the entry, or hold ← for a second to return it when a field is wrong or blank.' },
  rush: 'Typed initials on the newest entry without scrolling down to the cargo count.',
  captions: { 'signed unread': 'sign key buzz', 'signed bad entry': 'log error chime', 'bounced good': 'return tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.36 : 0.42, nBad = ri(r, 1, 2), bad = new Set(shuffle(r, [0, 1, 2]).slice(0, nBad));
    m.verified = ri(r, 18, 46);
    m.ent = [0, 1, 2].map(i => {
      const e = { sh: pick(r, SH), time: `${ri(r, 10, 22)}${pick(r, ['05', '20', '35', '50'])}`, count: m.verified, rx: pick(r, RX), order: 'signed: Capt. Ibarra', bad: bad.has(i), read: 0, back: 0 };
      if (e.bad) { const k = ri(r, 0, 2); if (k === 0) e.count = m.verified + pick(r, [-3, -2, -1, 1, 2]); else if (k === 1) e.rx = ''; else e.order = 'unsigned'; }
      return e;
    });
    m.rounds = 3; m.round = 0;
    const E = () => m.ent[m.round];
    const done = (e) => { m.round++; m.held.L = false; if (m.round >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'D' || a === 'L') { m.held[a] = down; return true; }
      if (ENTER(code) && down) { const e = E(); if (!e) return true; if (e.read < 5) { m.fault('signed unread'); return true; } if (e.bad) { m.fault('signed bad entry'); return true; } done(e); return true; }
      return a === 'U' || a === 'R';
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const e = E(); if (!e) return;
      if (m.held.D) e.read = Math.min(5, e.read + dt / rate);
      if (m.held.L) { e.back += dt; if (e.back >= 1) { e.back = 0; if (e.read < 5) m.fault('signed unread'); else if (!e.bad) m.fault('bounced good'); else { m.ev('bounce'); done(e); } } } else e.back = 0;
    };
    m.hint = () => { const e = E(); if (!e) return []; if (e.read < 5) return [['ArrowLeft', false], ['ArrowDown', true]]; return e.bad ? [['ArrowDown', false], ['ArrowLeft', true]] : [['ArrowDown', false], ['ArrowLeft', false], ['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ v: m.verified, e: m.ent.map(e => [e.sh, e.count, e.rx, e.order]) });
    m.buttons = () => [['ArrowDown', 'Read ▼ (hold)'], ['ArrowLeft', '◀ Bounce (hold)'], ['Enter', 'Initial + sign']];
    m.draw = (c, W, H, P) => {
      const e = E(); if (!e) return;
      txt(c, `TRANSFER LOG · entry ${m.round + 1} / 3 unsigned`, 10, 16, { size: 11, col: COL.gold });
      box(c, 290, 6, 102, 34, 'rgba(244,194,91,.12)', COL.gold, 6); txt(c, 'VERIFIED MANIFEST', 296, 18, { size: 8, col: COL.gold }); txt(c, `${m.verified} crates`, 296, 34, { size: 12 });
      const vals = [e.sh, e.time, `${e.count} crates`, e.rx || '(blank)', e.order];
      FIELDS.forEach((f, k) => {
        const y = 30 + k * 22, seen = e.read >= k + 1, cur = Math.floor(e.read) === k;
        box(c, 8, y, 276, 19, cur ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', cur ? COL.orange : null, 6);
        txt(c, f, 14, y + 14, { size: 10, col: COL.pale }); txt(c, seen ? vals[k] : '░░░░░░░░', 130, y + 14, { size: 11, col: seen ? COL.ink : COL.dim });
      });
      txt(c, 'read', 10, 152, { size: 9, col: COL.dim }); bar(c, 40, 144, 150, 10, e.read / 5, { col: COL.peri });
      if (m.held.L) { txt(c, 'returning…', 210, 152, { size: 9, col: COL.warn }); bar(c, 270, 144, 120, 10, e.back, { col: COL.warn }); }
      txt(c, 'Officer: ___', W - 10, 166, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
