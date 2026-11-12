// Equipment motions: how a crew member *uses* each piece of furniture / hardware, what they hold while doing it, and the things people carry.
// Pure data + logic (no three.js, no DOM): node-testable. The game glue lives in js/haul.js (operators on NPC bodies, carts, player carry).
//   EQUIPMENT       key (prop kind or schedule spot) -> { name, props, stance, seat (seat top m), clip, spots|box+gap, y, hold, steps, rest, idle }
//   equipFor(spot)  the entry for a schedule spot or a prop kind (aliases, then the generic 'post' fallback)
//   propsFor(spot)  which prop kinds a person with that spot stands at (js/main.js simTileFor)
//   standPoint(def, prop, from)  where the body goes beside a prop {cx, cz, rot} when it arrives from `from` {x, z}: { x, z, yaw, y }
//   useScript(kind, person, seed, cycle)  the deterministic step list for one use cycle
//   new Operator(kind, person, seed, opts).update(dt) -> { clip, speed, ch, face, hold, holdL, cue, fx, gesture, step, cycle, done }
//   ITEMS / classifyItem(name)  things you can pick up and carry (player + NPCs) and their payoffs;  CARTS, HAULERS  who pushes what where
import { hash01 } from './clock.js';
import { GESTURES, HOLDS, sample, curveAt } from './movement.js';

const PI = Math.PI;
export const STANCE_CLIP = { stand: 'idle', sit: 'sitting_idle', kneel: 'fixing_kneeling', lie: 'sitting_idle' };

// ---- a step: { g gesture id, clip (overrides the stance clip for the step), dur [min,max] s, hold / holdL item id (null puts it away,
//      omitted keeps), pose (HOLDS id while the step runs), cue (sound), fx (effect hook name for the game), p (chance per cycle), needs (only while holding one of these), speed }
const st = (g, dur, x = {}) => ({ g, dur, ...x });
const wait = (dur, x = {}) => ({ g: null, dur, ...x });

