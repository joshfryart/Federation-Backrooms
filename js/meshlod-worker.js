// Module worker for js/meshlod.js: runs the crowd LOD simplifier off the main thread (it is ~0.1-0.3 s of CPU per body mesh).
// in: { id, pos, index, attrs, levels: [{ ratio, maxError }] }   out: { id, idx: [Uint32Array per level], ms }
import { simplifyLevels } from './meshlod.js';
self.onmessage = (ev) => {
  const { id, pos, index, attrs, levels } = ev.data, t0 = performance.now();
  try { const idx = simplifyLevels(pos, index, levels, attrs); self.postMessage({ id, idx, ms: performance.now() - t0 }, idx.map(a => a.buffer)); }
  catch (e) { self.postMessage({ id, error: String(e?.message || e) }); }
};
