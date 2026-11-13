// First-run briefing flythrough (Systems Nominal): a canvas at the top of the briefing card. ~2.5 s "scanning deck" sweep reveals the
// deck plan by room category, then a glowing line runs lift -> station 1 -> 2 ... (nearest-neighbour order) with numbered pins
// dropping in, then holds on the whole watch; a bottom strip shows the round as badge chips, and stations on other decks as
// "lift > Dn [badge]". Runs at ~30 Hz only while the card is visible; one canvas, no per-frame allocation beyond the route slice.
import { drawIcon } from './icons.js';
import { routeTo, navWorld, liftTile } from './nav.js';
import { bakeDeck, deckBounds, drawBadge, drawRoute, DUE } from './minimap.js';

const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

/** card: element to prepend into; d: deck data shown; stations: [{type, tx, ty}] on this deck; away: [{type, deck}] on other decks */
export function mountBrief(card, { d, stations = [], away = [], deckNo = 1, others = [] }) {
  if (!card || !d || card.querySelector('.nv-brief')) return null;
  const cv = document.createElement('canvas'); cv.className = 'nv-brief'; cv.width = 900; cv.height = 470;
  cv.style.cssText = 'display:block;width:100%;height:auto;max-height:34vh;object-fit:contain;margin:0 0 10px;background:#050912;border:1px solid rgba(150,180,210,.26)';
  card.prepend(cv); const g = cv.getContext('2d');
  // one scene per deck: this deck first, then (per-deck sequence) every other deck that holds a station, nearest first
  const stripH = 50, mapH = cv.height - stripH;
  const mkScene = (d, stations, deckNo) => {
  // round order: nearest neighbour from the lift, routes chained into one polyline
  const w = navWorld(d), lt = liftTile(d); let pos = { x: lt[0] + 0.5, y: lt[1] + 0.5 }; const rest = stations.slice(), order = [], poly = [[pos.x, pos.y]];
  while (rest.length) {
    rest.sort((a, b) => Math.hypot(a.tx - pos.x, a.ty - pos.y) - Math.hypot(b.tx - pos.x, b.ty - pos.y)); const s = rest.shift(), r = routeTo(w, pos, [s.tx, s.ty]); if (!r) continue;
    for (const p of r.pts.slice(1)) poly.push(p); order.push({ ...s }); pos = { x: s.tx + 0.5, y: s.ty + 0.5 };
  }
  const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const L = cum[cum.length - 1] || 1;
  for (const s of order) { let bi = 0, bd = 1e9; poly.forEach((p, i) => { const dd = Math.hypot(p[0] - s.tx - 0.5, p[1] - s.ty - 0.5); if (dd < bd) { bd = dd; bi = i; } }); s.at = cum[bi]; }
  const bb = deckBounds(d), sc = Math.min(cv.width / (bb.w + 2), mapH / (bb.h + 2), 36), ox = (cv.width - bb.w * sc) / 2 - bb.x * sc, oy = (mapH - bb.h * sc) / 2 - bb.y * sc;
  const layer = bakeDeck(d, null, sc);
    return { d, stations, deckNo, order, poly, cum, L, lt, bb, sc, ox, oy, layer };
  };
  const scenes = [mkScene(d, stations, deckNo), ...others.map(o => mkScene(o.d, o.stations, o.deckNo))]; let S = scenes[0], loop = 0;
  const T = 16, P1 = 0.16, P2 = 0.85; let t0 = performance.now(), last = 0, raf = 0;
  const frame = (now) => {
    if (!cv.isConnected || !cv.offsetParent) { cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(frame); if (now - last < 33) return; last = now;
    const lp = Math.floor((now - t0) / 1000 / T); if (lp !== loop) { loop = lp; S = scenes[lp % scenes.length]; }
    const { d, order, poly, cum, L, lt, bb, sc, ox, oy, layer, deckNo } = S;
    const tt = ((now - t0) / 1000) % T, k = tt / T, trav = ease(Math.max(0, Math.min(1, (k - P1) / (P2 - P1)))), s = trav * L;
    g.fillStyle = '#050912'; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(88,201,185,.06)'; g.lineWidth = 1; for (let x = 0; x < cv.width; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, mapH); g.stroke(); } for (let y = 0; y < mapH; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); }
    const rev = Math.min(1, k / P1);
    g.save(); g.translate(ox, oy); g.save(); g.beginPath(); g.rect(0, 0, (bb.x + bb.w * rev) * sc, d.H * sc); g.clip(); g.drawImage(layer, 0, 0);
    for (const r of d.rooms) if (r.type !== 'jefferies') drawBadge(g, r.type, (r.x + r.w / 2) * sc, (r.y + r.h / 2) * sc, Math.max(14, sc * 1.9), { dim: true });
    g.restore();
    if (rev < 1) { g.fillStyle = 'rgba(88,201,185,.8)'; g.fillRect((bb.x + bb.w * rev) * sc - 2, bb.y * sc, 3, bb.h * sc); }
    const sub = []; for (let i = 0; i < poly.length; i++) { if (cum[i] <= s) sub.push(poly[i]); else { const a = poly[i - 1], f = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); sub.push([a[0] + (poly[i][0] - a[0]) * f, a[1] + (poly[i][1] - a[1]) * f]); break; } }
    if (k > P1 && sub.length > 1) drawRoute(g, { pts: sub, cum: cum.slice(0, sub.length), len: Math.min(s, L) }, sc, tt);
    order.forEach((st, i) => { if (k <= P1 || st.at > s + 0.01) return; const x = (st.tx + 0.5) * sc, y = (st.ty + 0.5) * sc, age = Math.min(1, (s - st.at) / 6 + 0.25);
      drawBadge(g, st.type, x, y, Math.max(20, sc * 2.4)); g.save(); g.translate(x + 16 * age, y - 16 * age); g.scale(age, age); g.fillStyle = DUE; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill(); g.fillStyle = '#08101a'; g.font = '800 14px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), 0, 1); g.restore(); });
    if (k > P1) { const hp = sub[sub.length - 1] || poly[0]; g.fillStyle = '#fff'; g.shadowColor = '#8ef3ff'; g.shadowBlur = 14; g.beginPath(); g.arc(hp[0] * sc, hp[1] * sc, 5, 0, 7); g.fill(); g.shadowBlur = 0; }
    g.fillStyle = 'rgba(8,16,30,.9)'; g.beginPath(); g.arc((lt[0] + 0.5) * sc, (lt[1] + 0.5) * sc, 12, 0, 7); g.fill(); drawIcon(g, 'lift', (lt[0] + 0.5) * sc, (lt[1] + 0.5) * sc, 16, '#e6f2ff', 2);
    g.restore();
    // caption strip: icons only
    const y0 = mapH, cy = y0 + stripH / 2; g.fillStyle = 'rgba(7,11,19,.85)'; g.fillRect(0, y0, cv.width, stripH); g.strokeStyle = 'rgba(150,180,210,.3)'; g.strokeRect(0.5, y0 + 0.5, cv.width - 1, stripH - 1);
    let x = 22; drawIcon(g, 'lift', x, cy, 24, '#cfe1f3', 2); x += 30;
    order.forEach((st, i) => { const on = k > P1 && st.at <= s + 0.01 || k > P2; g.globalAlpha = on ? 1 : 0.3; drawIcon(g, 'chev', x, cy, 12, '#8ef3ff', 2); x += 24; drawBadge(g, st.type, x, cy, 32);
      g.fillStyle = DUE; g.beginPath(); g.arc(x + 14, cy - 13, 8, 0, 7); g.fill(); g.fillStyle = '#08101a'; g.font = '800 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x + 14, cy - 12); x += 34; g.globalAlpha = 1; });
    for (const a of away) { if (x > cv.width - 90) break; x += 16; drawIcon(g, 'lift', x, cy, 22, '#cfe1f3', 2); drawIcon(g, 'chev', x + 18, cy, 11, '#8ef3ff', 2); g.fillStyle = '#fff'; g.font = '800 16px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('D' + (a.deck + 1), x + 26, cy + 1); drawBadge(g, a.type, x + 70, cy, 30); x += 92; }
    g.fillStyle = k < P1 ? '#58c9b9' : '#ffd9a0'; g.font = '700 13px ui-monospace,monospace'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(k < P1 ? `SCANNING DECK ${String(deckNo).padStart(2, '0')} ...` : k < P2 ? 'YOUR ROUND' : 'YOUR WATCH', 12, 10);
  };
  raf = requestAnimationFrame(frame);
  return { canvas: cv, order: scenes[0].order, scenes, stop: () => cancelAnimationFrame(raf), drawAt: (ms) => { cancelAnimationFrame(raf); t0 =performance.now() - ms; last = 0; frame(performance.now()); } };
}
