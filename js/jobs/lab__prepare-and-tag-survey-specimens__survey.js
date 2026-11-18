// Lab technician, survey: prepare and tag survey specimens. At each cold-box tray four look-alike containers sit side by side, their IDs a
// digit or a swap apart. The panel shows the ID the bridge list wants and the ID of the container under your eye. Look along the row, settle
// on the matching handle and hold E to tie the tag on. Tying it to a near-miss container breaks the chain of custody; dithering with the lid
// open lets the tray warm past its stated temperature.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const POS = [-0.38, -0.13, 0.13, 0.38];
const near = (r, id) => { const d = id.split(''), k = ri(r, 0, d.length - 2); if (r() < 0.5) [d[k], d[k + 1]] = [d[k + 1], d[k]]; else d[k] = String((+d[k] + ri(r, 1, 8)) % 10); const s = d.join(''); return s === id ? near(r, id) : s; };
export default define({
  job: { billet: 'lab', label: 'Prepare and tag survey specimens', type: 'task:survey' },
  title: 'Tie the tag to the twin that matches', dept: 'sciences', host: 'room', siteName: 'Tray', verb: 'Tag',
  how: 'At each tray look along the row of containers: the panel reads the ID under your eye. Find the one matching the list and hold E on it to tie the tag. Do not dawdle: the open tray warms.',
  keys: ['look along the row', 'E hold: tie the tag'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'tie the tag', input: 'e-hold+look', win: 'each specimen tag tied to the one container in the row whose ID matches the bridge list, before its tray warms',
    fail: 'tying a tag onto a look-alike container one digit off, or leaving the tray open until it warms',
    rule: 'Turn your view along the row; the panel shows each container ID as you face it. Compare it digit by digit with the list ID, then hold E on the match for a second.' },
  rush: 'Wrote the tags in a batch and tied them on in the order they came out of the box.',
  captions: { 'swapped tag': 'custody alarm', warmed: 'cold-box alarm' },
  says: { 'swapped tag': 'That container\'s ID does not match the list: tag torn off.', warmed: 'The tray warmed past its temperature. Close it and start again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cold box tray A', prop: 'samplefridge' }, { name: 'Specimen tank tray', prop: 'specimen_tank' }, { name: 'Cold box tray B', prop: 'samplefridge' }]), r = m.rnd;
    const tieT = m.calm ? 0.8 : 1.0, warm = m.calm ? 13 : 9;
    m.trays = m.sites.map(() => { const id = String(ri(r, 1000, 9999)), ids = shuffle(r, [id, near(r, id), near(r, id), near(r, id)]); return { id, ids, ok: ids.indexOf(id), tie: 0, open: 0 }; });
    const under = (look) => { const k = POS.findIndex(p => Math.abs(p - look) < 0.1); return k; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, t = m.trays[i], k = under(inp.look || 0); m.eye = k;
      t.open += dt; if (t.open > warm) { m.fault('warmed'); t.open = 0; t.tie = 0; }
      if (inp.hold && k >= 0) { t.tie += dt; if (t.tie >= tieT) { if (k === t.ok) { m.finish(i); return; } m.fault('swapped tag'); t.tie = 0; } } else t.tie = 0;
      s.prog = s.done ? 1 : clamp(t.tie / tieT * 0.9, 0, 0.9);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const t = m.trays[i]; return { at: i, look: POS[t.ok], hold: f > 0 && t.open > 0.4 }; };
    m.bad = () => { const i = m.next, t = m.trays[i]; return { at: i, look: POS[(t.ok + 1) % 4], hold: true }; };
    m.view = () => ({ t: m.trays.map(t => t.ids) });
    m.panel = (i) => { const t = m.trays[i]; if (!t) return null; const k = i === m.next ? m.eye : -1; return { label: `List ${t.id}`, value: k >= 0 ? `facing ${t.ids[k]}` : 'face a container', bar: clamp(t.open / warm), band: [0, 0.7] }; };
    m.prompt = (i) => { const t = m.trays[i]; return t ? `Find container ${t.id} in the row and hold [E] on it to tie the tag` : ''; };
    return m;
  },
});
