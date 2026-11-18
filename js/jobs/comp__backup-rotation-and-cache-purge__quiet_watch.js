// Computer specialist: backup rotation and cache purge. First the rotated cartridge sits in the reader: hold E without letting go until the
// checksum reads OK. Only then go to the purge screen and pick off the stale cache folders by looking at each and tapping E (a live folder must
// never be picked). Last, look along the rack and tap the slot marked with today's date to put the verified cartridge away.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const ANG = [0.4, 0.2, 0, -0.2, -0.4], DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
export default define({
  job: { billet: 'comp', label: 'Backup rotation and cache purge', type: 'task:quiet_watch' },
  title: 'Verify, purge, rack the cartridge', dept: 'operations', host: 'room', siteName: 'Station', verb: 'Rotate',
  how: 'Hold E at the reader until the checksum says OK. At the purge screen look at each STALE folder and tap E to pick it, never a live one. At the rack, look at today\'s slot and tap E.',
  keys: ['E hold: run checksum', 'look + E tap: pick a folder / slot'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'verify then cull', input: 'e-hold+e-tap+look', win: 'cartridge checksum held to OK, only the stale cache folders picked for purge, and the cartridge racked in today\'s dated slot',
    fail: 'letting go of the reader before the checksum OK, picking a live cache folder, or racking into another day\'s slot',
    rule: 'Reader: keep E held until OK. Purge screen and rack: turn your view onto the row named on the panel and tap E; anything else picked is a fault.' },
  rush: 'Purged the cache while the snapshot was still verifying.',
  captions: { 'pulled mid-verify': 'reader whine stops', 'purged live data': 'data loss alarm', 'wrong day slot': 'rack slot buzz' },
  says: { 'pulled mid-verify': 'You let go before the checksum OK — the verify restarted.', 'purged live data': 'That folder was live cache, not stale.', 'wrong day slot': 'Wrong slot: it goes in today\'s dated slot.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cartridge reader', prop: 'console' }, { name: 'Cache purge screen', prop: 'opsstation' }, { name: 'Backup rack slots', prop: 'servers' }]), r = m.rnd;
    const vlen = m.calm ? 2.2 : 2.8, tol = m.calm ? 0.09 : 0.07, stale = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 2, 3)));
    m.folders = ANG.map((a, i) => ({ name: `cache/${['scan', 'nav', 'sick', 'eng', 'comm'][i]}_${ri(r, 10, 99)}`, stale: stale.has(i), picked: false }));
    m.today = ri(r, 0, 4); m.vp = 0; m.freed = 0;
    const aimed = (look) => { const k = ANG.findIndex(a => Math.abs((look || 0) - a) < tol); return k; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) {
        if (inp.hold) { m.vp += dt / vlen; if (m.vp >= 1) { m.finish(0); return; } }
        else if (rel && m.vp > 0.05) { m.fault('pulled mid-verify'); m.vp = 0; }
        s.prog = clamp(m.vp, 0, 0.95); return;
      }
      if (!inp.press) return; const k = aimed(inp.look); if (k < 0) return;
      if (i === 1) {
        const f = m.folders[k]; if (f.picked) return; if (!f.stale) { m.fault('purged live data'); return; }
        f.picked = true; m.freed += ri(r, 40, 120); const left = m.folders.filter(x => x.stale && !x.picked).length; s.prog = 1 - left / stale.size * 0.95; if (!left) m.finish(1);
      } else { if (k === m.today) m.finish(2); else m.fault('wrong day slot'); }
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: true };
      const k = i === 1 ? m.folders.findIndex(x => x.stale && !x.picked) : m.today; return { at: i, look: ANG[k], press: f % 4 === 0 };
    };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 16 < 8, look: ANG[m.folders.findIndex(x => !x.stale)], press: f % 16 === 0 });
    m.view = () => ({ st: [...stale].sort(), d: m.today });
    m.panel = (i) => {
      if (i === 0) return { label: m.vp >= 1 ? 'Checksum OK' : 'Checksum verify', value: `${Math.round(m.vp * 100)} %`, bar: m.vp };
      const lines = i === 1 ? m.folders.map((f, k) => `${k === 0 ? '◀' : ''}${f.picked ? '✓' : f.stale ? 'STALE' : 'live'}`).join(' · ') : DAYS.map((d, k) => k === m.today ? `[${d}]` : d).join(' ');
      return { label: i === 1 ? `Folders left→right · freed ${m.freed} GB` : `Rack slots left→right · today ${DAYS[m.today]}`, value: lines, bar: i === 1 ? m.sites[1].prog : 0 };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] until the checksum reads OK — do not let go' : i === 1 ? 'Look at each STALE folder and tap [E]; leave live ones alone' : `Look at the ${DAYS[m.today]} slot and tap [E]`;
    return m;
  },
});
