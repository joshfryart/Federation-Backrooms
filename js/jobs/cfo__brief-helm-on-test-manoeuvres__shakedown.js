// CFO: brief helm on the test manoeuvres. The helmsman reads the test programme back, but his list has come out of order. Put his read-back in
// the order of the test sheet by swapping neighbouring lines (cursor ↑ / ↓, Space swaps the line under the cursor with the one below), with the
// emergency stop call on top. The helm console unlocks the tests only when you confirm a read-back that matches the sheet (Enter).
import { define, machine, SPACE, ENTER, ARROW, ri, rf, shuffle, txt, box, COL } from './kit.js';

const MAN = ['Port turn 30° at one-quarter impulse', 'Starboard turn 30° at one-quarter impulse', 'Full stop from half impulse', 'Climb 10° at one-third impulse', 'Dive 10° at one-third impulse', 'Barrel roll at one-eighth impulse', 'Reverse thrust to station-keep', 'Hard about at half impulse'];
export default define({
  job: { billet: 'cfo', label: 'Brief helm on test manoeuvres', type: 'task:shakedown' },
  title: 'Put the manoeuvre read-back in order', dept: 'flight', host: 'console', tool: 'Test sheet and helm station',
  how: 'Rearrange the helm\'s read-back into test sheet order, stop call first: move with ↑ / ↓, Space swaps the line with the one below it, Enter confirms the read-back.',
  keys: ['↑ / ↓ cursor', 'Space swap with the line below', 'Enter confirm'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'reorder read-back', input: 'arrows+space+enter', win: 'the helm read-back rearranged into exact test sheet order with the emergency stop call first, then confirmed',
    fail: 'confirming a read-back with any manoeuvre out of order or the stop call not on top',
    rule: 'Compare each read-back line with the sheet beside it. Swap neighbours (Space swaps cursor line and the next) until both columns match line for line, then Enter.' },
  rush: 'Handed the helm the sheet and told him to run it in whatever order.',
  captions: { 'out of order': 'helm runs the wrong test' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const tests = shuffle(r, MAN).slice(0, 4); m.sheet = ['STOP CALL: CFO calls "all stop"', ...tests];
    m.list = m.sheet.slice(); const nSw = ri(r, 3, 5); for (let k = 0; k < nSw; k++) { const i = ri(r, 0, 3); [m.list[i], m.list[i + 1]] = [m.list[i + 1], m.list[i]]; }
    if (m.list.every((x, i) => x === m.sheet[i])) [m.list[0], m.list[2]] = [m.list[2], m.list[0]];
    m.cur = 0; m.swaps = 0;
    const ok = () => m.list.every((x, i) => x === m.sheet[i]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') { m.cur = Math.max(0, m.cur - 1); return true; } if (a === 'D') { m.cur = Math.min(3, m.cur + 1); return true; } if (a) return true;
      if (SPACE(code)) { [m.list[m.cur], m.list[m.cur + 1]] = [m.list[m.cur + 1], m.list[m.cur]]; m.swaps++; return true; }
      if (ENTER(code)) { if (ok()) m.win(); else m.fault('out of order'); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const i = m.list.findIndex((x, k) => x !== m.sheet[k]); if (i < 0) return [['Enter', true]];
      const j = m.list.indexOf(m.sheet[i]), want = j - 1; return [[m.cur < want ? 'ArrowDown' : m.cur > want ? 'ArrowUp' : 'Space', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ s: m.sheet, l: m.list.slice() });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Swap ↓'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      txt(c, 'TEST SHEET', 14, 14, { size: 10, col: COL.dim }); txt(c, 'HELM READ-BACK', 206, 14, { size: 10, col: COL.dim });
      m.sheet.forEach((s, i) => { const y = 20 + i * 29; txt(c, `${i + 1}. ${s}`.slice(0, 34), 14, y + 16, { size: 10, col: COL.pale });
        const l = m.list[i], same = l === s, cur = i === m.cur || i === m.cur + 1; box(c, 202, y, 188, 24, COL.panel, i === m.cur ? COL.gold : cur ? 'rgba(244,194,91,.4)' : null, 4);
        txt(c, l.slice(0, 32), 208, y + 16, { size: 10, col: same ? COL.ink : COL.warn }); txt(c, same ? '=' : '≠', 190, y + 16, { size: 12, col: same ? P.good : P.bad }); });
    };
    return m;
  },
});
