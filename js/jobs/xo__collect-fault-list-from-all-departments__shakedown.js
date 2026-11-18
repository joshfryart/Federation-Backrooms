// XO: collect the fault list from all departments. Take each department's fault slip from the in-tray and call the department to read it
// back. Copy a slip that gives a location onto the master list; send back a slip that gives none. If the call turns up a fault nobody wrote
// down, write it onto the master list too before moving on. Copying without a location, or acting before the read-back, is a fault.
import { define, machine, DIG, ENTER, shuffle, pick, ri, txt, box, COL } from './kit.js';

const DEPTS = ['Engineering', 'Flight', 'Science', 'Medical', 'Operations', 'Security'];
const FAULTS = ['EPS conduit hums', 'Door sticks half open', 'Display flickers', 'Valve weeps coolant', 'Panel runs hot', 'Relay chatters', 'Fan bearing whines', 'Seal alarm trips'];
const LOCS = ['deck 4 frame 12', 'Jefferies tube 7', 'aft junction B', 'deck 9 corridor', 'bay 2 bulkhead', 'console 3', 'lab 1 hood'];
export default define({
  job: { billet: 'xo', label: 'Collect fault list from all departments', type: 'task:shakedown' },
  title: 'Fault slip read-back and copy', dept: 'command', host: 'console', tool: 'In-tray fault slips and master fault list',
  how: 'For each slip press Enter to call its department for a read-back, then 1 copy it (only with a location) or 2 send it back, and 3 writes any extra fault the call turned up.',
  keys: ['Enter call for read-back', '1 copy slip', '2 return slip', '3 write spoken fault'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'transcribe slips', input: 'digits+enter', win: 'every department slip read back, copied with its location or returned, and each fault spoken on the call written onto the master list',
    fail: 'copying a slip with no location, returning a good slip, acting before the read-back, or leaving a spoken fault off the list',
    rule: 'Enter calls the slip\'s department; wait for the read-back. Then 1 if the slip has a location, 2 if it has none. If the department mentioned another fault, 3 writes it before the next slip.' },
  rush: 'Stapled the slips together and filed them as the fault list.',
  captions: { 'no location': 'list refuses', 'not read back': 'pad tick', 'good slip returned': 'department grumbles', 'spoken fault dropped': 'chief repeats it', 'nothing said': 'pad buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 1 : 0.8, fs = shuffle(r, FAULTS), noLoc = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2))), extra = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.slips = shuffle(r, DEPTS).slice(0, 4).map((d, i) => ({ d, f: fs[i], loc: noLoc.has(i) ? '' : pick(r, LOCS), extra: extra.has(i) ? `${fs[4 + i]} at ${pick(r, LOCS)}` : '', call: 0, slip: 0, wrote: false }));
    m.i = 0; m.master = []; m.rounds = 4; m.round = 0;
    const x = () => m.slips[m.i], heard = (s) => s.call && m.t - s.call >= wait, done = (s) => s.slip && (!s.extra || s.wrote);
    const adv = () => { if (done(x())) { m.i++; m.round++; if (m.i >= m.slips.length) m.win(); } };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const s = x(), d = DIG(code);
      if (ENTER(code)) { if (!s.call) s.call = m.t; return true; } if (d < 1 || d > 3) return false;
      if (!heard(s)) { m.fault('not read back'); return true; }
      if (d === 3) { if (!s.extra) { m.fault('nothing said'); return true; } if (!s.wrote) { s.wrote = true; m.master.push(`${s.d}: ${s.extra}`); } adv(); return true; }
      if (s.slip) { if (s.extra && !s.wrote) m.fault('spoken fault dropped'); return true; }
      if (d === 1) { if (!s.loc) { m.fault('no location'); return true; } s.slip = 1; m.master.push(`${s.d}: ${s.f} at ${s.loc}`); }
      else { if (s.loc) { m.fault('good slip returned'); return true; } s.slip = 2; }
      adv(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const s = x(); if (!s) return []; if (!s.call) return [['Enter', true]]; if (!heard(s)) return []; if (!s.slip) return [[s.loc ? 'Digit1' : 'Digit2', true]]; return s.extra && !s.wrote ? [['Digit3', true]] : []; };
    m.bad = () => { const s = x(); if (!s) return null; if (!s.call) return 'Digit1'; if (!heard(s)) return null; return s.loc ? 'Digit2' : 'Digit1'; };
    m.view = () => ({ slips: m.slips.map(s => [s.d, s.f, s.loc, s.extra]) });
    m.buttons = () => [['Enter', 'Call'], ['Digit1', '1 Copy'], ['Digit2', '2 Return'], ['Digit3', '3 Write spoken']];
    m.draw = (c, W, H, P) => {
      const s = x(); if (!s) return; box(c, 8, 8, 200, 74, 'rgba(247,201,162,.12)', COL.pale, 6);
      txt(c, `SLIP ${m.i + 1}/4 · ${s.d}`, 16, 24, { size: 11, col: COL.gold }); txt(c, s.f, 16, 44, { size: 11 }); txt(c, s.loc ? `at ${s.loc}` : 'location: (blank)', 16, 62, { size: 11, col: s.loc ? COL.ink : COL.warn });
      if (s.slip) txt(c, s.slip === 1 ? '✓ copied' : '↩ returned', 16, 78, { size: 10, col: P.good });
      box(c, 216, 8, W - 224, 74, 'rgba(255,255,255,.05)', COL.peri, 6);
      txt(c, !s.call ? 'Not called yet (Enter)' : !heard(s) ? 'Calling…' : `"${s.f}, yes."`, 224, 28, { size: 10, col: COL.pale });
      if (heard(s)) txt(c, s.extra ? `"Also: ${s.extra}."` : '"That is all."', 224, 46, { size: 10, col: s.extra ? COL.warn : COL.pale });
      if (heard(s) && s.extra) txt(c, s.wrote ? '✓ written' : 'not on any slip', 224, 66, { size: 10, col: s.wrote ? P.good : COL.warn });
      txt(c, 'MASTER LIST', 14, 100, { size: 10, col: COL.gold }); m.master.slice(-4).forEach((l, i) => txt(c, '• ' + l, 14, 114 + i * 13, { size: 9 }));
    };
    return m;
  },
});
