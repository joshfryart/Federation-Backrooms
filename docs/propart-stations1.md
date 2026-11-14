# Batch 1 prop art: station consoles I (`js/propart-stations1.js`)

Viewer: `python3 -m http.server 8130` then `viewer-stations1.html` (`?only=helm,secdesk`, `?sit=1` seats a capsule at the seat points, `?chair=0`, `?person=0`, `?spin=0`, `?cam=x,y,z,tx,ty,tz`).

Module: `export const kinds = { name: (m, h) => THREE.Group }`. It owns its materials and helpers, so `m` and `h` are ignored (pass anything). Also exports `buildChair(dept, arms)` and `KIND_NAMES`.
Conventions: origin at floor centre, +z is the operator side (screens face +z), metres, one mesh per material, procedurally textured screens (glyph bars only).

| kind | asset | real analogue | size (m) | tris | operator point |
|---|---|---|---|---|---|
| `helm` | FLT-1 | airliner / ship flight-control workstation, 3 screens, side-sticks, throttle quadrant, footrest | 1.46 w x 0.8 d, work surface 0.72 to 0.95, screens to 1.55 | ~1180 | seated, pelvis (0, 0.48, 0.72) |
| `baycontrol` | FLT-2 | airport ground-control desk, 5-segment arc, 3 screens, 2 gauges, guarded lever, red/amber/green lamp stack | 1.9 w, 1.0 high (stack to 1.75) | ~1140 | standing, spots at z 0.5 |
| `beampedestal` | OPS-1 | lighting-desk pedestal, 20 degree slope, 3 faders, readout | 1.1 w x 0.6 d, 1.05 back / 0.83 front | ~420 | standing, z 0.66 |
| `secdesk` | SEC-1 | custody / CCTV desk, L-shape, 1.1 m visitor counter, 3x2 camera wall, cell lamp board, key cabinet | 2.0 w x 1.7 d, counter 1.1, wall to 1.7 | ~1300 | seated, pelvis (0.2, 0.48, 0.72) |
| `nursestation` | MED-1 | hospital nurses' station, 1.1 m public upstand, 0.75 m work surface, six-bed monitor, chart rack, sharps bin | 1.9 x 1.2 | ~980 | seated pelvis (-0.15, 0.48, 0.62) or standing use (-0.15, 0.5) |
| `taskchair` / `taskchair_plain` | X-1 | task chair: five-star base on fixed glides (no castors), gas lift, seat 0.45 x 0.45 at 0.48, low back to 0.9, optional arms | 0.56 base | ~610 | seat (0, 0.48, 0) |
| `holodesk` | SVC-10 | AV show-control desk, fader bank, trackball, key switch, amber PAUSE, guarded red END, 2 screens | 1.3 w x 0.76 d | ~1420 | seated, pelvis (0, 0.48, 0.72) |
| `reactorstation` | ENG-3 | power-plant operator desk, 3 screens, 6x3 annunciator, 12 trim knobs, scram under hinged cover | 1.8 w x 0.8 d, to 1.9 high | ~1890 (over the 1500 budget; knobs and chair dominate) | seated, pelvis (0, 0.48, 0.72) |

(Tri counts are in `userData.tris`.) No `userData.top` is set: none of these is a climbable prop.

## Seat / use convention (matches `EQUIPMENT` spots)
`userData.seat = {x, y: 0.48, z, yaw: PI}` is the PELVIS point of a seated person (facing -z, toward the desk). `userData.spots` is the same point in `EQUIPMENT` format `[[x, z - 0.41, PI]]`, because the body root sits 0.41 m ahead of the pelvis in `sitting_idle` (see the comment above `EQUIPMENT`). Standing props use `spots` (and `userData.use = {x, z, yaw}`) with the root 0.3 to 0.35 m off the front. Seated stations carry a child group named `'chair'` (own task chair, `chair.children[0]` has a `'swivel'` group that may be rotated about y); set `.visible = false` to drop it. The chair's own frame has front = +z; inside stations it is already turned to face the desk.

## Hook-up for the integrator
`buildProp` default branch (world.js ~367), or via `js/propart.js`:
```js
import { kinds as stations1 } from './propart-stations1.js';
// default: { const f = stations1[kind]; if (f) return f(m, {}); ... }
```
`PROP_KINDS` additions: `'helm','baycontrol','beampedestal','secdesk','nursestation','taskchair','taskchair_plain','holodesk','reactorstation'`.

`EQUIPMENT` (js/equipment.js): seated stations reuse the `desk` script (sit, seat 0.48) and standing ones the `console` script with their own spots. Either extend `props` lists:
```js
console: { ..., props: ['console', 'baycontrol', 'beampedestal'], ... }   // standing; spots from userData.spots, or per-kind overrides:
//   baycontrol: [[0, 0.5, PI], [-0.5, 0.45, PI], [0.5, 0.45, PI]];  beampedestal: [[0, 0.66, PI], [-0.4, 0.66, PI], [0.4, 0.66, PI]]
desk:    { ..., props: ['desk', 'helm', 'secdesk', 'nursestation', 'holodesk', 'reactorstation'], stance: 'sit', seat: 0.48, ... }
//   spots: helm [[0, 0.31, PI]], secdesk [[0.2, 0.31, PI]], nursestation [[-0.15, 0.21, PI]], holodesk [[0, 0.31, PI]], reactorstation [[0, 0.31, PI]]
```
Easiest: read `mesh.userData.spots` when the prop mesh is known, else the table above. The existing `desk` prop needs the same chair: add a child at the desk's spot `[0, 0.36]` -> pelvis z 0.77:
```js
const c = buildChair('flight', false); c.position.set(0, 0, 0.77); c.rotation.y = Math.PI; deskGroup.add(c);   // taskchair facing the desk
```

`gen.js` placement (one per room, operator side toward the room's open floor; rotate with the usual prop yaw): bridge `helm` (forward port, in place of one `console`); shuttlebay `baycontrol` by the door wall; transporter `beampedestal` 2 m from the `pad`, its back toward the pad (operator looks over it at the pad); brig `secdesk` near the entrance, counter facing the door; sickbay `nursestation` at the room centre-back; holodeck `holodesk` by the wall; engineering `reactorstation` beside the `warpcore`, facing it.

## Human eye needed
Colour tuning under the real room lighting; whether the 0.41 m pelvis offset puts knees under each desk (viewer `?sit=1` shows a rough capsule, the real sitting_idle clip not tested); the reactor station is about 400 tris over budget.