// ---- the table. Spots are [localX, localZ, localYaw] of the body ROOT in the prop's frame (props face local +z; in sitting_idle the pelvis is
//      0.41 m behind the root, so a seat at s puts the root 0.41 m ahead of it, feet under the table); the nearest one to where the person
//      walked in from is used, else a point just outside `box` [x0, x1, z0, z1] (+ gap) on the side they came from, facing the prop.
export const EQUIPMENT = {
  console: { name: 'ops console', props: ['console'], stance: 'stand', box: [-0.85, 0.85, -0.38, 0.38], gap: 0.32, spots: [[0, 0.72, PI], [-0.5, 0.72, PI], [0.5, 0.72, PI]],
    steps: [st('tap_console', [2, 3.4], { cue: 'beep' }), st('lean_in', [2.5, 4], { pose: 'lean_on' }), st('type_keys', [2.4, 4]), st('look_up_screen', [1.8, 3], { p: 0.6 }), st('press_panel', [1.1, 1.6], { fx: 'screen' }), st('rub_eyes', [1.8, 2.4], { p: 0.18 })],
    rest: [1.5, 4], idle: ['nod', 'head_tilt', 'look_around'] },
  desk: { name: 'desk', props: ['desk'], stance: 'sit', seat: 0.48, box: [-0.9, 0.9, -0.43, 0.43], gap: 0.25, spots: [[0, 0.36, PI]],
    steps: [st('type_keys', [3, 5], { cue: 'keys' }), st('check_tablet', [2.4, 3.6], { holdL: 'padd', pose: 'hold_padd' }), wait([1, 2], { holdL: null }), st('lean_in', [2.5, 4]), st('rub_eyes', [1.8, 2.4], { p: 0.25 }), st('stretch', [2.6, 3.4], { p: 0.15 })],
    rest: [2, 5], idle: ['head_tilt', 'nod', 'slow_blink'] },
  chair: { name: 'command chair', props: ['chair'], stance: 'sit', seat: 0.5, spots: [[0, -0.38, PI]], steps: [st('look_up_screen', [2.4, 4]), st('check_tablet', [2.4, 3.6], { holdL: 'padd' }), wait([1, 2], { holdL: null }), st('nod', [0.7, 1]), st('tap_console', [2, 3], { p: 0.5 })], rest: [3, 6], idle: ['look_around', 'head_tilt'] },
  viewscreen: { name: 'main viewscreen', props: ['viewscreen'], stance: 'stand', box: [-1.3, 1.3, -0.3, 0.3], gap: 0.9, steps: [st('look_up_screen', [3, 5]), st('hands_behind_back', [5, 8]), st('nod', [0.7, 1])], rest: [3, 6], idle: ['head_tilt'] },
  warpcore: { name: 'warp core', props: ['warpcore'], stance: 'stand', box: [-0.9, 0.9, -0.9, 0.9], gap: 0.3,
    steps: [st('look_up_screen', [2.4, 3.4]), st('check_tablet', [2.4, 3.6], { holdL: 'padd', cue: 'beep' }), st('press_panel', [1.1, 1.6], { holdL: null, fx: 'core' }), st('tool_work', [2.2, 3.2], { hold: 'tool', p: 0.45 }), wait([0.6, 1], { hold: null })],
    rest: [2, 4], idle: ['look_around', 'rub_neck'] },
  replicator: { name: 'replicator', props: ['replicator'], stance: 'stand', box: [-0.75, 0.75, 0.19, 0.62], gap: 0.3, spots: [[0, 1.1, PI], [-0.4, 1.1, PI], [0.4, 1.1, PI]],
    steps: [st('press_panel', [1.1, 1.6], { cue: 'beep' }), wait([1.2, 2.2], { cue: 'replicate', fx: 'replicate' }), st('take_item', [1.0, 1.4], { hold: 'cup', p: 0.6 }), st('take_item', [1.0, 1.4], { hold: 'tray', pose: 'tray', p: 0.4 }), st('turn_away', [1.4, 2.2]), st('sip', [1.6, 2.2], { p: 0.6, needs: ['cup', 'glass'] }), wait([0.6, 1.2], { hold: null })],
    rest: [3, 7], idle: ['check_wrist', 'look_around'] },
  workbench: { name: 'workbench', props: ['workbench'], stance: 'stand', box: [-0.85, 0.85, -0.4, 0.4], gap: 0.3, spots: [[0, 0.72, PI], [0.0, -0.72, 0]],
    steps: [st('lean_in', [2, 3], { pose: 'lean_on', hold: 'tool' }), st('tool_work', [2.2, 3.4], { cue: 'clank' }), st('inspect_item', [2, 3]), wait([0.5, 1], { hold: null }), st('tool_work', [3, 5], { clip: 'fixing_kneeling', hold: 'tool', p: 0.35, fx: 'sparks' }), st('wipe_surface', [2.4, 3.2], { hold: null, p: 0.3 })],
    rest: [1.5, 3.5], idle: ['crack_knuckles', 'scratch_head', 'rub_neck'] },
  labbench: { name: 'lab bench', props: ['labbench'], stance: 'stand', box: [-0.85, 0.85, -0.4, 0.4], gap: 0.3, spots: [[0, 0.72, PI]],
    steps: [st('lean_in', [2, 3.4], { pose: 'lean_on' }), st('take_item', [1, 1.4], { hold: 'vial' }), st('inspect_item', [2, 3.2]), wait([0.4, 0.8], { hold: null }), st('type_keys', [2.4, 3.6], { cue: 'keys' }), st('check_tablet', [2.4, 3.4], { holdL: 'padd', p: 0.5 }), wait([0.4, 0.8], { holdL: null })],
    rest: [2, 4], idle: ['head_tilt', 'rub_eyes'] },
  lathe: { name: 'fabrication lathe', props: ['lathe'], stance: 'stand', box: [-0.88, 0.88, -0.28, 0.28], gap: 0.32, spots: [[0, 0.62, PI]],
    steps: [st('press_panel', [1.1, 1.5], { cue: 'beep', fx: 'lathe' }), wait([2, 3.5], { cue: 'whine' }), st('lean_in', [2, 3]), st('take_item', [1, 1.4], { hold: 'tool' }), st('inspect_item', [2, 3]), wait([0.5, 1], { hold: null })],
    rest: [2, 4], idle: ['crack_knuckles', 'look_around'] },
  biobed: { name: 'biobed', props: ['biobed'], stance: 'stand', box: [-0.48, 0.48, -1.0, 1.0], gap: 0.3, spots: [[0.78, 0, -PI / 2], [-0.78, 0, PI / 2], [0.78, 0.5, -PI / 2], [-0.78, -0.5, PI / 2]],
    steps: [st('scan_sweep', [2.4, 3.6], { hold: 'scanner', cue: 'scan' }), st('inspect_item', [2, 3]), wait([0.4, 0.8], { hold: null }), st('look_up_screen', [2, 3]), st('press_panel', [1.1, 1.5], { fx: 'monitor' }), st('nod', [0.7, 1], { p: 0.5 }), st('check_tablet', [2.4, 3.4], { holdL: 'padd', p: 0.5 }), wait([0.4, 0.8], { holdL: null })],
    rest: [2, 4], idle: ['head_tilt', 'rub_neck'] },
  treadmill: { name: 'treadmill', props: ['treadmill'], stance: 'stand', clip: 'jog_fwd', speed: 0.9, y: 0.22, spots: [[0, 0.15, PI]],
    steps: [wait([8, 14], { clip: 'jog_fwd', cue: 'thud' }), wait([5, 9], { clip: 'walk', speed: 0.8 }), st('glance_back', [1, 1.5], { clip: 'walk' }), wait([4, 8], { clip: 'jog_fwd' })], rest: [0.5, 1.5], restClip: 'walk', idle: [] },
  weightbench: { name: 'weight bench', props: ['weightbench'], stance: 'sit', seat: 0.5, spots: [[0, 0.7, 0]],
    steps: [st('curl_weights', [2.4, 3.4], { hold: 'dumbbell', holdL: 'dumbbell', cue: 'groan' }), st('curl_weights', [2.4, 3.4]), wait([1.5, 3]), st('curl_weights', [2.4, 3.4], { p: 0.7 }), wait([1, 2], { hold: null, holdL: null }), st('stretch', [2.6, 3.4], { p: 0.4 })],
    rest: [2, 4], idle: ['neck_roll', 'sigh'] },
  bar: { name: 'bar', props: ['table', 'replicator', 'sofa'], stance: 'sit', seat: 0.48, hold: 'glass', box: [-0.76, 0.76, -0.5, 0.5], gap: 0.25, spots: [[0, 0.56, PI], [0, -0.56, 0], [0.45, 0.56, PI], [-0.45, -0.56, 0]],
    steps: [st('sip', [1.6, 2.4], { pose: 'hold_cup' }), wait([3, 6], { pose: 'hold_cup' }), st('nod', [0.7, 1]), st('small_smile', [1.4, 2.4]), st('sip', [1.6, 2.4], { pose: 'hold_cup', p: 0.7 })], rest: [2, 5], idle: ['look_around', 'swing_legs', 'head_tilt'] },
  table: { name: 'mess table', props: ['table'], stance: 'sit', seat: 0.48, box: [-0.76, 0.76, -0.5, 0.5], gap: 0.25, spots: [[0, 0.56, PI], [0, -0.56, 0], [0.45, 0.56, PI], [-0.45, -0.56, 0]],
    steps: [st('take_item', [1, 1.4], { hold: 'cup' }), st('sip', [1.6, 2.4], { pose: 'hold_cup' }), wait([2, 4], { pose: 'hold_cup' }), wait([0.5, 1], { hold: null }), st('lean_in', [2.5, 4]), st('check_tablet', [2.4, 3.6], { holdL: 'padd', p: 0.4 }), wait([0.5, 1], { holdL: null })],
    rest: [2, 5], idle: ['nod', 'small_smile', 'look_around'] },
  sofa: { name: 'sofa', props: ['sofa', 'lonechair'], stance: 'sit', seat: 0.46, spots: [[-0.45, 0.46, 0], [0.45, 0.46, 0], [0, 0.46, 0]],
    steps: [wait([4, 8]), st('check_tablet', [2.4, 3.6], { holdL: 'padd', p: 0.5 }), wait([0.5, 1], { holdL: null }), st('stretch', [2.6, 3.4], { p: 0.3 }), st('swing_legs', [2.5, 4])], rest: [3, 6], idle: ['look_around', 'small_smile', 'slow_blink'] },
  lonechair: { name: 'armchair', props: ['lonechair'], stance: 'sit', seat: 0.45, spots: [[0, -0.4, PI]], steps: [wait([5, 9]), st('check_tablet', [2.4, 3.6], { holdL: 'padd', p: 0.4 }), wait([0.5, 1], { holdL: null })], rest: [3, 6], idle: ['look_around', 'slow_blink'] },
  bunk: { name: 'bunk', props: ['bunk'], stance: 'sit', seat: 0.52, spots: [[0.25, 0.66, 0], [-0.45, 0.66, 0]],
    steps: [st('check_tablet', [3, 5], { holdL: 'padd', pose: 'hold_padd' }), wait([4, 8], { pose: 'hold_padd' }), wait([0.5, 1], { holdL: null }), st('yawn', [2.4, 3.2], { p: 0.4 }), st('stretch', [2.6, 3.4], { p: 0.3 })], rest: [3, 6], idle: ['slow_blink', 'rub_eyes'] },
  washer: { name: 'washer-dryer', props: ['washer'], stance: 'stand', box: [-0.85, 0.85, -0.4, 0.4], gap: 0.3, spots: [[-0.45, 0.72, PI], [0.45, 0.72, PI]],
    steps: [st('reach_low', [1.8, 2.6], { cue: 'clunk' }), st('take_item', [1, 1.4], { hold: 'linen', pose: 'carry_front' }), st('fold_cloth', [2.4, 3.4]), wait([0.5, 1], { hold: null }), st('press_panel', [1.1, 1.5], { fx: 'washer', cue: 'beep' })], rest: [2, 4], idle: ['sigh', 'look_around'] },
  servers: { name: 'computer core stack', props: ['servers'], stance: 'stand', box: [-1.0, 1.0, -0.43, 0.43], gap: 0.32, spots: [[0, 0.78, PI], [-0.6, 0.78, PI], [0.6, 0.78, PI]],
    steps: [st('look_up_screen', [2, 3]), st('check_tablet', [2.4, 3.6], { holdL: 'padd', cue: 'beep' }), st('press_panel', [1.1, 1.5], { holdL: null, fx: 'blink' }), st('reach_low', [1.8, 2.4], { p: 0.4 }), st('inspect_item', [2, 3], { hold: 'chip', p: 0.4 }), wait([0.4, 0.8], { hold: null })], rest: [2, 4], idle: ['rub_neck', 'head_tilt'] },
  tank: { name: 'pressure vessel', props: ['tank'], stance: 'stand', box: [-0.6, 0.6, -0.6, 0.6], gap: 0.3,
    steps: [st('look_up_screen', [1.6, 2.4]), st('turn_valve', [2, 3], { cue: 'clank', fx: 'steam' }), st('check_tablet', [2.4, 3.4], { holdL: 'padd' }), wait([0.4, 0.8], { holdL: null }), st('tool_work', [2.2, 3.2], { hold: 'tool', clip: 'fixing_kneeling', p: 0.35 }), wait([0.4, 0.8], { hold: null })], rest: [2, 4], idle: ['look_around', 'rub_neck'] },
  drawers: { name: 'storage drawers', props: ['drawers'], stance: 'stand', box: [-0.8, 0.8, -0.45, 0.45], gap: 0.3, spots: [[0, 0.78, PI]],
    steps: [st('reach_low', [1.8, 2.6], { cue: 'drawer' }), st('take_item', [1, 1.4], { hold: 'smallbox' }), st('inspect_item', [2, 3]), st('reach_low', [1.8, 2.4], { hold: null, cue: 'drawer' }), st('check_tablet', [2.4, 3.4], { holdL: 'padd', p: 0.5 }), wait([0.4, 0.8], { holdL: null })], rest: [2, 4], idle: ['scratch_head', 'look_around'] },
  shelving: { name: 'stores shelving', props: ['shelving'], stance: 'stand', box: [-0.85, 0.85, -0.3, 0.3], gap: 0.32, spots: [[0, 0.62, PI], [0, -0.62, 0]],
    steps: [st('reach_shelf', [1.6, 2.4], { cue: 'rummage' }), st('take_item', [1, 1.4], { hold: 'smallbox', pose: 'carry_front' }), st('inspect_item', [2, 3]), st('reach_shelf', [1.6, 2.4], { hold: null }), st('reach_low', [1.8, 2.4], { p: 0.5 }), st('check_tablet', [2.4, 3.4], { holdL: 'padd' }), wait([0.4, 0.8], { holdL: null })], rest: [1.5, 3], idle: ['scratch_head', 'rub_neck'] },
  locker: { name: 'locker', props: ['shelving', 'drawers', 'suitrack', 'weaponrack', 'crate'], stance: 'stand', box: [-0.8, 0.8, -0.4, 0.4], gap: 0.32,
    steps: [st('reach_shelf', [1.6, 2.4], { cue: 'rummage' }), st('take_item', [1, 1.4], { hold: 'smallbox' }), st('inspect_item', [2, 3]), st('reach_low', [1.8, 2.4], { hold: null }), st('check_tablet', [2.4, 3.4], { holdL: 'padd', p: 0.6 }), wait([0.4, 0.8], { holdL: null })], rest: [1.5, 3], idle: ['scratch_head', 'look_around'] },
  crate: { name: 'cargo rack', props: ['crate'], stance: 'stand', box: [-0.8, 0.8, -0.8, 0.8], gap: 0.3,
    steps: [st('check_tablet', [2.4, 3.6], { holdL: 'padd', cue: 'beep' }), st('scan_sweep', [2.4, 3.2], { hold: 'scanner' }), wait([0.4, 0.8], { hold: null, holdL: null }), st('reach_low', [1.8, 2.6], { cue: 'strap' }), st('turn_valve', [2, 3], { p: 0.4, cue: 'strap' }), st('wipe_surface', [2.4, 3], { p: 0.3 })], rest: [1.5, 3], idle: ['rub_neck', 'look_around'] },
  cart: { name: 'utility cart', props: ['cart'], stance: 'stand', box: [-0.48, 0.48, -0.3, 0.3], gap: 0.3, steps: [st('reach_low', [1.8, 2.4]), st('take_item', [1, 1.4], { hold: 'smallbox', pose: 'carry_front' }), wait([1, 2]), st('reach_low', [1.8, 2.4], { hold: null })], rest: [2, 4], idle: ['look_around'] },
  shuttle: { name: 'shuttlecraft', props: ['shuttle'], stance: 'stand', box: [-1.1, 1.65, -0.78, 0.78], gap: 0.35,
    steps: [st('check_tablet', [2.4, 3.6], { holdL: 'padd' }), st('look_up_screen', [1.6, 2.4], { holdL: null }), st('tool_work', [2.2, 3.4], { hold: 'tool', clip: 'fixing_kneeling', cue: 'clank' }), wait([0.5, 1], { hold: null }), st('wipe_surface', [2.4, 3.2], { p: 0.4 })], rest: [2, 4], idle: ['look_around', 'hands_on_hips'] },
  pad: { name: 'transporter pad', props: ['pad'], stance: 'stand', box: [-1.05, 1.05, -1.05, 1.05], gap: 0.3,
    steps: [st('check_tablet', [2.4, 3.6], { holdL: 'padd' }), st('scan_sweep', [2.4, 3.2], { hold: 'scanner', cue: 'scan' }), wait([0.5, 1], { hold: null, holdL: null }), st('reach_low', [1.8, 2.4], { p: 0.5 }), st('press_panel', [1.1, 1.5], { fx: 'pad', cue: 'beep' })], rest: [2, 4], idle: ['look_around', 'hands_behind_back'] },
  holocube: { name: 'holo-emitter', props: ['holocube'], stance: 'stand', box: [-0.55, 0.55, -0.55, 0.55], gap: 0.6, steps: [st('press_panel', [1.1, 1.6], { cue: 'beep' }), st('look_up_screen', [2, 3]), st('check_tablet', [2.4, 3.4], { holdL: 'padd' }), wait([0.4, 0.8], { holdL: null })], rest: [2, 4], idle: ['look_around', 'small_smile'] },
  cell: { name: 'brig cell', props: ['cell'], stance: 'stand', box: [-0.95, 0.95, -0.9, 0.6], gap: 0.45, spots: [[0, 1.05, PI]], steps: [st('hands_behind_back', [5, 8]), st('check_tablet', [2.4, 3.4], { holdL: 'padd' }), wait([0.4, 0.8], { holdL: null }), st('look_around', [2.2, 3.4])], rest: [3, 6], idle: ['cross_arms', 'head_tilt'] },
  weaponrack: { name: 'arms locker', props: ['weaponrack'], stance: 'stand', box: [-0.85, 0.85, -0.28, 0.3], gap: 0.32, spots: [[0, 0.65, PI]],
    steps: [st('press_panel', [1.1, 1.5], { cue: 'beep' }), st('reach_shelf', [1.6, 2.4]), st('take_item', [1, 1.4], { hold: 'zapper' }), st('inspect_item', [2, 3]), st('reach_shelf', [1.6, 2.4], { hold: null }), st('check_tablet', [2.4, 3.2], { holdL: 'padd', p: 0.6 }), wait([0.4, 0.8], { holdL: null })], rest: [2, 4], idle: ['cross_arms', 'look_around'] },
  suitrack: { name: 'suit locker', props: ['suitrack'], stance: 'stand', box: [-0.75, 0.75, -0.3, 0.3], gap: 0.32, spots: [[0, 0.65, PI]], steps: [st('reach_shelf', [1.6, 2.4]), st('inspect_item', [2, 3]), st('check_tablet', [2.4, 3.4], { holdL: 'padd', cue: 'beep' }), wait([0.4, 0.8], { holdL: null })], rest: [2, 4], idle: ['look_around'] },
  sinkunit: { name: 'wash basin', props: ['sinkunit'], stance: 'stand', box: [-0.78, 0.78, -0.28, 0.3], gap: 0.3, spots: [[-0.4, 0.62, PI], [0.4, 0.62, PI]], steps: [st('wipe_surface', [2.4, 3.4], { cue: 'water' }), st('look_up_screen', [1.4, 2]), st('adjust_collar', [1.3, 2])], rest: [2, 4], idle: ['look_around'] },
  tree: { name: 'arboretum bed', props: ['tree', 'plant'], stance: 'stand', box: [-0.6, 0.6, -0.6, 0.6], gap: 0.3, steps: [st('tend_plant', [2.2, 3.2]), st('inspect_item', [2, 3], { hold: 'vial', p: 0.4 }), wait([0.4, 0.8], { hold: null }), st('tend_plant', [2.2, 3.2], { clip: 'fixing_kneeling', p: 0.5 }), st('check_tablet', [2.4, 3.4], { holdL: 'padd', p: 0.4 }), wait([0.4, 0.8], { holdL: null })], rest: [2, 4], idle: ['look_around', 'small_smile'] },
  plant: { name: 'potted plant', props: ['plant'], stance: 'stand', box: [-0.3, 0.3, -0.3, 0.3], gap: 0.35, steps: [st('tend_plant', [2.2, 3.2]), wait([1, 2])], rest: [3, 6], idle: ['look_around'] },
  junction: { name: 'maintenance junction', props: [], stance: 'kneel', steps: [st('tool_work', [2.4, 3.6], { hold: 'tool', cue: 'clank', fx: 'sparks' }), st('inspect_item', [2, 3]), wait([1, 2]), st('tool_work', [2.4, 3.6]), wait([0.5, 1], { hold: null, clip: 'idle' }), st('check_tablet', [2.4, 3.4], { clip: 'idle', holdL: 'padd' }), wait([0.4, 0.8], { clip: 'idle', holdL: null })], rest: [1, 2.5], idle: ['rub_neck'] },
  counter: { name: 'galley counter', props: ['replicator', 'table'], stance: 'stand', box: [-0.75, 0.75, -0.5, 0.6], gap: 0.3, steps: [st('wipe_surface', [2.4, 3.4]), st('take_item', [1, 1.4], { hold: 'tray', pose: 'tray' }), st('turn_away', [1.4, 2.2]), wait([0.6, 1.2], { hold: null }), st('stir_pot', [2, 3], { p: 0.4 })], rest: [2, 4], idle: ['look_around', 'check_wrist'] },
  stove: { name: 'galley range', props: ['replicator'], stance: 'stand', box: [-0.75, 0.75, 0.19, 0.62], gap: 0.3, steps: [st('stir_pot', [2, 3], { hold: 'tool', cue: 'sizzle' }), st('lean_in', [2, 3]), st('stir_pot', [2, 3]), wait([0.4, 0.8], { hold: null }), st('wipe_surface', [2.4, 3.2], { p: 0.4 })], rest: [1.5, 3], idle: ['look_around'] },
  mat: { name: 'exercise mat', props: ['weightbench', 'treadmill'], stance: 'stand', box: [-0.4, 0.4, -0.9, 0.9], gap: 0.35, steps: [st('stretch', [2.6, 3.8]), st('neck_roll', [2, 3]), st('reach_low', [1.8, 2.6]), st('stretch', [2.6, 3.8])], rest: [1.5, 3], idle: ['sigh'] },
  post: { name: 'post', props: [], stance: 'stand', steps: [st('check_tablet', [2.4, 3.6], { holdL: 'padd' }), wait([0.5, 1], { holdL: null }), st('hands_behind_back', [4, 7], { p: 0.5 }), st('look_around', [2.2, 3.4])], rest: [3, 6], idle: ['weight_shift', 'adjust_collar', 'check_wrist'] },   // generic fallback: stand at your post, check a PADD
};
// schedule spots that are not prop kinds (assets/data/comms.json `day` blocks) -> an entry above; anything else -> 'post'
export const SPOT_ALIAS = { captain_chair: 'chair', 'command chair': 'chair', readyroom: 'desk', serving_line: 'counter', sink: 'sinkunit', door: 'post', corridor: 'post', lift: 'post' };
export const GENERIC = 'post';
export function equipKey(spot) { return EQUIPMENT[spot] ? spot : SPOT_ALIAS[spot] && EQUIPMENT[SPOT_ALIAS[spot]] ? SPOT_ALIAS[spot] : GENERIC; }
export function equipFor(spot) { return EQUIPMENT[equipKey(spot)]; }
export function propsFor(spot) { const k = equipKey(spot); return k === GENERIC && spot !== GENERIC ? [spot] : EQUIPMENT[k].props.length ? EQUIPMENT[k].props : [spot]; }

