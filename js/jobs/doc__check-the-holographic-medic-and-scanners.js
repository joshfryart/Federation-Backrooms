// Doctor: check the holographic medic and the scanners. Each scanner has the calibration block on its plate and reads off the reference value.
// The gain dial moves in detent clicks: aim at the left of the dial and tap E to click it down, at the right to click it up. The screen lags
// behind each click, so wait for it to settle before clicking again or tagging. Tag PASS (tap E aimed at the tag, centre) only when the settled
// reading sits in the tolerance band. Last, ask the hologram a dosage question and log whether the answer came back late.
import { define, machine, room, rf, ri, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Check the holographic medic and scanners', type: 'loop' },
  title: 'Scanner gain detent calibration', dept: 'medical', host: 'room', siteName: 'Unit', verb: 'Check',
  how: 'Aim left or right on the gain dial and tap E to click it down or up; wait for the reading to settle; tap E at the centre to tag the unit PASS once it sits in the band. Then ask the hologram and log any lag.',
  keys: ['aim left / right + E: click gain', 'aim centre + E: tag pass', 'hologram: aim left OK / right LAG'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'detent and wait', input: 'e-tap+look', win: 'both scanners clicked into the tolerance band and tagged only after the lagging reading settled, and the hologram answer logged for lag',
    fail: 'tagging a scanner pass while its reading is still moving or outside the tolerance band, or logging a slow hologram answer as clean',
    rule: 'Each tap clicks the gain one detent toward the side you aim at; the reading eases over for about a second. Tag at the centre only when it is still and inside the band.' },
  rush: 'Glanced at the boot lights, ticked both scanners and asked the hologram nothing.',
  captions: { 'tagged off-band': 'pass tag clacks', 'tagged unsettled': 'pass tag clacks', 'lag missed': 'fault log beeps', 'false lag': 'fault log beeps' },
  says: { 'tagged off-band': 'Tagged pass while reading outside the band: that scanner reads wrong on a patient.', 'tagged unsettled': 'The reading was still moving. Wait for it to settle before you tag.', 'lag missed': 'The hologram was slow to answer: that goes in the fault log.', 'false lag': 'That answer came straight back. No lag to log.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Scanner 1', prop: 'biobed' }, { name: 'Scanner 2', prop: 'exam_couch' }, { name: 'Hologram alcove', prop: 'holocube' }]), r = m.rnd;
    const side = m.calm ? 0.18 : 0.22, mid = 0.12, tol = 0.6, step = 1.0, k = m.calm ? 4 : 3.2;
    m.units = [0, 1].map(() => { const ref = +(rf(r, 40, 80)).toFixed(1), off = (r() < 0.5 ? -1 : 1) * ri(r, 2, 4) * step + rf(r, -0.3, 0.3); return { ref, tr: ref + off, disp: ref + off }; });
    const lag = r() < 0.5, drug = pick(r, ['inaprovaline', 'cordrazine', 'kelotane', 'tricordrazine', 'hyronalin']);
    m.holo = { drug, delay: lag ? rf(r, 1.6, 2.4) : rf(r, 0.3, 0.7), lag, asked: -1, heard: false };
    const settled = (u) => Math.abs(u.disp - u.tr) < 0.08, inBand = (u) => Math.abs(u.tr - u.ref) <= tol;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; for (const u of m.units) u.disp += (u.tr - u.disp) * clamp(dt * k);
      if (m.holo.asked >= 0 && !m.holo.heard && m.t - m.holo.asked >= m.holo.delay) m.holo.heard = true;
      const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, look = inp.look || 0;
      if (i < 2) { const u = m.units[i];
        if (inp.press) { if (look >= side) u.tr -= step; else if (look <= -side) u.tr += step; else if (Math.abs(look) <= mid) { if (!settled(u)) m.fault('tagged unsettled'); else if (!inBand(u)) m.fault('tagged off-band'); else { m.finish(i); return; } } }
        s.prog = s.done ? 1 : 0.9 * clamp(1 - Math.abs(u.tr - u.ref) / 5); return; }
      const h = m.holo; if (inp.press) { if (h.asked < 0) { if (Math.abs(look) <= mid) { h.asked = m.t; m.ev('ask'); } }
        else if (h.heard && Math.abs(look) >= side) { const logLag = look < 0; if (h.lag && !logLag) m.fault('lag missed'); else if (!h.lag && logLag) m.fault('false lag'); else { m.finish(i); return; } } }
      s.prog = h.heard ? 0.8 : h.asked >= 0 ? 0.4 : 0;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const tap = f % 3 === 0, o = (look) => ({ at: i, press: tap, hold: tap, look });
      if (i < 2) { const u = m.units[i]; if (!settled(u)) return { at: i, look: 0 }; return inBand(u) ? o(0) : o(u.tr > u.ref ? 0.4 : -0.4); }
      const h = m.holo; return h.asked < 0 ? o(0) : !h.heard ? { at: i, look: 0 } : o(h.lag ? -0.4 : 0.4); };
    m.bad = (f = 0) => { const tap = f % 3 === 0; return { at: m.next, press: tap, hold: tap, look: 0 }; };
    m.view = () => ({ u: m.units.map(u => [u.ref, +u.tr.toFixed(2)]), h: [m.holo.drug, m.holo.lag] });
    m.panel = (i) => { if (i < 2) { const u = m.units[i]; if (!u) return null; const d = u.disp - u.ref;
        return { label: `Block ${u.ref.toFixed(1)} ±${tol} ${settled(u) ? '· steady' : '· settling…'}`, value: `${u.disp.toFixed(2)} (${d >= 0 ? '+' : ''}${d.toFixed(2)})`, bar: clamp(0.5 + d / 10), band: [0.5 - tol / 10, 0.5 + tol / 10] }; }
      const h = m.holo; return { label: h.asked < 0 ? `Ask: adult dose of ${h.drug}?` : h.heard ? `Answered after ${h.delay.toFixed(1)} s` : 'waiting for the answer…', value: h.heard ? '◀ OK · LAG ▶' : '', bar: h.asked < 0 ? 0 : clamp((m.t - h.asked) / 2.5), band: [0, 0.4] }; };
    m.prompt = (i) => i < 2 ? 'Aim left/right and tap [E] to click the gain; aim centre and tap [E] to tag PASS once steady in the band' : m.holo.asked < 0 ? 'Aim at the hologram and tap [E] to ask the dosage question' : m.holo.heard ? 'Aim left and tap [E] if the answer was prompt, right if it lagged' : 'Listen for the answer…';
    return m;
  },
});
