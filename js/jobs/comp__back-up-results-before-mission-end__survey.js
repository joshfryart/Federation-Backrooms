// Computer specialist: back up results before mission end. Space runs the backup of a results set onto its labelled cartridge; when the bar
// ends, the checksum verify reads the cartridge's hash one character at a time under the source hash. Sign the backup book (Enter) only once
// every character has matched and the OK line shows. If a character comes back different, re-run the backup (Space) at once.
import { define, machine, SPACE, ENTER, ri, pick, txt, box, bar, COL } from './kit.js';

const HEX = '0123456789ABCDEF', LEN = 8;
export default define({
  job: { billet: 'comp', label: 'Back up results before mission end', type: 'task:survey' },
  title: 'Cartridge hash read-out', dept: 'operations', host: 'console', tool: 'Cartridge reader and backup book',
  how: 'Space runs the backup. After the bar, the checksum reads the cartridge hash character by character under the source hash. Enter signs the book only after the OK line. A character that differs: press Space to run the backup again.',
  keys: ['Space run / re-run backup', 'Enter sign the backup book'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'watch the hash', input: 'space+enter', win: 'three results cartridges written and signed off only after their full hash matched the source, bad copies re-run',
    fail: 'signing off when the progress bar ends but before the checksum OK, signing a mismatched hash, or re-running a copy that was matching',
    rule: 'Compare each revealed hash character with the source above it. On the first difference press Space to re-run. When all eight match and OK shows, press Enter.' },
  rush: 'Signed the backup book the moment the progress bar hit the end.',
  captions: { unverified: 'checksum still running', 'signed bad copy': 'checksum alarm', 'needless rerun': 'drive spin-up' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cps = m.calm ? 0.42 : 0.3, blen = m.calm ? 1.6 : 1.3;
    const hash = () => Array.from({ length: LEN }, () => pick(r, HEX.split(''))).join('');
    m.sets = ['Sensor sweep', 'Probe telemetry', 'Sample assays'].map((n, i) => ({ name: `${n} · cart ${ri(r, 100, 899)}`, src: hash(), badPos: r() < 0.55 || i === 1 ? ri(r, 1, LEN - 1) : -1 }));
    m.i = 0; m.ph = 'idle'; m.pt = 0; m.k = 0; m.copy = ''; m.rounds = 3; m.round = 0;
    const S = () => m.sets[m.i];
    const start = () => { const s = S(); m.ph = 'backup'; m.pt = 0; m.k = 0; m.copy = s.badPos >= 0 ? s.src.slice(0, s.badPos) + HEX[(HEX.indexOf(s.src[s.badPos]) + ri(r, 1, 15)) % 16] + s.src.slice(s.badPos + 1) : s.src; };
    const mism = () => m.ph === 'verify' && m.k > 0 && m.copy[m.k - 1] !== S().src[m.k - 1];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) {
        if (m.ph === 'idle') { start(); return true; } if (m.ph === 'backup') return true;
        if (mism()) { S().badPos = -1; start(); m.ev('rerun'); return true; }
        m.fault('needless rerun'); start(); return true;
      }
      if (!ENTER(code)) return false;
      if (m.ph === 'ok') { m.round++; m.ev('signed'); if (m.i + 1 >= m.sets.length) { m.ph = 'done'; m.win(); } else { m.i++; m.ph = 'idle'; } return true; }
      if (m.ph === 'verify' || m.ph === 'backup') m.fault(mism() ? 'signed bad copy' : 'unverified');
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.pt += dt;
      if (m.ph === 'backup' && m.pt >= blen) { m.ph = 'verify'; m.pt = 0; }
      else if (m.ph === 'verify' && !mism() && m.pt >= cps) { m.pt = 0; m.k++; if (m.k >= LEN && !mism()) m.ph = 'ok'; }
    };
    m.hint = () => m.ph === 'idle' ? [['Space', true]] : m.ph === 'ok' ? [['Enter', true]] : mism() ? [['Space', true]] : [];
    m.bad = () => m.ph === 'idle' ? 'Space' : m.ph === 'verify' ? 'Enter' : null;
    m.view = () => ({ s: m.sets.map(s => [s.src, s.badPos]) });
    m.buttons = () => [['Space', 'Run backup'], ['Enter', 'Sign book']];
    m.draw = (c, W, H, P) => {
      const s = S(); txt(c, `${m.i + 1}/3  ${s.name}`, 14, 20, { size: 13, col: COL.gold });
      txt(c, m.ph === 'idle' ? 'Cartridge labelled · Space to run backup' : m.ph === 'backup' ? 'Backing up…' : 'Progress complete', 14, 40, { size: 11, col: COL.dim });
      bar(c, 14, 46, W - 28, 10, m.ph === 'backup' ? m.pt / blen : m.ph === 'idle' ? 0 : 1, { col: COL.peri });
      txt(c, 'SOURCE', 14, 84, { size: 10, col: COL.dim }); txt(c, 'CART', 14, 114, { size: 10, col: COL.dim });
      for (let j = 0; j < LEN; j++) {
        const x = 70 + j * 30, shown = (m.ph === 'verify' || m.ph === 'ok') && j < m.k, bad = shown && m.copy[j] !== s.src[j];
        box(c, x, 68, 24, 24, 'rgba(255,255,255,.05)', null, 4); txt(c, s.src[j], x + 12, 86, { size: 15, align: 'center', font: 'monospace' });
        box(c, x, 98, 24, 24, bad ? 'rgba(255,120,60,.25)' : 'rgba(255,255,255,.05)', bad ? P.bad : null, 4); txt(c, shown ? m.copy[j] : '·', x + 12, 116, { size: 15, align: 'center', font: 'monospace', col: bad ? P.bad : COL.ink });
      }
      txt(c, m.ph === 'ok' ? '✓ CHECKSUM OK — sign the book' : mism() ? '✗ MISMATCH — re-run the backup' : m.ph === 'verify' ? 'verifying…' : '', 14, H - 12, { size: 13, col: m.ph === 'ok' ? P.good : mism() ? P.bad : COL.dim });
    };
    return m;
  },
});
