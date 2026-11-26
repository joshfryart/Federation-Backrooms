// Per-frame render culling for the crowd.  Rigged humans are 17k-triangle skinned bodies plus 7k-triangle teeth / hair / garments and all of
// their meshes have frustumCulled = false (a skinned bounding sphere is wrong), so every person on the deck was drawn every frame, also behind the
// camera, and again in the torch shadow pass.  This hides a person's whole group when its bounding sphere is outside the camera frustum (their
// mixer / AI still run: only the draw is skipped), drops teeth / tongue / lashes beyond FACE_FAR (not resolvable that far), and stops far people
// casting torch shadows.  Everything we hide is flagged so we never un-hide a group some other module hid on purpose.
// LOD: each shown person also gets a level from their distance to the camera (scaled by the field of view, so a zoomed camera counts as close):
// level 1 past LOD_NEAR, 2 past LOD_FAR, with LOD_HYST metres of hysteresis so nobody flickers on a boundary, and always level 0 while
// `full` is set (talk close-ups).  The level swaps mesh.geometry to the decimated copy js/humans.js built (js/meshlod.js) for this draw only:
// uncullCrowd() puts the full geometry back, so raycasts, bind-pose probes and anything else outside the draw see the original mesh.
import * as THREE from 'three';
import { lodStats, lodLevel } from './meshlod.js';
export const FACE_FAR = 13, SHADOW_FAR = 18, DRAW_FAR = 60, RADIUS = 1.35, LOD_FOV = 75;   // LOD distances: js/meshlod.js LOD_NEAR / LOD_FAR / LOD_HYST
const FACE_PARTS = new Set(['teeth', 'tongue', 'eyelashes']);
const fr = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(), _c = new THREE.Vector3();
const hidden = [], swapped = [];
export const cullStats = { hidden: 0, shown: 0, face: 0, lod: [0, 0, 0] };
export const lodCfg = { on: true, force: null };   // tests / probes: switch LODs off, or force one level on everyone

function faceMeshes(g) {   // cached list of the small face meshes of one human group
  const u = g.userData; if (u._faceMeshes) return u._faceMeshes; const out = [];
  g.traverse(o => { if (o.isMesh && FACE_PARTS.has((o.material?.name || o.name || '').split('_')[0])) out.push(o); });
  return (u._faceMeshes = out);
}
function lodMeshes(g) { const u = g.userData; if (u._lodMeshes && u._lodV === lodStats.done) return u._lodMeshes; u._lodV = lodStats.done;   // re-scanned when more LODs arrive from the worker
  const out = []; g.traverse(o => { if (o.isMesh && o.geometry?.userData.lods) out.push(o); }); return (u._lodMeshes = out); }
function casters(g) { const u = g.userData; if (u._casters) return u._casters; const out = []; g.traverse(o => { if (o.isMesh && o.castShadow) out.push(o); }); return (u._casters = out); }

// ents: the game's entity list; cam: the main camera; px/pz: player position; full: draw everyone at full detail (talk close-up).  Call right before drawing.
export function cullCrowd(ents, cam, px, pz, full = false) {
  cam.updateMatrixWorld(); pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pv);
  uncullCrowd(); let hid = 0, shown = 0, face = 0; const lc = cullStats.lod; lc[0] = lc[1] = lc[2] = 0;
  const cp = cam.matrixWorld.elements, fovK = cam.isPerspectiveCamera ? Math.tan(cam.fov * Math.PI / 360) / Math.tan(LOD_FOV * Math.PI / 360) / (cam.zoom || 1) : 1;
  for (const e of ents) {
    const g = e.mesh; if (!g || !g.userData.human) continue;
    const me = g.matrixWorld.elements, wx = me[12], wy = me[13], wz = me[14], dx = wx - px, dz = wz - pz, d2 = dx * dx + dz * dz, u = g.userData;
    if (!g.visible) continue;   // hidden by its owner (lift, hiding, ...): not ours to touch
    sph.center.set(wx, wy + 0.95, wz); sph.radius = RADIUS;
    const out = d2 > DRAW_FAR * DRAW_FAR || (d2 > 4 && !fr.intersectsSphere(sph));   // within 2 m: always draw (arms / head can sweep past the sphere test as the camera turns)
    if (out) { g.visible = false; u._culled = true; hidden.push(g); hid++; continue; }
    shown++;
    const farFace = d2 > FACE_FAR * FACE_FAR, fm = faceMeshes(g); for (const m of fm) { if (farFace && m.visible) { m.visible = false; m.userData._faceHid = true; } else if (!farFace && m.userData._faceHid) { m.visible = true; m.userData._faceHid = false; } } if (farFace) face += fm.length;
    const farShadow = d2 > SHADOW_FAR * SHADOW_FAR; if (u._farShadow !== farShadow) { u._farShadow = farShadow; for (const m of casters(g)) m.castShadow = !farShadow; }
    const ex = sph.center.x - cp[12], ey = sph.center.y - cp[13], ez = sph.center.z - cp[14], lv = (full || !lodCfg.on) ? 0 : lodCfg.force != null ? lodCfg.force : lodLevel(u._lod, Math.sqrt(ex * ex + ey * ey + ez * ez) * fovK);
    u._lod = lv; lc[lv]++;
    if (lv) for (const m of lodMeshes(g)) { const L = m.geometry.userData.lods, lg = L[Math.min(lv, L.length - 1)]; if (lg !== m.geometry) { swapped.push(m, m.geometry); m.geometry = lg; } }
  }
  cullStats.hidden = hid; cullStats.shown = shown; cullStats.face = face;
}
// call right after drawing: gameplay code that reads mesh.visible sees the groups as it left them
export function uncullCrowd() { for (const g of hidden) { g.visible = true; g.userData._culled = false; } hidden.length = 0; for (let i = 0; i < swapped.length; i += 2) swapped[i].geometry = swapped[i + 1]; swapped.length = 0; }
