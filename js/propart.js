// Prop art registry: one import per art batch (docs/asset-gaps.md section 12). world.js buildProp's default branch asks buildPropArt(kind).
//   PROP_ART[kind] = (m, h) => THREE.Group   (m = world.js mats(), h = helpers; batches that own their materials ignore both)
//   buildPropArt(kind, m, h) -> Group | null, with normalised userData:
//     top    climbable surface height, or undefined when the prop cannot be stood on (hood, lamp boom, pole, chair)
//     box    [x0, x1, z0, z1] footprint in the prop frame (EQUIPMENT.*.box form); derived from size when the batch gave none
//     spots  EQUIPMENT-style [[x, z, ry], ...] body-root points (seated: root 0.41 m ahead of the pelvis)
//     use    named points (batch-specific: {x,z,ry}, THREE.Vector3 or {pos, ry})
//     seat   seat height (m) for seated props
import { kinds as STATIONS1 } from './propart-stations1.js';
import { kinds as GALLEY } from './propart-galley.js';
import { kinds as PLANT } from './propart-plant.js';
import { kinds as MEDICAL } from './propart-medical.js';

export const PROP_ART = { ...STATIONS1, ...GALLEY, ...PLANT, ...MEDICAL };
// which batch a kind came from (gallery labels, tests)
export const PROP_BATCH = Object.fromEntries([[STATIONS1, 'stations1'], [GALLEY, 'galley'], [PLANT, 'plant'], [MEDICAL, 'medical']].flatMap(([k, b]) => Object.keys(k).map(n => [n, b])));
// pieces that are not floor props on their own tile (wall / ceiling fixtures and add-ons): placed by the world.js decor pass or as children
export const PROP_ART_FIXTURES = new Set(['stretcher_rack', 'gas_panel', 'holo_emitter', 'morgue_tray']);
// floor props whose `top` must not be climbable: something hangs over the surface or the top is a thin pole / a chair back
const NO_CLIMB = new Set(['range', 'surgical_table', 'infusion_stand', 'autopsy_table', 'scrubber', 'fabricator', 'taskchair', 'taskchair_plain', 'barstool', 'barback']);
// footprints for batches that only give `size` [x, y|z, ...]: half extents (m)
const BOX = {
  pumpskid: [-0.65, 0.65, -0.25, 0.25], heatexch: [-1, 1, -0.45, 0.45], scrubber: [-0.45, 0.45, -0.35, 0.35], fieldgen: [-1.1, 1.1, -0.8, 0.8], fieldgen_damp: [-1.1, 1.1, -0.8, 0.8], fabricator: [-0.95, 0.95, -0.5, 0.5],
  steriliser: [-0.75, 0.75, -0.35, 0.35], surgical_table: [-0.5, 0.5, -1.0, 1.0], med_dispenser: [-0.4, 0.4, -0.3, 0.3], exam_couch: [-0.45, 0.66, -0.95, 0.95], autopsy_table: [-0.85, 0.85, -1.05, 1.05], infusion_stand: [-0.26, 0.26, -0.26, 0.26],
  helm: [-0.73, 0.73, -0.4, 0.4], baycontrol: [-0.95, 0.95, -0.5, 0.3], beampedestal: [-0.55, 0.55, -0.3, 0.3], secdesk: [-1.0, 1.0, -0.85, 0.85], nursestation: [-0.95, 0.95, -0.6, 0.6], holodesk: [-0.65, 0.65, -0.38, 0.38], reactorstation: [-0.9, 0.9, -0.4, 0.4],
};
export function buildPropArt(kind, m = {}, h = {}) {
  const f = PROP_ART[kind]; if (!f) return null;
  const a = f(m, h), u = a.userData;
  // medical batch: `spots` is a table of named {pos, ry}; keep it as `use`, derive the EQUIPMENT array from the entries that face somewhere
  if (u.spots && !Array.isArray(u.spots)) { u.use = { ...(u.use || {}), ...u.spots }; u.spots = Object.values(u.spots).filter(s => s?.pos && Number.isFinite(s.ry)).map(s => [s.pos[0], s.pos[2], s.ry]); if (!u.spots.length) delete u.spots; }
  if (NO_CLIMB.has(kind)) delete u.top;
  if (!u.box && BOX[kind]) u.box = BOX[kind].slice();
  if (u.seat && typeof u.seat === 'object') u.seatPoint = u.seat, u.seat = u.seat.y;   // stations: pelvis point -> seat height
  u.propArt = PROP_BATCH[kind];
  return a;
}
export const PROP_ART_KINDS = Object.keys(PROP_ART);