// ---- where the body goes: prop = { cx, cz, rot } (world centre + y rotation), from = { x, z } where the person arrived ----
export function standPoint(def, prop, from, taken = []) {   // taken: [[x, z], ...] use points other people already hold
  const c = Math.cos(prop.rot || 0), s = Math.sin(prop.rot || 0), toW = (lx, lz) => [prop.cx + lx * c + lz * s, prop.cz - lx * s + lz * c];   // three.js rotation.y
  let dx = from.x - prop.cx, dz = from.z - prop.cz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const y = def.y || 0;
  if (def.spots?.length) {   // the authored spot nearest to where they came in, unless it is round the far side
    let best = null, bd = 1e9; for (const sp of def.spots) { const [wx, wz] = toW(sp[0], sp[1]), d = Math.hypot(wx - from.x, wz - from.z) + (taken.some(t => Math.hypot(t[0] - wx, t[1] - wz) < 0.45) ? 50 : 0); if (d < bd) { bd = d; best = [wx, wz, sp[2] + (prop.rot || 0)]; } }
    if ((bd < Math.max(2.2, dl + 0.2) || !def.box) && bd < 50) return { x: best[0], z: best[1], yaw: best[2], y, spot: true };
  }
  const [x0, x1, z0, z1] = def.box || [-0.6, 0.6, -0.6, 0.6], lx = dx * c - dz * s, lz = dx * s + dz * c;   // approach direction in the prop's frame
  const tx = lx > 1e-6 ? x1 / lx : lx < -1e-6 ? x0 / lx : 1e9, tz = lz > 1e-6 ? z1 / lz : lz < -1e-6 ? z0 / lz : 1e9, t = Math.min(tx, tz, 1.15) + (def.gap ?? 0.3);
  let x = prop.cx + dx * t, z = prop.cz + dz * t; for (let k = 1; k < 4 && taken.some(q => Math.hypot(q[0] - x, q[1] - z) < 0.5); k++) { x += -dz * 0.6 * (k % 2 ? k : -k); z += dx * 0.6 * (k % 2 ? k : -k); }   // shoulder to shoulder
  return { x, z, yaw: Math.atan2(prop.cx - x, prop.cz - z), y };
}

