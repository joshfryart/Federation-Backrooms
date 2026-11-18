// Chief engineer: keep spare cells ready for sickbay (medical relief). Press each cell into the tester (hold E) and keep it there under the
// test load until the timer runs out: a sound cell barely moves, a tired cell reads full at first and then sags fast, a flat one starts under
// the mark. Then let go and send it on with a flick of the view: left to the sickbay shelf (sound only), right onto the charging rack. A low or
// fast-draining cell back on the shelf is a dead cell in the next power cut.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Keep spare cells ready for sickbay', type: 'task:medical_relief' },
  title: 'Cell load test and sort', dept: 'engineering', host: 'room', siteName: 'Cell', verb: 'Test',
  how: 'Hold E to press the cell into the tester and keep it under load until the timer fills. Watch how far the charge falls. Then let go and flick your view left to shelve a sound cell, or right to put it on the charging rack.',
  keys: ['E hold: load test', 'flick view left: shelf', 'flick view right: charging rack'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'load-test and sort', input: 'e-hold+swing', win: 'every spare cell load-tested for the full timer, sound cells shelved for sickbay and low or fast-draining ones put on charge',
    fail: 'shelving a cell that started under the mark or sagged under load, racking a sound cell, or sorting before the load test has run',
    rule: 'Hold E: the charge shows, then drains under the test load while the timer fills. Under the mark at the end, or a big fall, means the rack. Release, then flick the view left (shelf) or right (rack).' },
  rush: 'Read each cell\'s charge at a glance and put the full-looking ones back.',
  captions: { 'dead cell shelved': 'cell clicks onto the shelf', 'good cell racked': 'rack lamp blinks', untested: 'tester beeps: no result' },
  says: { 'dead cell shelved': 'That cell sagged under load (or started low): it goes on the charging rack, not the shelf.', 'good cell racked': 'That one held its charge under load — it belongs on the shelf.', untested: 'Run the full load test before you sort it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cell 1', prop: 'locker' }, { name: 'Cell 2', prop: 'shelving' }, { name: 'Cell 3', prop: 'workbench' }, { name: 'Cell 4', prop: 'shelving' }]), r = m.rnd;
    const test = m.calm ? 1.2 : 1.6, mark = 0.7, kinds = shuffle(r, ['good', 'tired', 'flat', 'good']);
    m.cells = m.sites.map((_, i) => { const k = kinds[i]; return { k, c0: k === 'flat' ? rf(r, 0.45, 0.65) : rf(r, 0.88, 0.98), drain: k === 'tired' ? rf(r, 0.22, 0.3) : rf(r, 0.01, 0.04), tt: 0, c: 0, tested: false }; });
    const sound = (u) => u.k === 'good'; m.flick = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp), rel = m.released(inp); if (!st) return; const i = m.next, u = m.cells[i], sw = inp.swing || 0;
      if (inp.hold) { if (!u.tested) { if (u.tt === 0) u.c = u.c0; u.tt += dt; u.c = clamp(u.c - u.drain * dt); if (u.tt >= test) u.tested = true; } }
      else if (rel && !u.tested) u.tt = 0;
      if (!inp.hold && Math.abs(sw) > 1.4 && !m.flick) { m.flick = true;
        if (!u.tested) m.fault('untested');
        else if (sw > 0) { if (sound(u)) m.finish(i); else m.fault('dead cell shelved'); }
        else { if (!sound(u)) m.finish(i); else m.fault('good cell racked'); } }
      if (Math.abs(sw) < 0.3) m.flick = false;
      if (!st.done) st.prog = clamp(u.tt / test * 0.8, 0, 0.85);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.cells[i]; if (!u.tested) return { at: i, hold: true, swing: 0 };
      const toShelf = u.c >= mark && u.c0 - u.c < 0.15; return { at: i, hold: false, swing: f % 4 === 0 ? (toShelf ? 1.8 : -1.8) : 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: false, swing: f % 4 === 0 ? 1.8 : 0 });
    m.view = () => ({ cells: m.cells.map(u => [u.k, +u.c0.toFixed(2)]) });
    m.panel = (i) => { const u = m.cells[i]; return u ? { label: u.tested ? `Fell ${Math.round((u.c0 - u.c) * 100)} % under load` : `Load test ${u.tt.toFixed(1)} / ${test} s`, value: u.tt > 0 ? `charge ${Math.round(u.c * 100)} % (mark ${mark * 100})` : 'not in tester', bar: u.c, band: [mark, 1] } : null; };
    m.prompt = (i) => { const u = m.cells[i]; return !u ? '' : u.tested ? 'Let go, then flick your view left for the shelf or right for the charging rack' : 'Hold [E] to press the cell into the tester; keep it under load until the timer fills'; };
    return m;
  },
});
