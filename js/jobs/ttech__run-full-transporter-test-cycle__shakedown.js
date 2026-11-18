// Transporter tech: run the full transporter test cycle. On the inner ring each emitter seal's lamp pulses with the test beat; seat a seal by
// pressing it (tap E) exactly while the lamp is lit, three pulses running. A press between pulses unseats it and you start that seal over.
// Then at the console the cycle readout scrolls one line at a time. Most codes are routine, but any PL-code ending in 7 means the pattern
// lock is intermittent: tap E while that line is showing to note it. Noting a routine line, or letting a 7-code scroll past, is a fault.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Run full transporter test cycle', type: 'task:shakedown' },
  title: 'Seal beat seating and cycle readout', dept: 'operations', host: 'room', siteName: 'Step', verb: 'Run',
  how: 'At each emitter seal tap E on the lamp pulse three times running. Then at the console tap E only while a PL-code ending in 7 is on the readout.',
  keys: ['E tap on the pulse: seat the seal', 'E tap on a PL-x7 line: note it'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'seat on beat', input: 'e-tap+rhythm', win: 'three emitter seals seated on three straight lamp pulses and every intermittent-lock code noted from the cycle readout',
    fail: 'pressing a seal between pulses, noting a routine readout line, or letting a PL-x7 code scroll past',
    rule: 'Seal lamps blink on a steady beat: tap E inside the lit flash, three flashes in a row. On the readout, tap E while a line reading PL-?7 is showing and leave all other lines alone.' },
  rush: 'Skipped the seals, ran the cycle and glanced at the last readout line.',
  captions: { 'seal unseated': 'seal pops', 'false log': 'error buzz', 'missed code': 'readout beeps past' },
  says: { 'seal unseated': 'Off the beat: the seal popped back up. Tap only while the lamp is lit.', 'false log': 'That line is routine. Only PL-codes ending in 7 get noted.', 'missed code': 'A PL-x7 code scrolled past un-noted.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Emitter seal 1', prop: 'pad' }, { name: 'Emitter seal 2', prop: 'beampedestal' }, { name: 'Emitter seal 3', prop: 'buffertank' }, { name: 'Cycle readout', prop: 'console' }]), r = m.rnd;
    const PER = m.calm ? 1.0 : rf(r, 0.75, 0.9), LIT = m.calm ? 0.38 : 0.28, LINE = m.calm ? 1.5 : 1.1;
    m.seals = [0, 1, 2].map(() => ({ c: 0, clicks: 0, last: -1, off: rf(r, 0, PER) }));
    const n7 = 1 + Math.floor(r() * 2), lines = shuffle(r, [...Array(n7)].map(() => `PL-${ri(r, 0, 4)}7`).concat([...Array(6 - n7)].map(() => pick2())));
    function pick2() { const k = ri(r, 0, 2); return k === 0 ? `PL-${ri(r, 0, 4)}${[1, 2, 3, 4, 5, 6, 8, 9][ri(r, 0, 7)]}` : k === 1 ? `EM-${ri(r, 10, 97)}` : `BF-0${ri(r, 1, 9)}`; }
    m.ro = { lines: lines.map(s => ({ s, bad: /^PL-\d7$/.test(s), noted: false })), t: 0 };
    const pulse = (k) => { const x = k.c + k.off; return { n: Math.floor(x / PER), lit: (x % PER) < LIT }; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next;
      if (i < 3) { const k = m.seals[i]; k.c += dt; if (!inp.press) return; const p = pulse(k);
        if (!p.lit) { m.fault('seal unseated'); k.clicks = 0; k.last = -1; s.prog = 0; return; }
        if (p.n === k.last) return; k.clicks = k.last === p.n - 1 || k.last < 0 ? k.clicks + 1 : 1; k.last = p.n; s.prog = k.clicks / 3 * 0.9; if (k.clicks >= 3) m.finish(i); return; }
      const ro = m.ro; ro.t += dt; const li = Math.floor(ro.t / LINE), prevLi = Math.floor((ro.t - dt) / LINE);
      if (li !== prevLi && prevLi >= 0 && prevLi < 6) { const L = ro.lines[prevLi]; if (L.bad && !L.noted) m.fault('missed code'); }
      if (m.state !== 'play') return; if (li >= 6) { m.finish(i); return; } s.prog = clamp(li / 6 * 0.9);
      if (inp.press) { const L = ro.lines[li]; if (L.noted) return; if (L.bad) { L.noted = true; m.ev('noted', { code: L.s }); } else { m.fault('false log'); L.noted = true; } }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i < 3) { const k = m.seals[i], p = pulse(k), x = (k.c + k.off) % PER; return { at: i, press: x > 0.05 && x < LIT - 0.08 && p.n !== k.last }; }
      const li = Math.floor(m.ro.t / LINE), L = m.ro.lines[li]; return { at: i, press: !!(L && L.bad && !L.noted && m.ro.t - li * LINE > 0.25) }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 5 === 0 });
    m.view = () => ({ lines: m.ro.lines.map(l => l.s), off: m.seals.map(k => +k.off.toFixed(2)) });
    m.panel = (i) => { if (i < 3) { const k = m.seals[i]; if (!k) return null; const p = pulse(k); return { label: p.lit ? '● SEAL LAMP LIT' : '○ seal lamp', value: `${k.clicks} / 3 seated`, bar: k.clicks / 3 }; }
      const li = Math.floor(m.ro.t / LINE), L = m.ro.lines[Math.min(5, li)]; return { label: `Readout line ${Math.min(6, li + 1)} / 6`, value: L ? L.s + (L.noted && L.bad ? ' NOTED' : '') : '', bar: clamp(m.ro.t / (6 * LINE)) }; };
    m.prompt = (i) => i < 3 ? 'Tap [E] while the seal lamp is lit, three pulses in a row' : 'Tap [E] only while a PL-code ending in 7 is showing';
    return m;
  },
});