// ---- use scripts: one cycle of steps with natural variation (optional steps, durations, an occasional idle gesture), deterministic ----
const pickRange = (r, u) => r[0] + (r[1] - r[0]) * u;
export function useScript(kind, person = { id: 0 }, seed = 1, cycle = 0) {
  const key = equipKey(kind), def = EQUIPMENT[key], pid = person?.id ?? 0, H = (...a) => hash01('op', seed, pid, key, cycle, ...a);
  const steps = [];   // a skipped optional step still puts away what it would have put away
  def.steps.forEach((s, i) => { if (s.p !== undefined && H('p', i) >= s.p) { if (s.hold === null || s.holdL === null) steps.push({ g: null, dur: 0.01, ...(s.hold === null ? { hold: null } : {}), ...(s.holdL === null ? { holdL: null } : {}), skip: true }); return; } steps.push({ ...s, i, dur: pickRange(s.dur, H('d', i)) }); });
  if (def.idle?.length && H('idle') < 0.45) { const g = def.idle[Math.floor(H('ig') * def.idle.length)]; const gd = GESTURES[g]; steps.splice(Math.floor(H('at') * (steps.length + 1)), 0, { g, dur: pickRange(gd.dur, H('igd')), idle: true }); }
  return { key, kind, def, stance: def.stance, clip: def.clip || STANCE_CLIP[def.stance], speed: def.speed || 1, steps, rest: pickRange(def.rest || [2, 4], H('rest')), restClip: def.restClip || null, cycle };
}

