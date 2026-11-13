import { ClingModel, ClingHud } from '../js/cling-hud.js';
import assert from 'node:assert';
{ const m = new ClingModel(); m.on(4.5); assert(m.label === 'MASH [E]'); m.tick(2, 0.1); assert(m.progress > 0.5 && m.label === 'KEEP MASHING'); m.mash(); assert(m.mashes === 1);
  m.tick(0.5); assert(m.label === 'ALMOST OFF' && m.vignette < 35); m.reset(); assert(!m.active && m.progress === 0);
  const h = new ClingHud(null); const P = { clung: 3, clungMax: 4 }; h.on(4.5); h.reset(P); assert(P.clung === 0 && !h.m.active); console.log('cling ok'); }
