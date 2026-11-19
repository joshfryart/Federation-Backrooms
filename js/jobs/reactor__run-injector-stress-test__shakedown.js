// Reactor specialist: run the injector stress test. With the stress lead clipped on, tap E to turn the stress dial up one setting, then hold
// at that setting through the full count while you watch the nozzle glow through the sight port. Each injector has a setting where the glow
// goes uneven; the moment it does, pull the lead (hold E). Stepping up before the count is done rushes the test; pulling on an even glow
// ends it early; missing the uneven glow cooks the injector. An injector that holds to the top setting is pulled once its count is done.
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Run injector stress test', type: 'task:shakedown' },
  title: 'Injector stress step and lead pull', dept: 'engineering', host: 'room', item: 'toolbag', siteName: 'Injector', verb: 'Stress',
  how: 'Tap E to step the stress dial up one setting, but only once the hold count for the current setting has filled. When the glow reads UNEVEN, hold E to pull the stress lead at once. At the top setting, pull the lead after the count.',
  keys: ['E tap: dial up one setting', 'E hold: pull the lead'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'step and pull', input: 'e-tap+e-hold', win: 'every injector stepped up setting by setting through full counts and its lead pulled the moment the glow went uneven',
    fail: 'stepping the dial before the count fills, pulling the lead on an even glow, or holding on through an uneven glow until the injector cooks',
    rule: 'A short tap steps the dial; a long hold pulls the lead. Tap only after the count bar fills. Watch the glow line on the panel: UNEVEN means hold E now, within about a second.' },
  rush: 'Wound every stress dial to the top in one go and noted which injectors survived.',
  captions: { rushed: 'dial clicks early', 'pulled early': 'lead unclips', cooked: 'injector shriek' },
  says: { rushed: 'Stepped up before the count was done: hold each setting through its count.', 'pulled early': 'The glow was still even: that lead came off early.', cooked: 'The glow went uneven and you kept going: pull the lead the moment it goes uneven.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Injector 1', prop: 'warpcore' }, { name: 'Injector 2', prop: 'injector_crate' }, { name: 'Injector 3', prop: 'reactorstation' }]), r = m.rnd;
    const cnt = m.calm ? 0.7 : 0.6, top = 5, win = m.calm ? 1.5 : 1.1;
    m.inj = m.sites.map(() => { const holds = r() < 0.25; return { fail: holds ? 99 : ri(r, 2, top), at: rf(r, 0.2, 0.45), set: 1, c: 0, uneven: 0, hT: 0, pulled: false, log: [] }; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, j = m.inj[i];
      const was = j.hT; j.hT = inp.hold ? j.hT + dt : 0;
      if (!j.uneven || j.uneven < win) j.c = Math.min(cnt, j.c + dt);
      if (j.set === j.fail && j.c >= j.at * cnt * 2 && !j.uneven) j.uneven = 1e-6;
      if (j.uneven) { j.uneven += dt; if (j.uneven > win) { m.fault('cooked'); m.finish(i); return; } }
      if (inp.hold && j.hT >= 0.4 && !j.pulled) {
        j.pulled = true; if (j.uneven || (j.set >= top && j.c >= cnt)) { m.ev('pulled', { site: i, set: j.set }); m.finish(i); return; } m.fault('pulled early'); j.c = 0;
      }
      if (rel) { if (j.pulled) j.pulled = false; else if (was > 0 && was < 0.3) { if (j.c < cnt || j.uneven) m.fault('rushed'); else if (j.set < top) { j.set++; j.c = 0; } } }
      s.prog = clamp((j.set - 1 + j.c / cnt) / top) * 0.95;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const j = m.inj[i];
      if (j.uneven || (j.set >= top && j.c >= cnt)) return { at: i, hold: true }; return { at: i, hold: j.c >= cnt && f % 2 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 2 === 0 });
    m.view = () => ({ inj: m.inj.map(j => [j.fail, +j.at.toFixed(3)]) });
    m.panel = (i) => { const j = m.inj[i]; if (!j) return null; return { label: `Setting ${j.set} / ${top} · glow ${j.uneven ? 'UNEVEN ▲' : 'even ●'}`, value: j.uneven ? 'pull the lead!' : j.c >= cnt ? 'count done' : 'holding count', bar: clamp(j.c / cnt), band: [0.97, 1] }; };
    m.prompt = (i) => { const j = m.inj[i]; return !j ? '' : j.uneven ? 'Glow uneven: hold [E] to pull the lead now' : j.set >= top && j.c >= cnt ? 'Top setting held: hold [E] to pull the lead' : j.c >= cnt ? 'Count done: tap [E] to step the dial up' : 'Hold the setting: wait for the count'; };
    return m;
  },
});