// ---- Operator: walks a person through use cycles. update(dt) -> the layer to apply this frame ----
//   clip/speed: the animation clip to play (base clip of the stance unless a step overrides); ch: semantic channels (HOLDS pose + gesture,
//   enveloped), face: morphs; hold/holdL: item id in the right / left hand (null = empty); cue/fx: one-shot on the frame a step starts.
export class Operator {
  constructor(kind, person = { id: 0 }, seed = 1, opts = {}) {
    this.kind = kind; this.key = equipKey(kind); this.person = person; this.seed = seed; this.loops = opts.loops ?? Infinity;
    this.cycle = 0; this.i = -1; this.t = 0; this.dur = 0; this.resting = false; this.done = false;
    this.hold = EQUIPMENT[this.key].hold || null; this.holdL = null; this.poseW = {}; this.script = useScript(kind, person, seed, 0);
    this.t = -hash01('op0', seed, person?.id ?? 0, this.key) * 1.5;   // a short settle before the first step, staggered per person
    this.cur = null;
  }
  _enter(i) {
    const s = this.script.steps[i]; this.i = i; this.t = 0; this.cur = s; this.dur = s.dur; let cue = s.cue || null, fx = s.fx || null;
    if (s.hold !== undefined) this.hold = s.hold; if (s.holdL !== undefined) this.holdL = s.holdL;
    if (s.g && !cue && GESTURES[s.g]?.cue && hash01('cue', this.seed, this.person?.id ?? 0, this.cycle, i) < 0.6) cue = GESTURES[s.g].cue;
    return { cue, fx };
  }
  update(dt) {
    const sc = this.script, out = { clip: sc.clip, speed: sc.speed, ch: {}, face: {}, hold: this.hold, holdL: this.holdL, cue: null, fx: null, gesture: null, step: 'settle', cycle: this.cycle, done: this.done };
    if (this.done) { out.step = 'done'; return out; }
    this.t += dt;
    if (this.t >= 0 && !this.resting && (this.i < 0 || this.t >= this.dur)) {   // next step (skip zero-length bookkeeping steps in one go)
      let n = this.i + 1, guard = 0;
      while (n < sc.steps.length && guard++ < 40) { const sn = sc.steps[n]; if (sn.needs && !sn.needs.includes(this.hold)) { n++; continue; } const e = this._enter(n); if (e.cue) out.cue = e.cue; if (e.fx) out.fx = e.fx; if (!sn.skip) break; n++; }
      if (n >= sc.steps.length) { this.resting = true; this.t = 0; this.dur = sc.rest; this.cur = null; }
    } else if (this.resting && this.t >= this.dur) {
      this.resting = false; this.cycle++; if (this.cycle >= this.loops) { this.done = true; this.hold = null; this.holdL = null; out.done = true; out.hold = out.holdL = null; out.step = 'done'; return out; }
      this.script = useScript(this.kind, this.person, this.seed, this.cycle); this.i = -1; this.t = 0; return this.update(0);
    }
    const s = this.resting ? null : this.cur;
    if (this.resting && sc.restClip) out.clip = sc.restClip;
    if (s) { if (s.clip) out.clip = s.clip; if (s.speed) out.speed = s.speed; out.step = s.g || 'wait'; }
    else if (this.resting) out.step = 'rest';
    // held pose: fade toward the step's pose (or the item's natural pose) at ~0.35 s
    const want = (s && s.pose) || (this.hold && ITEMS[this.hold]?.pose) || (this.holdL && ITEMS[this.holdL]?.pose) || null, k = Math.min(1, dt / 0.35 || 0);
    if (want && !(want in this.poseW)) this.poseW[want] = 0;
    for (const id in this.poseW) { this.poseW[id] += ((id === want ? 1 : 0) - this.poseW[id]) * k; if (id !== want && this.poseW[id] < 0.01) { delete this.poseW[id]; continue; } const P = HOLDS[id]; for (const c in P) out.ch[c] = (out.ch[c] || 0) + P[c] * this.poseW[id]; }
    if (s && s.g && GESTURES[s.g]) {   // keyframed gesture with soft in/out
      const g = GESTURES[s.g], u = Math.max(0, Math.min(1, this.t / this.dur)), env = Math.min(1, u / 0.12, (1 - u) / 0.15), w = env * env * (3 - 2 * env), smp = sample(g, u);
      for (const c in smp.ch) out.ch[c] = (out.ch[c] || 0) * (1 - w) + smp.ch[c] * w; for (const f in smp.face) out.face[f] = smp.face[f] * w; out.gesture = s.g;   // the gesture takes over channels a held pose also drives (no double bends)
    }
    out.hold = this.hold; out.holdL = this.holdL; return out;
  }
  describe() { return `${this.key} c${this.cycle} ${this.resting ? 'rest' : this.cur ? (this.cur.g || 'wait') : 'settle'}${this.hold ? ' R:' + this.hold : ''}${this.holdL ? ' L:' + this.holdL : ''}`; }
}

