// Cartographer: back up the chart database. For each cold-store slot: Space runs the checksum tool on the source, Enter writes the backup
// and the write light burns until the copy is down (touch nothing while it burns), then the copy's checksum prints under the source. Read
// them character by character: 1 logs the backup as verified, 2 marks it failed and rewrites the slot. A corrupt copy usually differs by one
// swapped pair or one character, so it looks fine at a glance.
import { define, machine, DIG, SPACE, ENTER, ri, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

const HEX = '0123456789ABCDEF';
export default define({
  job: { billet: 'carto', label: 'Back up chart database', type: 'loop' },
  title: 'Cold-store backup checksum', dept: 'sciences', host: 'console', tool: 'Datacore console: checksum tool and cold-store slots',
  how: 'Space to checksum the source, Enter to write the backup and wait out the write light, then compare the copy checksum: 1 logs it verified, 2 fails it and rewrites.',
  keys: ['Space checksum source', 'Enter write backup', '1 log verified', '2 fail and rewrite'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'checksum and store', input: 'digits+space+enter', win: 'three cold-store slots written whose copy checksum was proven identical to the source before each one was logged',
    fail: 'logging a corrupt copy as good, scrapping a sound copy, touching the console mid-write, or logging before any checksum ran',
    rule: 'Checksum the source (Space), write it (Enter) and wait for the write light to go out. Compare the copy hash to the source: identical → 1, any difference → 2 and rewrite.' },
  rush: 'Wrote the backup, saw the light go green and logged it without reading the copy checksum.',
  captions: { 'corrupt logged': 'restore-failure klaxon (later)', 'good copy scrapped': 'slot erase hiss', 'pulled early': 'write abort buzz', 'no checksum': 'console error beep' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 3;
    const hash = () => Array.from({ length: 8 }, () => pick(r, HEX)).join('');
    const spoil = (h) => { const a = h.split(''), k = ri(r, 0, 6); if (r() < 0.5 && a[k] !== a[k + 1]) [a[k], a[k + 1]] = [a[k + 1], a[k]]; else a[k] = HEX[(HEX.indexOf(a[k]) + ri(r, 1, 15)) % 16]; return a.join(''); };
    m.slots = Array.from({ length: n }, (_, i) => { const src = hash(), bad1 = r() < 0.55, bad2 = bad1 && r() < 0.3;
      return { no: ri(r, 10, 99) + i * 100, src, copies: [bad1 ? spoil(src) : src, bad2 ? spoil(src) : src, src], tries: 0, w: rf(r, 1.0, 1.7) }; });
    m.i = 0; m.ph = 'idle'; m.timer = 0; m.rounds = n; m.round = 1;
    const sl = () => m.slots[m.i], copy = () => sl().copies[Math.min(sl().tries, 2)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), sp = SPACE(code), en = ENTER(code); if (!d && !sp && !en) return false; if (!down) return true;
      if (m.ph === 'sum' || m.ph === 'write') { if (m.ph === 'write') { m.fault('pulled early'); m.ph = 'src'; } return true; }
      if (sp) { if (m.ph === 'idle') { m.ph = 'sum'; m.timer = 0.6; } return true; }
      if (en) { if (m.ph === 'src') { m.ph = 'write'; m.timer = sl().w * (m.calm ? 1.2 : 1); } return true; }
      if (d === 1 || d === 2) {
        if (m.ph !== 'done') { m.fault('no checksum'); return true; }
        const same = copy() === sl().src;
        if (d === 1 && !same) m.fault('corrupt logged');
        else if (d === 2 && same) m.fault('good copy scrapped');
        else if (d === 2) { sl().tries++; m.ph = 'src'; }
        else { m.i++; m.ph = 'idle'; if (m.i >= n) m.win(); else m.round = m.i + 1; }
      }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.timer > 0) { m.timer -= dt; if (m.timer <= 0) m.ph = m.ph === 'sum' ? 'src' : m.ph === 'write' ? 'done' : m.ph; } };
    m.hint = () => m.ph === 'idle' ? [['Space', true]] : m.ph === 'src' ? [['Enter', true]] : m.ph === 'done' ? [[copy() === sl().src ? 'Digit1' : 'Digit2', true]] : [];
    m.bad = () => 'Digit1';
    m.view = () => ({ s: m.slots.map(s => [s.src, s.copies[0]]) });
    m.buttons = () => [['Space', 'Checksum'], ['Enter', 'Write'], ['Digit1', '1 verified'], ['Digit2', '2 rewrite']];
    m.draw = (c, W, H, P) => {
      const s = sl(); if (!s) return;
      txt(c, `COLD STORE SLOT ${s.no}`, 16, 22, { size: 12, col: COL.gold }); txt(c, `backup ${m.i + 1}/${n}${s.tries ? ` · rewrite ${s.tries}` : ''}`, 260, 22, { size: 10, col: COL.dim });
      txt(c, 'SOURCE', 16, 60, { size: 10, col: COL.dim }); txt(c, 'COPY', 16, 96, { size: 10, col: COL.dim });
      const shown = m.ph !== 'idle' && m.ph !== 'sum', cp = m.ph === 'done' ? copy() : null;
      for (let k = 0; k < 8; k++) { const x = 80 + k * 26;
        box(c, x, 42, 22, 26, COL.panel, null, 3); if (shown) txt(c, s.src[k], x + 11, 61, { size: 15, align: 'center', font: 'monospace' });
        box(c, x, 78, 22, 26, COL.panel, null, 3); if (cp) txt(c, cp[k], x + 11, 97, { size: 15, align: 'center', font: 'monospace' }); }
      const lit = m.ph === 'write'; lamp(c, 330, 80, 10, lit ? COL.warn : m.ph === 'done' ? P.good : COL.panel, lit ? 'triangle' : 'circle'); txt(c, lit ? 'WRITING' : 'write', 312, 104, { size: 9, col: COL.dim });
      if (m.ph === 'sum') bar(c, 80, 120, 200, 8, 1 - m.timer / 0.6);
      txt(c, m.ph === 'idle' ? 'Space: run the checksum on the source' : m.ph === 'sum' ? 'Checksumming…' : m.ph === 'src' ? 'Enter: write the backup to the slot' : m.ph === 'write' ? 'Write light on: hands off' : 'Compare: 1 verified · 2 fail and rewrite', 16, 150, { size: 12, col: COL.ink });
    };
    return m;
  },
});
