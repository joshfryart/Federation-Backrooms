// Guard: station for the intruder drill at the transporter door. Drill figures shove at the door in surges, each one announced by a rumble.
// Hold E to brace the door through a surge. Bracing tires your grip, and the grip only comes back while you let go, so ease off in the lulls
// and brace again as the next rumble builds. A surge with nobody bracing pushes the door open; a grip worn out mid-surge slips. When the
// lockdown tone sounds, hold E on the door panel until the light shows red, then let go.
import { define, machine, room, rf } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Station for intruder drill', type: 'task:shakedown' },
  title: 'Door brace against drill surges', dept: 'security', host: 'room', siteName: 'Door', verb: 'Brace',
  how: 'Hold E to brace the transporter door when a surge hits (the rumble warns you). Let go in the lulls so your grip recovers. At the lockdown tone, hold E on the panel until the light is red.',
  keys: ['E hold: brace / seal', 'let go in the lulls'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'brace on surges', input: 'e-hold',
    win: 'every drill surge against the transporter door braced with grip to spare, grip rested in each lull, and the lockdown light brought to red',
    fail: 'an unbraced surge forcing the door, bracing through the lulls until the grip gives mid-surge, or leaving the panel before it shows red',
    rule: 'Rumble = surge coming: hold E as it builds and through the shove. Lull: release so the grip meter refills. Panel: hold E until RED, then release.' },
  rush: 'Leaned on the door the whole drill and waved the stragglers through.',
  captions: { forced: 'door bangs open', slipped: 'boots skid on the deck', unsealed: 'panel buzzes amber', rumble: 'crowd rumble builds' },
  says: { forced: 'The surge hit with nobody on the door. Brace as the rumble builds.', slipped: 'Your grip gave out. Rest it in the lulls.', unsealed: 'Hold until the light shows red.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Transporter door', prop: 'airlock_doors' }, { name: 'Door lockdown panel', prop: 'console' }]), r = m.rnd;
    const drain = m.calm ? 0.28 : 0.36, rec = m.calm ? 1.1 : 0.9, warn = m.calm ? 1.0 : 0.8;
    m.surges = []; let t = rf(r, 0.6, 1.2); for (let k = 0; k < 4; k++) { const len = rf(r, 1.1, 1.6); m.surges.push({ a: +(t + warn).toFixed(2), b: +(t + warn + len).toFixed(2), hit: false }); t += warn + len + rf(r, 1.1, 1.8); }
    m.g = 1; m.lt = 0; m.seal = 0;
    const phase = () => { for (const s of m.surges) { if (m.lt >= s.a && m.lt < s.b) return ['surge', s]; if (m.lt >= s.a - warn && m.lt < s.a) return ['warn', s]; } return ['lull', null]; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp), rel = m.released(inp); if (!st) return; const i = m.next;
      if (i === 1) { if (inp.hold) m.seal += dt; if (rel) { if (m.seal >= 1.0) { m.finish(1); return; } m.fault('unsealed'); m.seal = 0; } st.prog = Math.min(0.9, m.seal); return; }
      m.lt += dt; const [ph, s] = phase();
      m.g = inp.hold ? Math.max(0, m.g - drain * dt) : Math.min(1, m.g + rec * dt);
      if (ph === 'surge' && !s.hit) { if (!inp.hold && m.lt - s.a > 0.15) { s.hit = true; m.fault('forced'); } else if (m.g <= 0) { s.hit = true; m.fault('slipped'); m.g = 0.35; } }
      const last = m.surges[3]; if (m.lt >= last.b) { m.finish(0); return; }
      st.prog = Math.min(0.9, m.lt / last.b);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 1) return { at: 1, hold: m.seal < 1.0 };
      const [ph, s] = phase(); return { at: 0, hold: ph === 'surge' || (ph === 'warn' && s.a - m.lt < 0.25) }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ surges: m.surges.map(s => [s.a, s.b]) });
    m.panel = (i) => { if (i === 1) return { label: m.seal >= 1 ? 'Lockdown RED ■' : 'Lockdown sealing', value: m.seal >= 1 ? 'let go' : `${Math.round(Math.min(1, m.seal) * 100)} %`, bar: Math.min(1, m.seal), band: [0.98, 1] };
      const [ph] = phase(); return { label: ph === 'surge' ? 'SURGE ▲ brace!' : ph === 'warn' ? 'Rumble building…' : 'Lull: rest grip', value: `grip ${Math.round(m.g * 100)} %`, bar: m.g }; };
    m.prompt = (i) => (i === 1 ? 'Hold [E] on the panel until the lockdown light is red, then let go' : 'Hold [E] to brace when a surge hits; let go in the lulls to rest your grip');
    return m;
  },
});