// ---- things you can pick up and carry. w kg (player slow-down above ~5 kg), two = both hands, pose = HOLDS while held.
//      Payoffs: tool (repair hold-E speed multiplier), heal (treat a crew member), gift (trust when handed over), load (fits on a cart)
export const ITEMS = {
  cup: { name: 'mug of coffee', w: 0.4, pose: 'hold_cup', gift: 0.1, hand: 'r' },
  glass: { name: 'glass of synthehol', w: 0.3, pose: 'hold_cup', gift: 0.08, hand: 'r' },
  tray: { name: 'meal tray', w: 1.2, two: true, pose: 'tray', gift: 0.12 },
  ration: { name: 'ration bar', w: 0.2, pose: 'hold_r', gift: 0.05, hand: 'r' },
  padd: { name: 'PADD', w: 0.3, pose: 'hold_padd', hand: 'l' },
  tool: { name: 'hydrospanner', w: 0.9, pose: 'hold_r', tool: 1.12, hand: 'r' },
  toolbox: { name: 'toolbox', w: 5, pose: 'hold_r', tool: 1.25, hand: 'r', load: true },
  medkit: { name: 'medkit', w: 2.5, pose: 'hold_r', heal: true, hand: 'r', load: true },
  scanner: { name: 'medical scanner', w: 0.5, pose: 'hold_r', hand: 'r' },
  vial: { name: 'sample vial', w: 0.1, pose: 'hold_r', hand: 'r' },
  chip: { name: 'isolinear chip', w: 0.05, pose: 'hold_r', hand: 'r' },
  zapper: { name: 'zapper', w: 0.8, pose: 'hold_r', hand: 'r' },
  dumbbell: { name: 'dumbbell', w: 6, pose: null, hand: 'r' },
  linen: { name: 'folded linen', w: 2, two: true, pose: 'carry_front', gift: 0.03, load: true },
  smallbox: { name: 'parts box', w: 4, two: true, pose: 'carry_front', load: true },
  crate: { name: 'supply crate', w: 14, two: true, pose: 'carry_front', load: true },
  hose: { name: 'hose coil', w: 6, pose: 'hold_r', hand: 'r', load: true },
};
export const ITEM_IDS = Object.keys(ITEMS);
// player speed multiplier for carrying an item (crates slow you, small things do not)
export const carrySlow = (id) => { const w = ITEMS[id]?.w || 0; return w <= 3 ? 1 : Math.max(0.72, 1 - (w - 3) * 0.02); };
// which carry item a loose clutter name (ship inventory) is, by keywords; null = a generic small item
const KEYWORDS = [[/tool ?box|tool ?kit|tool ?case/i, 'toolbox'], [/med ?kit|first.?aid|trauma kit|medical kit|hypospray|dermal|bandage|medpac/i, 'medkit'], [/spanner|wrench|driver|pliers|probe|torch|cutter|hammer|calibrat|tool/i, 'tool'],
  [/padd|tablet|data ?pad|clipboard|manual|log ?book/i, 'padd'], [/mug|cup|coffee|tea\b|flask|thermos/i, 'cup'], [/glass|bottle|synthehol|wine|drink/i, 'glass'], [/tray|plate|meal|bowl|food|soup/i, 'tray'],
  [/ration|snack|bar\b|biscuit|nutrient/i, 'ration'], [/hose|cable|coil|line\b/i, 'hose'], [/crate|container|cargo|drum|canister/i, 'crate'], [/box|case|carton|parts|spares|kit/i, 'smallbox'], [/vial|sample|specimen|tube/i, 'vial'],
  [/chip|isolinear|module|card/i, 'chip'], [/scanner|tricorder/i, 'scanner'], [/linen|towel|blanket|sheet|uniform|laundry/i, 'linen']];
