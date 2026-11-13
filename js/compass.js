// Compass strip (top centre, Systems Nominal): ship axes FWD / STBD / AFT / PORT with 15 degree ticks, and icon-disc markers:
// the lift (white), due duties on this deck (status-coloured clock ring) and the guided target (large, cyan, with metres).
// Off-strip markers clamp to the edge with an arrow. Heading = -P.yaw (clockwise from ship-forward = map up = -z).
import { drawIcon } from './icons.js';

const LAB = { 0: 'FWD', 90: 'STBD', 180: 'AFT', 270: 'PORT' };
export const bearing = (dx, dy) => Math.atan2(dx, -dy);          // tile/world delta -> clockwise angle from ship-forward
export const relAngle = (a, heading) => Math.atan2(Math.sin(a - heading), Math.cos(a - heading));

export class Compass {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); }
  /** s = {yaw, px, py, markers:[{x, y, icon, color, frac?, main?, txt?}]} (tile units) */
  draw(s) {
    const c = this.c, g = this.g, w = c.width, h = c.height, span = Math.PI * 1.1, head = -s.yaw;
    const X = (a) => { const d = relAngle(a, head); return { x: w / 2 + d / span * w, d }; };
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(7,11,19,.62)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w - 18, h * 0.52); g.lineTo(18, h * 0.52); g.closePath(); g.fill(); g.strokeStyle = 'rgba(150,180,210,.3)'; g.lineWidth = 2; g.stroke();
    const bh = h * 0.52;
    for (let a = 0; a < 360; a += 15) {
      const p = X(a * Math.PI / 180); if (Math.abs(p.d) > span / 2) continue; const maj = a % 90 === 0;
      g.strokeStyle = maj ? '#ffd9a0' : 'rgba(190,210,235,.5)'; g.lineWidth = maj ? 3 : 2; g.beginPath(); g.moveTo(p.x, bh - 3); g.lineTo(p.x, bh - (maj ? 16 : 9)); g.stroke();
      if (maj) { g.fillStyle = '#ffd9a0'; g.font = `800 ${Math.round(bh * 0.42)}px "Roboto Condensed","Arial Narrow",Arial,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(LAB[a], p.x, bh - 19); }
    }
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2 - 8, 0); g.lineTo(w / 2 + 8, 0); g.lineTo(w / 2, 11); g.fill();
    const ms = (s.markers || []).slice().sort((a, b) => (a.main ? 1 : 0) - (b.main ? 1 : 0));
    for (const m of ms) {
      const p = X(bearing(m.x - s.px, m.y - s.py)); let x = p.x, edge = 0; const r = m.main ? h * 0.2 : h * 0.14, lim = w / 2 - r - 14;
      if (Math.abs(x - w / 2) > lim) { edge = Math.sign(x - w / 2); x = w / 2 + edge * lim; }
      g.save(); g.translate(x, bh + r + 4); g.fillStyle = 'rgba(5,10,16,.9)'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.strokeStyle = m.color; g.lineWidth = m.main ? 4 : 3; g.stroke();
      if (m.frac != null) { g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(0, 0, r + 4, 0, 7); g.stroke(); g.strokeStyle = m.color; g.beginPath(); g.arc(0, 0, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, Math.min(1, m.frac))); g.stroke(); }
      drawIcon(g, m.icon, 0, 0, r * 1.25, '#fff', 2.4);
      if (edge) { g.fillStyle = m.color; g.beginPath(); g.moveTo(edge * (r + 11), 0); g.lineTo(edge * (r + 3), -7); g.lineTo(edge * (r + 3), 7); g.fill(); }
      if (m.main && m.txt) { g.fillStyle = m.color; g.font = `700 ${Math.round(h * 0.2)}px ui-monospace,monospace`; g.textBaseline = 'middle'; const tw = g.measureText(m.txt).width; g.textAlign = 'left'; g.fillText(m.txt, edge > 0 ? -r - 8 - tw : r + 8, 1); }
      g.restore();
    }
  }
}