export function classifyItem(name = '', real = '') { const s = name + ' ' + real; for (const [re, id] of KEYWORDS) if (re.test(s)) return id; return null; }

// ---- carts and who hauls them (billet keys from docs/crew-sim). from/to = room types; 'lift' = the tubelift door on this deck ----
export const CARTS = {
  cargo: { name: 'cargo cart', w: 0.9, l: 1.3, handle: 0.95, load: ['crate', 'crate', 'smallbox'] },
  med: { name: 'medical trolley', w: 0.6, l: 0.9, handle: 0.7, load: ['medkit', 'scanner', 'linen'] },
  tool: { name: 'tool cart', w: 0.6, l: 0.95, handle: 0.72, load: ['toolbox', 'hose', 'smallbox'] },
};
export const HAULERS = {
  cargo: { cart: 'cargo', to: ['stores', 'shuttlebay', 'transporter', 'cargo', 'lift'] }, qm: { cart: 'cargo', to: ['stores', 'cargo', 'mess', 'lift'] },
  deck: { cart: 'cargo', to: ['shuttlebay', 'cargo', 'lift'] }, dc: { cart: 'tool', to: ['plant', 'workshop', 'engineering', 'stores'] },
  galley: { cart: 'cargo', carry: 'tray', to: ['mess', 'stores', 'lounge'] }, cook: { cart: null, carry: 'tray', to: ['mess', 'lounge'] }, rep: { cart: 'cargo', to: ['mess', 'stores', 'workshop'] },
  nurse: { cart: 'med', to: ['sickbay', 'lab', 'morgue', 'stores'] }, medtech: { cart: 'med', to: ['sickbay', 'lab', 'morgue'] }, doc: { cart: 'med', to: ['sickbay', 'morgue', 'lab'] },
  eps: { cart: 'tool', to: ['engineering', 'plant', 'workshop'] }, ttech: { cart: 'tool', to: ['transporter', 'workshop', 'engineering'] }, env: { cart: 'tool', to: ['plant', 'engineering', 'arboretum'] },
  reactor: { cart: 'tool', to: ['engineering', 'workshop'] }, bot: { cart: null, carry: 'smallbox', to: ['arboretum', 'lab'] }, lab: { cart: null, carry: 'smallbox', to: ['lab', 'stores'] },
};
// whether a held item list is consistent with hands: two-handed items fill both
export function handsFor(id) { const it = ITEMS[id]; return !it ? [] : it.two ? ['hand_r', 'hand_l'] : [it.hand === 'l' ? 'hand_l' : 'hand_r']; }
export { curveAt };
