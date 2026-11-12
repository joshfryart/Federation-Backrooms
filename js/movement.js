// Human movement library: small gestures, idle behaviours and fidgets that make standing, sitting, working and walking people look alive.
// Pure logic (no three.js, no DOM): gestures are keyframed *semantic joint channels* (radians) that the renderer maps onto bones through RIG.
//   RIG        semantic channel -> { bone, axis (0 x, 1 y, 2 z), sign }.  Calibrate the rig in ONE place if a gesture bends the wrong way.
//   GESTURES   the library (id -> { states, dur, weight, ch, face, cue }); state 'operating' = equipment use only (js/equipment.js)
//   HOLDS      static held poses (carrying a box, a cup, a PADD…) blended in by use scripts and carriers
//   new Fidgeter(person, seed).update(dt, ctx) -> { bones: { boneName: [x,y,z] }, face: { morph: w }, cue }   layer to add on top of the animation clip
//   sample(gesture, u)   evaluate a gesture at 0..1;   describe(f)   what the fidgeter is doing now
import { hash, hash01 } from './clock.js';

// ---- rig map: semantic channel -> bone rotation (calibrated against the MakeHuman / UAL skeleton) ----
export const RIG = {   // calibrated against the rendered skeleton (positive = nod chin down, turn/tilt/lean toward the character's LEFT, arm_fwd forward, arm_out away from the body, elbow bends forward/up, shrug up, thigh knee forward, foot toes up)
  head_nod: { bone: 'Head', axis: 0, sign: 1 }, head_turn: { bone: 'Head', axis: 1, sign: 1 },
  head_tilt: { bone: 'Head', axis: 2, sign: -1 }, neck_nod: { bone: 'neck_01', axis: 0, sign: 1 },
  neck_turn: { bone: 'neck_01', axis: 1, sign: 1 }, neck_tilt: { bone: 'neck_01', axis: 2, sign: -1 },
  spine_bow: { bone: 'spine_03', axis: 0, sign: 1 }, spine_twist: { bone: 'spine_03', axis: 1, sign: 1 },
  spine_lean: { bone: 'spine_03', axis: 2, sign: -1 }, waist_bow: { bone: 'spine_02', axis: 0, sign: 1 },
  waist_twist: { bone: 'spine_02', axis: 1, sign: 1 }, waist_lean: { bone: 'spine_02', axis: 2, sign: -1 },
  pelvis_roll: { bone: 'pelvis', axis: 2, sign: -1 }, pelvis_twist: { bone: 'pelvis', axis: 1, sign: 1 },
  shrug_l: { bone: 'clavicle_l', axis: 0, sign: 1 }, shrug_r: { bone: 'clavicle_r', axis: 0, sign: 1 },
  arm_fwd_l: { bone: 'upperarm_l', axis: 0, sign: 1 }, arm_fwd_r: { bone: 'upperarm_r', axis: 0, sign: 1 },
  arm_out_l: { bone: 'upperarm_l', axis: 2, sign: 1 }, arm_out_r: { bone: 'upperarm_r', axis: 2, sign: -1 },
  arm_twist_l: { bone: 'upperarm_l', axis: 1, sign: -1 }, arm_twist_r: { bone: 'upperarm_r', axis: 1, sign: 1 },
  elbow_l: { bone: 'lowerarm_l', axis: 0, sign: 1 }, elbow_r: { bone: 'lowerarm_r', axis: 0, sign: 1 },
  wrist_l: { bone: 'hand_l', axis: 0, sign: 1 }, wrist_r: { bone: 'hand_r', axis: 0, sign: 1 },
  thigh_l: { bone: 'thigh_l', axis: 0, sign: -1 }, thigh_r: { bone: 'thigh_r', axis: 0, sign: -1 },
  foot_l: { bone: 'foot_l', axis: 0, sign: -1 }, foot_r: { bone: 'foot_r', axis: 0, sign: -1 },
};
export const BONES = [...new Set(Object.values(RIG).map(r => r.bone))];

// keyframe helper: K([t, v], ...) with t in 0..1; smooth between keys, holds outside
const K = (...k) => k;
const S = ['standing', 'walking', 'sitting', 'working', 'talking'];     // contexts a gesture can run in

// ---- the library. dur = seconds [min,max]; weight = base chance; face morphs use the MakeHuman names already used in js/humans.js ----
export const GESTURES = {
  // head and face only (safe everywhere)
  look_around: { states: ['standing', 'walking', 'working', 'sitting'], dur: [2.2, 3.6], weight: 3, ch: { head_turn: K([0, 0], [0.25, 0.55], [0.5, 0.55], [0.75, -0.5], [1, 0]), neck_turn: K([0, 0], [0.25, 0.25], [0.5, 0.25], [0.75, -0.2], [1, 0]), head_nod: K([0, 0], [0.5, 0.05], [1, 0]) } },
  glance_back: { states: ['walking', 'standing'], dur: [1.0, 1.6], weight: 1.2, ch: { head_turn: K([0, 0], [0.3, 0.8], [0.7, 0.8], [1, 0]), neck_turn: K([0, 0], [0.3, 0.3], [0.7, 0.3], [1, 0]) } },
  nod: { states: ['standing', 'talking', 'sitting', 'working'], dur: [0.7, 1.0], weight: 1.5, ch: { head_nod: K([0, 0], [0.25, 0.22], [0.5, 0], [0.75, 0.2], [1, 0]) } },
  head_tilt: { states: ['standing', 'talking', 'sitting', 'working'], dur: [1.5, 2.6], weight: 1.4, ch: { head_tilt: K([0, 0], [0.3, 0.16], [0.7, 0.16], [1, 0]), neck_tilt: K([0, 0], [0.3, 0.08], [0.7, 0.08], [1, 0]) } },
  shake_head: { states: ['standing', 'talking', 'sitting', 'working'], dur: [0.9, 1.3], weight: 0.6, ch: { head_turn: K([0, 0], [0.2, 0.3], [0.4, -0.3], [0.6, 0.25], [0.8, -0.2], [1, 0]) } },
  eyebrow_raise: { states: S, dur: [0.8, 1.4], weight: 1, face: { LeftInnerBrowUp: K([0, 0], [0.3, 0.8], [0.7, 0.8], [1, 0]), RightInnerBrowUp: K([0, 0], [0.3, 0.8], [0.7, 0.8], [1, 0]) } },
  small_smile: { states: S, dur: [1.4, 2.6], weight: 1.2, face: { Smile: K([0, 0], [0.3, 0.55], [0.75, 0.55], [1, 0]) } },
  frown: { states: S, dur: [1.4, 2.4], weight: 0.6, mood: 'stress', face: { Frown: K([0, 0], [0.3, 0.6], [0.75, 0.6], [1, 0]), LeftInnerBrowUp: K([0, 0], [0.3, 0.4], [0.75, 0.4], [1, 0]) } },
  slow_blink: { states: S, dur: [0.7, 1.0], weight: 0.9, mood: 'tired', face: { LeftUpperLidClosed: K([0, 0], [0.3, 1], [0.6, 1], [1, 0]), RightUpperLidClosed: K([0, 0], [0.3, 1], [0.6, 1], [1, 0]) }, ch: { head_nod: K([0, 0], [0.4, 0.1], [1, 0]) } },
  yawn: { states: ['standing', 'sitting', 'working'], dur: [2.4, 3.4], weight: 1, mood: 'tired', cue: 'yawn', face: { JawDrop: K([0, 0], [0.25, 0.9], [0.65, 0.9], [1, 0]), LeftUpperLidClosed: K([0, 0], [0.25, 0.9], [0.65, 0.9], [1, 0]), RightUpperLidClosed: K([0, 0], [0.25, 0.9], [0.65, 0.9], [1, 0]) }, ch: { head_nod: K([0, 0], [0.3, -0.25], [0.65, -0.25], [1, 0]), spine_bow: K([0, 0], [0.3, -0.12], [0.65, -0.12], [1, 0]), elbow_r: K([0, 0], [0.3, 1.6], [0.65, 1.6], [1, 0]), arm_fwd_r: K([0, 0], [0.3, 0.8], [0.65, 0.8], [1, 0]) } },
  // posture and breathing
  weight_shift: { states: ['standing', 'talking', 'working'], dur: [2.0, 3.4], weight: 3, ch: { pelvis_roll: K([0, 0], [0.4, 0.07], [0.7, 0.07], [1, 0]), spine_lean: K([0, 0], [0.4, -0.05], [0.7, -0.05], [1, 0]), thigh_l: K([0, 0], [0.4, 0.05], [0.7, 0.05], [1, 0]) } },
  lean_back: { states: ['standing', 'talking'], dur: [2.5, 4], weight: 0.8, ch: { spine_bow: K([0, 0], [0.4, -0.1], [0.75, -0.1], [1, 0]), head_nod: K([0, 0], [0.4, 0.06], [0.75, 0.06], [1, 0]) } },
  sigh: { states: ['standing', 'sitting', 'working', 'walking'], dur: [1.8, 2.6], weight: 1, mood: 'stress', cue: 'sigh', face: { JawDrop: K([0, 0], [0.3, 0.25], [0.6, 0.15], [1, 0]) }, ch: { arm_out_r: K([0, 0], [0.3, -0.12], [0.75, -0.12], [1, 0]), arm_out_l: K([0, 0], [0.3, -0.12], [0.75, -0.12], [1, 0]), spine_bow: K([0, 0], [0.25, -0.09], [0.5, 0.1], [1, 0]), shrug_l: K([0, 0], [0.25, 0.12], [0.55, -0.04], [1, 0]), shrug_r: K([0, 0], [0.25, 0.12], [0.55, -0.04], [1, 0]), head_nod: K([0, 0], [0.5, 0.14], [1, 0]) } },
  shrug: { states: ['standing', 'talking', 'sitting'], dur: [1.0, 1.6], weight: 0.8, ch: { elbow_r: K([0, 0], [0.3, 0.5], [0.75, 0.5], [1, 0]), elbow_l: K([0, 0], [0.3, 0.5], [0.75, 0.5], [1, 0]), shrug_l: K([0, 0], [0.3, 0.3], [0.65, 0.3], [1, 0]), shrug_r: K([0, 0], [0.3, 0.3], [0.65, 0.3], [1, 0]), head_tilt: K([0, 0], [0.3, 0.1], [0.65, 0.1], [1, 0]), arm_out_l: K([0, 0], [0.3, -0.3], [0.65, -0.3], [1, 0]), arm_out_r: K([0, 0], [0.3, -0.3], [0.65, -0.3], [1, 0]) } },
  stretch: { arm_fwd_r: K([0, 0], [0.3, -0.1], [0.75, -0.1], [1, 0]), arm_fwd_l: K([0, 0], [0.3, -0.1], [0.75, -0.1], [1, 0]), states: ['standing', 'sitting', 'working'], dur: [2.6, 3.8], weight: 0.7, mood: 'tired', cue: 'groan', ch: { spine_bow: K([0, 0], [0.3, -0.18], [0.7, -0.18], [1, 0]), head_nod: K([0, 0], [0.3, -0.2], [0.7, -0.2], [1, 0]), arm_out_l: K([0, 0], [0.3, 1.9], [0.7, 1.9], [1, 0]), arm_out_r: K([0, 0], [0.3, 1.9], [0.7, 1.9], [1, 0]), shrug_l: K([0, 0], [0.3, 0.1], [0.7, 0.1], [1, 0]), shrug_r: K([0, 0], [0.3, 0.1], [0.7, 0.1], [1, 0]) } },
  neck_roll: { states: ['standing', 'sitting', 'working'], dur: [2.0, 3.0], weight: 0.6, mood: 'tired', ch: { head_tilt: K([0, 0], [0.25, 0.25], [0.5, 0], [0.75, -0.25], [1, 0]), head_nod: K([0, 0], [0.25, 0.04], [0.5, 0.16], [0.75, 0.04], [1, 0]) } },
  // arm gestures (calibrated through RIG)
  rub_neck: { states: ['standing', 'sitting', 'working', 'talking'], dur: [2.0, 3.2], weight: 1, mood: 'stress', habit: 'rubs-neck', ch: { arm_fwd_r: K([0, 0], [0.25, 0.9], [0.8, 0.9], [1, 0]), arm_out_r: K([0, 0], [0.25, 0.3], [0.8, 0.3], [1, 0]), elbow_r: K([0, 0], [0.25, 2.1], [0.8, 2.1], [1, 0]), head_tilt: K([0, 0], [0.3, -0.15], [0.8, -0.15], [1, 0]), head_nod: K([0, 0], [0.3, 0.12], [0.8, 0.12], [1, 0]), wrist_r: K([0, 0], [0.3, 0.2], [0.5, -0.2], [0.7, 0.2], [0.9, -0.2], [1, 0]) } },
  scratch_head: { states: ['standing', 'sitting', 'working', 'talking'], dur: [1.8, 2.8], weight: 0.9, ch: { arm_fwd_l: K([0, 0], [0.25, 1.3], [0.8, 1.3], [1, 0]), arm_out_l: K([0, 0], [0.25, 0.6], [0.8, 0.6], [1, 0]), elbow_l: K([0, 0], [0.25, 1.9], [0.8, 1.9], [1, 0]), wrist_l: K([0, 0], [0.3, 0.3], [0.45, -0.3], [0.6, 0.3], [0.75, -0.3], [0.9, 0.3], [1, 0]), head_tilt: K([0, 0], [0.3, 0.12], [0.8, 0.12], [1, 0]) } },
  adjust_collar: { states: ['standing', 'walking', 'talking', 'working'], dur: [1.3, 2.0], weight: 1, habit: 'adjusts-collar', ch: { arm_fwd_r: K([0, 0], [0.3, 0.7], [0.75, 0.7], [1, 0]), elbow_r: K([0, 0], [0.3, 2.0], [0.75, 2.0], [1, 0]), head_nod: K([0, 0], [0.3, 0.1], [0.75, 0.1], [1, 0]), head_turn: K([0, 0], [0.3, -0.1], [0.75, -0.1], [1, 0]) } },
  check_badge: { states: ['standing', 'walking', 'talking'], dur: [1.4, 2.0], weight: 0.9, habit: 'checks-badge', ch: { arm_fwd_l: K([0, 0], [0.3, 0.35], [0.75, 0.35], [1, 0]), elbow_l: K([0, 0], [0.3, 1.3], [0.75, 1.3], [1, 0]), head_nod: K([0, 0], [0.3, 0.3], [0.75, 0.3], [1, 0]) } },
  check_wrist: { states: ['standing', 'walking', 'talking', 'working'], dur: [1.2, 1.8], weight: 0.9, mood: 'late', ch: { arm_twist_l: K([0, 0], [0.3, -0.6], [0.75, -0.6], [1, 0]), arm_fwd_l: K([0, 0], [0.3, 0.4], [0.75, 0.4], [1, 0]), elbow_l: K([0, 0], [0.3, 1.6], [0.75, 1.6], [1, 0]), head_nod: K([0, 0], [0.3, 0.25], [0.75, 0.25], [1, 0]), wrist_l: K([0, 0], [0.3, -0.4], [0.75, -0.4], [1, 0]) } },
  cross_arms: { states: ['standing', 'talking'], dur: [4, 8], weight: 0.8, habit: 'parade-rest', ch: { arm_twist_r: K([0, 0], [0.3, -0.9], [0.75, -0.9], [1, 0]), arm_twist_l: K([0, 0], [0.3, -0.9], [0.75, -0.9], [1, 0]), arm_fwd_l: K([0, 0], [0.2, 0.3], [0.85, 0.3], [1, 0]), arm_fwd_r: K([0, 0], [0.2, 0.45], [0.85, 0.45], [1, 0]), elbow_l: K([0, 0], [0.2, 1.5], [0.85, 1.5], [1, 0]), elbow_r: K([0, 0], [0.2, 1.5], [0.85, 1.5], [1, 0]), arm_out_l: K([0, 0], [0.2, 0], [0.85, 0], [1, 0]), arm_out_r: K([0, 0], [0.2, 0], [0.85, 0], [1, 0]) } },
  hands_on_hips: { states: ['standing', 'talking'], dur: [3, 6], weight: 0.6, ch: { arm_twist_r: K([0, 0], [0.3, -0.3], [0.75, -0.3], [1, 0]), arm_twist_l: K([0, 0], [0.3, -0.3], [0.75, -0.3], [1, 0]), arm_fwd_r: K([0, 0], [0.3, -0.2], [0.75, -0.2], [1, 0]), arm_fwd_l: K([0, 0], [0.3, -0.2], [0.75, -0.2], [1, 0]), arm_out_l: K([0, 0], [0.2, 0.5], [0.85, 0.5], [1, 0]), arm_out_r: K([0, 0], [0.2, 0.5], [0.85, 0.5], [1, 0]), elbow_l: K([0, 0], [0.2, 1.1], [0.85, 1.1], [1, 0]), elbow_r: K([0, 0], [0.2, 1.1], [0.85, 1.1], [1, 0]) } },
  hands_behind_back: { states: ['standing', 'talking'], dur: [5, 10], weight: 0.6, habit: 'parade-rest', ch: { arm_fwd_l: K([0, 0], [0.2, -0.35], [0.85, -0.35], [1, 0]), arm_fwd_r: K([0, 0], [0.2, -0.35], [0.85, -0.35], [1, 0]), elbow_l: K([0, 0], [0.2, 0.9], [0.85, 0.9], [1, 0]), elbow_r: K([0, 0], [0.2, 0.9], [0.85, 0.9], [1, 0]), spine_bow: K([0, 0], [0.2, -0.04], [0.85, -0.04], [1, 0]) } },
  crack_knuckles: { states: ['standing', 'working'], dur: [1.6, 2.4], weight: 0.5, habit: 'cracks-knuckles', cue: 'knuckles', ch: { arm_twist_r: K([0, 0], [0.3, -0.5], [0.75, -0.5], [1, 0]), arm_twist_l: K([0, 0], [0.3, -0.5], [0.75, -0.5], [1, 0]), arm_fwd_l: K([0, 0], [0.25, 0.5], [0.75, 0.5], [1, 0]), arm_fwd_r: K([0, 0], [0.25, 0.5], [0.75, 0.5], [1, 0]), elbow_l: K([0, 0], [0.25, 1.5], [0.75, 1.5], [1, 0]), elbow_r: K([0, 0], [0.25, 1.5], [0.75, 1.5], [1, 0]), wrist_l: K([0, 0], [0.4, 0.3], [0.5, -0.1], [0.6, 0.3], [1, 0]), wrist_r: K([0, 0], [0.4, 0.3], [0.5, -0.1], [0.6, 0.3], [1, 0]) } },
  cough: { states: ['standing', 'walking', 'sitting', 'working'], dur: [1.0, 1.6], weight: 0.4, cue: 'cough', ch: { spine_bow: K([0, 0], [0.2, 0.2], [0.3, 0.05], [0.4, 0.2], [0.5, 0.05], [1, 0]), head_nod: K([0, 0], [0.2, 0.22], [0.4, 0.22], [1, 0]), arm_fwd_r: K([0, 0], [0.2, 0.9], [0.8, 0.9], [1, 0]), elbow_r: K([0, 0], [0.2, 1.7], [0.8, 1.7], [1, 0]) } },
  tap_foot: { states: ['standing', 'talking', 'working'], dur: [2.4, 4], weight: 0.9, mood: 'stress', ch: { foot_r: K([0, 0], [0.1, 0.25], [0.2, 0], [0.3, 0.25], [0.4, 0], [0.5, 0.25], [0.6, 0], [0.7, 0.25], [0.8, 0], [1, 0]), pelvis_roll: K([0, 0], [0.2, 0.02], [0.9, 0.02], [1, 0]) } },
  // working / sitting
  tap_console: { states: ['working'], dur: [2.0, 3.4], weight: 3, habit: 'taps-console', ch: { elbow_r: K([0, 0], [0.3, 1.2], [0.75, 1.2], [1, 0]), arm_fwd_r: K([0, 0], [0.2, 0.5], [0.8, 0.5], [1, 0]), wrist_r: K([0, 0], [0.15, 0.25], [0.3, -0.1], [0.45, 0.25], [0.6, -0.1], [0.75, 0.25], [0.9, -0.1], [1, 0]), head_nod: K([0, 0], [0.3, 0.08], [0.8, 0.08], [1, 0]) } },
  lean_in: { states: ['working', 'sitting'], dur: [2.5, 5], weight: 1.5, ch: { spine_bow: K([0, 0], [0.3, 0.12], [0.8, 0.12], [1, 0]), head_nod: K([0, 0], [0.3, 0.1], [0.8, 0.1], [1, 0]) } },
  rub_eyes: { states: ['working', 'sitting', 'standing'], dur: [1.8, 2.6], weight: 0.8, mood: 'tired', ch: { arm_fwd_r: K([0, 0], [0.25, 1.1], [0.8, 1.1], [1, 0]), elbow_r: K([0, 0], [0.25, 1.7], [0.8, 1.7], [1, 0]), head_nod: K([0, 0], [0.3, 0.14], [0.8, 0.14], [1, 0]), wrist_r: K([0, 0], [0.3, 0.2], [0.5, -0.2], [0.7, 0.2], [0.9, -0.2], [1, 0]) }, face: { LeftUpperLidClosed: K([0, 0], [0.25, 1], [0.8, 1], [1, 0]), RightUpperLidClosed: K([0, 0], [0.25, 1], [0.8, 1], [1, 0]) } },
  swing_legs: { states: ['sitting'], dur: [2.5, 4], weight: 1, mood: 'bored', ch: { thigh_l: K([0, 0], [0.25, 0.1], [0.5, -0.05], [0.75, 0.1], [1, 0]), thigh_r: K([0, 0], [0.25, -0.05], [0.5, 0.1], [0.75, -0.05], [1, 0]) } },
  // talking beats (small hand/head emphasis while someone speaks)
  talk_emphasis: { states: ['talking'], dur: [0.9, 1.5], weight: 3, ch: { arm_fwd_r: K([0, 0], [0.25, 0.55], [0.5, 0.4], [0.75, 0.6], [1, 0]), elbow_r: K([0, 0], [0.25, 1.5], [0.75, 1.5], [1, 0]), head_nod: K([0, 0], [0.3, 0.12], [0.6, 0], [0.85, 0.1], [1, 0]), wrist_r: K([0, 0], [0.3, 0.2], [0.6, -0.15], [1, 0]) } },
  // equipment use (state 'operating': only js/equipment.js use scripts play these, the fidgeter never picks them)
  press_panel: { states: ['operating'], dur: [1.1, 1.7], weight: 1, cue: 'beep', ch: { arm_fwd_r: K([0, 0], [0.3, 1.15], [0.7, 1.15], [1, 0]), elbow_r: K([0, 0], [0.3, 0.55], [0.7, 0.55], [1, 0]), wrist_r: K([0, 0], [0.4, 0], [0.48, -0.3], [0.56, 0], [1, 0]), head_nod: K([0, 0], [0.3, 0.06], [0.7, 0.06], [1, 0]) } },
  type_keys: { states: ['operating'], dur: [2.4, 4.2], weight: 1, cue: 'keys', ch: { arm_fwd_r: K([0, 0], [0.2, 0.45], [0.8, 0.45], [1, 0]), arm_fwd_l: K([0, 0], [0.2, 0.45], [0.8, 0.45], [1, 0]), elbow_r: K([0, 0], [0.2, 1.3], [0.8, 1.3], [1, 0]), elbow_l: K([0, 0], [0.2, 1.3], [0.8, 1.3], [1, 0]), wrist_r: K([0, 0], [0.25, 0.2], [0.35, -0.1], [0.45, 0.2], [0.55, -0.1], [0.65, 0.2], [0.75, -0.1], [1, 0]), wrist_l: K([0, 0], [0.3, -0.1], [0.4, 0.2], [0.5, -0.1], [0.6, 0.2], [0.7, -0.1], [1, 0]), head_nod: K([0, 0], [0.25, 0.16], [0.8, 0.16], [1, 0]) } },
  look_up_screen: { states: ['operating'], dur: [2.0, 3.4], weight: 1, ch: { head_nod: K([0, 0], [0.3, -0.24], [0.75, -0.24], [1, 0]), neck_nod: K([0, 0], [0.3, -0.08], [0.75, -0.08], [1, 0]), spine_bow: K([0, 0], [0.3, -0.05], [0.75, -0.05], [1, 0]) } },
  reach_shelf: { states: ['operating'], dur: [1.6, 2.4], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.35, 2.0], [0.6, 2.0], [1, 0]), elbow_r: K([0, 0], [0.35, 0.3], [0.6, 0.5], [1, 0]), wrist_r: K([0, 0], [0.45, -0.3], [0.6, 0.2], [1, 0]), head_nod: K([0, 0], [0.35, -0.22], [0.6, -0.22], [1, 0]), spine_bow: K([0, 0], [0.35, -0.06], [0.6, -0.06], [1, 0]) } },
  reach_low: { states: ['operating'], dur: [1.8, 2.6], weight: 1, cue: 'groan', ch: { waist_bow: K([0, 0], [0.35, 0.45], [0.65, 0.45], [1, 0]), spine_bow: K([0, 0], [0.35, 0.22], [0.65, 0.22], [1, 0]), arm_fwd_r: K([0, 0], [0.35, 0.75], [0.65, 0.75], [1, 0]), elbow_r: K([0, 0], [0.35, 0.2], [0.65, 0.2], [1, 0]), head_nod: K([0, 0], [0.35, 0.2], [0.65, 0.2], [1, 0]) } },
  take_item: { states: ['operating'], dur: [1.0, 1.4], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.4, 1.0], [0.7, 0.5], [1, 0]), elbow_r: K([0, 0], [0.4, 0.3], [0.7, 1.2], [1, 0]), spine_bow: K([0, 0], [0.4, 0.08], [1, 0]) } },
  inspect_item: { states: ['operating'], dur: [2.0, 3.2], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.25, 0.75], [0.8, 0.75], [1, 0]), elbow_r: K([0, 0], [0.25, 1.7], [0.8, 1.7], [1, 0]), arm_twist_r: K([0, 0], [0.3, -0.35], [0.55, 0.2], [0.8, -0.3], [1, 0]), head_nod: K([0, 0], [0.25, 0.28], [0.8, 0.28], [1, 0]), head_tilt: K([0, 0], [0.4, 0.12], [0.7, -0.05], [1, 0]) } },
  sip: { states: ['operating'], dur: [1.6, 2.4], weight: 1, cue: 'sip', ch: { arm_fwd_r: K([0, 0], [0.35, 0.6], [0.65, 0.6], [1, 0]), elbow_r: K([0, 0], [0.35, 2.2], [0.65, 2.2], [1, 0]), arm_out_r: K([0, 0], [0.35, 0.15], [0.65, 0.15], [1, 0]), head_nod: K([0, 0], [0.4, -0.18], [0.6, -0.18], [1, 0]) } },
  scan_sweep: { states: ['operating'], dur: [2.4, 3.6], weight: 1, cue: 'scan', ch: { arm_fwd_r: K([0, 0], [0.2, 0.85], [0.85, 0.85], [1, 0]), elbow_r: K([0, 0], [0.2, 0.6], [0.85, 0.6], [1, 0]), spine_twist: K([0, 0], [0.25, 0.22], [0.75, -0.22], [1, 0]), head_turn: K([0, 0], [0.25, 0.3], [0.75, -0.3], [1, 0]), head_nod: K([0, 0], [0.2, 0.28], [0.85, 0.28], [1, 0]) } },
  curl_weights: { states: ['operating'], dur: [2.4, 3.4], weight: 1, cue: 'groan', ch: { elbow_r: K([0, 0], [0.25, 1.9], [0.5, 0.2], [0.75, 1.9], [1, 0]), elbow_l: K([0, 0], [0.25, 1.9], [0.5, 0.2], [0.75, 1.9], [1, 0]), arm_fwd_r: K([0, 0], [0.25, 0.2], [0.75, 0.2], [1, 0]), arm_fwd_l: K([0, 0], [0.25, 0.2], [0.75, 0.2], [1, 0]), spine_bow: K([0, 0], [0.25, -0.06], [0.5, 0], [0.75, -0.06], [1, 0]) } },
  tool_work: { states: ['operating'], dur: [2.0, 3.2], weight: 1, cue: 'clank', ch: { arm_fwd_r: K([0, 0], [0.2, 0.65], [0.85, 0.65], [1, 0]), elbow_r: K([0, 0], [0.2, 1.0], [0.3, 1.35], [0.4, 0.95], [0.5, 1.35], [0.6, 0.95], [0.7, 1.35], [0.85, 1.0], [1, 0]), arm_fwd_l: K([0, 0], [0.2, 0.4], [0.85, 0.4], [1, 0]), elbow_l: K([0, 0], [0.2, 0.9], [0.85, 0.9], [1, 0]), spine_bow: K([0, 0], [0.2, 0.15], [0.85, 0.15], [1, 0]), head_nod: K([0, 0], [0.2, 0.25], [0.85, 0.25], [1, 0]) } },
  turn_valve: { states: ['operating'], dur: [2.0, 3.0], weight: 1, cue: 'clank', ch: { arm_fwd_r: K([0, 0], [0.2, 1.0], [0.85, 1.0], [1, 0]), arm_fwd_l: K([0, 0], [0.2, 1.0], [0.85, 1.0], [1, 0]), elbow_r: K([0, 0], [0.2, 0.8], [0.85, 0.8], [1, 0]), elbow_l: K([0, 0], [0.2, 0.8], [0.85, 0.8], [1, 0]), arm_twist_r: K([0, 0], [0.3, 0.4], [0.5, -0.2], [0.7, 0.4], [1, 0]), arm_twist_l: K([0, 0], [0.3, -0.2], [0.5, 0.4], [0.7, -0.2], [1, 0]), spine_bow: K([0, 0], [0.3, 0.06], [0.8, 0.06], [1, 0]) } },
  wipe_surface: { states: ['operating'], dur: [2.4, 3.4], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.2, 0.6], [0.85, 0.6], [1, 0]), elbow_r: K([0, 0], [0.2, 0.7], [0.85, 0.7], [1, 0]), arm_out_r: K([0, 0], [0.3, 0.35], [0.45, -0.15], [0.6, 0.35], [0.75, -0.15], [1, 0]), spine_bow: K([0, 0], [0.2, 0.2], [0.85, 0.2], [1, 0]), head_nod: K([0, 0], [0.2, 0.2], [0.85, 0.2], [1, 0]) } },
  turn_away: { states: ['operating'], dur: [1.4, 2.2], weight: 1, ch: { pelvis_twist: K([0, 0], [0.35, 0.7], [0.7, 0.7], [1, 0]), spine_twist: K([0, 0], [0.35, 0.3], [0.7, 0.3], [1, 0]), head_turn: K([0, 0], [0.35, 0.35], [0.7, 0.35], [1, 0]) } },
  check_tablet: { states: ['operating'], dur: [2.4, 3.6], weight: 1, ch: { arm_fwd_l: K([0, 0], [0.2, 0.5], [0.85, 0.5], [1, 0]), elbow_l: K([0, 0], [0.2, 1.6], [0.85, 1.6], [1, 0]), arm_fwd_r: K([0, 0], [0.3, 0.45], [0.8, 0.45], [1, 0]), elbow_r: K([0, 0], [0.3, 1.4], [0.8, 1.4], [1, 0]), wrist_r: K([0, 0], [0.4, 0.2], [0.5, -0.1], [0.6, 0.2], [0.7, -0.1], [1, 0]), head_nod: K([0, 0], [0.2, 0.32], [0.85, 0.32], [1, 0]) } },
  fold_cloth: { states: ['operating'], dur: [2.4, 3.4], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.2, 0.6], [0.85, 0.6], [1, 0]), arm_fwd_l: K([0, 0], [0.2, 0.6], [0.85, 0.6], [1, 0]), elbow_r: K([0, 0], [0.25, 0.6], [0.45, 1.4], [0.65, 0.6], [0.85, 1.2], [1, 0]), elbow_l: K([0, 0], [0.25, 0.6], [0.45, 1.4], [0.65, 0.6], [0.85, 1.2], [1, 0]), arm_out_r: K([0, 0], [0.25, 0.3], [0.45, -0.1], [0.65, 0.3], [1, 0]), arm_out_l: K([0, 0], [0.25, 0.3], [0.45, -0.1], [0.65, 0.3], [1, 0]), head_nod: K([0, 0], [0.2, 0.25], [0.85, 0.25], [1, 0]) } },
  stir_pot: { states: ['operating'], dur: [2.0, 3.0], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.2, 0.6], [0.85, 0.6], [1, 0]), elbow_r: K([0, 0], [0.2, 1.1], [0.85, 1.1], [1, 0]), arm_out_r: K([0, 0], [0.3, 0.2], [0.45, -0.1], [0.6, 0.2], [0.75, -0.1], [1, 0]), arm_twist_r: K([0, 0], [0.3, -0.2], [0.45, 0.2], [0.6, -0.2], [0.75, 0.2], [1, 0]), head_nod: K([0, 0], [0.2, 0.3], [0.85, 0.3], [1, 0]) } },
  tend_plant: { states: ['operating'], dur: [2.2, 3.2], weight: 1, ch: { spine_bow: K([0, 0], [0.3, 0.2], [0.8, 0.2], [1, 0]), arm_fwd_r: K([0, 0], [0.3, 0.9], [0.8, 0.9], [1, 0]), elbow_r: K([0, 0], [0.3, 0.5], [0.8, 0.5], [1, 0]), wrist_r: K([0, 0], [0.4, 0.3], [0.55, -0.2], [0.7, 0.3], [1, 0]), head_nod: K([0, 0], [0.3, 0.3], [0.8, 0.3], [1, 0]), head_tilt: K([0, 0], [0.5, 0.1], [1, 0]) } },
  aim_phaser: { states: ['operating'], dur: [1.6, 2.4], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.3, 1.45], [0.8, 1.45], [1, 0]), elbow_r: K([0, 0], [0.3, 0.15], [0.8, 0.15], [1, 0]), arm_fwd_l: K([0, 0], [0.3, 0.9], [0.8, 0.9], [1, 0]), elbow_l: K([0, 0], [0.3, 1.0], [0.8, 1.0], [1, 0]), head_nod: K([0, 0], [0.3, 0.08], [0.8, 0.08], [1, 0]), spine_twist: K([0, 0], [0.3, 0.12], [0.8, 0.12], [1, 0]) } },
  hypo_press: { states: ['operating'], dur: [1.2, 1.8], weight: 1, cue: 'hiss', ch: { arm_fwd_r: K([0, 0], [0.4, 1.25], [0.6, 1.25], [1, 0]), elbow_r: K([0, 0], [0.4, 1.0], [0.6, 1.0], [1, 0]), arm_out_r: K([0, 0], [0.4, 0.25], [0.6, 0.25], [1, 0]), wrist_r: K([0, 0], [0.45, 0], [0.5, -0.35], [0.56, 0], [1, 0]), spine_bow: K([0, 0], [0.4, 0.1], [0.6, 0.1], [1, 0]) } },
  torch_cut: { states: ['operating'], dur: [2.4, 3.4], weight: 1, cue: 'sizzle', ch: { arm_fwd_r: K([0, 0], [0.2, 0.8], [0.85, 0.8], [1, 0]), elbow_r: K([0, 0], [0.2, 0.7], [0.85, 0.7], [1, 0]), arm_out_r: K([0, 0], [0.3, 0.15], [0.6, -0.1], [0.85, 0.15], [1, 0]), arm_fwd_l: K([0, 0], [0.2, 0.6], [0.85, 0.6], [1, 0]), elbow_l: K([0, 0], [0.2, 0.9], [0.85, 0.9], [1, 0]), spine_bow: K([0, 0], [0.2, 0.2], [0.85, 0.2], [1, 0]), head_nod: K([0, 0], [0.2, 0.25], [0.85, 0.25], [1, 0]) } },
  swing_strike: { states: ['operating'], dur: [0.6, 0.8], weight: 1, cue: 'grunt', ch: { arm_fwd_r: K([0, 0], [0.35, 1.9], [0.6, 0.4], [1, 0]), arm_out_r: K([0, 0], [0.35, 0.5], [0.6, -0.1], [1, 0]), elbow_r: K([0, 0], [0.35, 1.4], [0.6, 0.2], [1, 0]), spine_twist: K([0, 0], [0.35, -0.3], [0.6, 0.35], [1, 0]), spine_bow: K([0, 0], [0.6, 0.15], [1, 0]) } },
  throw_item: { states: ['operating'], dur: [0.8, 1.1], weight: 1, ch: { arm_fwd_r: K([0, 0], [0.4, 2.2], [0.65, 1.0], [1, 0]), elbow_r: K([0, 0], [0.4, 1.6], [0.65, 0.1], [1, 0]), spine_twist: K([0, 0], [0.4, -0.35], [0.65, 0.3], [1, 0]), spine_bow: K([0, 0], [0.4, -0.12], [0.7, 0.15], [1, 0]) } },
};
// held poses: static additive channel sets (not keyframed) that a use script or a carrier blends in and out while holding something
export const HOLDS = {
  hold_r: { arm_fwd_r: 0.18, elbow_r: 0.75 },                                         // item low in the right hand, forearm a little forward
  hold_cup: { arm_fwd_r: 0.35, elbow_r: 1.45 },                                      // cup / drink in front of the chest
  hold_padd: { arm_fwd_l: 0.35, elbow_l: 1.5, head_nod: 0.14 },                      // PADD in the left hand, glanced at
  carry_front: { arm_fwd_r: 0.55, arm_fwd_l: 0.55, elbow_r: 1.2, elbow_l: 1.2, arm_out_r: -0.12, arm_out_l: -0.12, spine_bow: -0.05 },   // box in both arms
  tray: { arm_fwd_r: 0.35, arm_fwd_l: 0.35, elbow_r: 1.5, elbow_l: 1.5, arm_out_r: -0.05, arm_out_l: -0.05 },                          // tray flat on both forearms
  lean_on: { spine_bow: 0.16, waist_bow: 0.08, head_nod: 0.08 },                     // leaning over a bench or console
};
export const GESTURE_IDS = Object.keys(GESTURES);
export const CUES = ['sigh', 'yawn', 'groan', 'cough', 'knuckles', 'hum', 'whistle'];

// ---- sampling ----
const smooth = (x) => x * x * (3 - 2 * x);
export function curveAt(keys, u) {
  if (u <= keys[0][0]) return keys[0][1]; const last = keys[keys.length - 1]; if (u >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) { const a = keys[i - 1], b = keys[i], x = (u - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * smooth(x); }
  return 0;
}
// u in 0..1; returns { ch: { channel: value }, face: { morph: value } }
export function sample(g, u) { const ch = {}, face = {}; for (const k in g.ch || {}) ch[k] = curveAt(g.ch[k], u); for (const k in g.face || {}) face[k] = curveAt(g.face[k], u); return { ch, face }; }
// semantic channels -> { boneName: [x, y, z] } using RIG
export function toBones(ch, weight = 1, out = {}) { for (const k in ch) { const r = RIG[k]; if (!r || !ch[k]) continue; const a = out[r.bone] || (out[r.bone] = [0, 0, 0]); a[r.axis] += ch[k] * r.sign * weight; } return out; }

// ---- continuous life: breathing and micro head drift (always on, tiny) ----
export function ambient(t, phase = 0, calm = 1, tired = 0) {
  const br = Math.sin(t * (1.5 + (1 - calm) * 0.8) + phase), ch = { spine_bow: br * 0.014, shrug_l: br * 0.012, shrug_r: br * 0.012, head_nod: Math.sin(t * 0.43 + phase) * 0.018 + tired * 0.05, head_turn: Math.sin(t * 0.29 + phase * 2) * 0.03, head_tilt: Math.sin(t * 0.21 + phase * 3) * 0.02 };
  return ch;
}

// ---- per-person scheduler: picks the next gesture from the person's habits, mood and context ----
const HABIT_TAGS = { 'rubs-neck': 'rub_neck', 'adjusts-collar': 'adjust_collar', 'checks-badge': 'check_badge', 'cracks-knuckles': 'crack_knuckles', 'taps-console': 'tap_console', 'parade-rest': 'hands_behind_back', 'fidgets': 'weight_shift', 'sighs': 'sigh', 'clears-throat': 'cough', 'paces': 'look_around', 'hums': null, 'whistles': null, 'mutters': null };
export class Fidgeter {
  constructor(person, seed = 1) {
    this.p = person; this.seed = seed; this.t = hash01('fid', seed, person.id) * 50; this.phase = hash01('ph', seed, person.id) * 6.28; this.cur = null; this.next = 1 + hash01('first', seed, person.id) * 4; this.n = 0; this.last = ''; this.hist = [];
    const tags = person.tags || []; this.fidgety = tags.includes('habit:fidgets') || tags.includes('workstation:distracted') ? 1.7 : tags.includes('stress:calm') || tags.includes('habit:parade-rest') ? 0.6 : 1;
    this.habits = tags.filter(t => t.startsWith('habit:')).map(t => t.slice(6)); this.cueHab = this.habits.includes('hums') ? 'hum' : this.habits.includes('whistles') ? 'whistle' : null;
  }
  // ctx: { state, stress 0..1, tired 0..1, late (bool), bored (bool), playerNear (bool) }
  pick(ctx) {
    const st = ctx.state || 'standing', cand = [];
    for (const id of GESTURE_IDS) {
      const g = GESTURES[id]; if (!g.states.includes(st) || id === this.last) continue; let w = g.weight;
      if (g.mood === 'tired') w *= 0.2 + (ctx.tired || 0) * 3; else if (g.mood === 'stress') w *= 0.3 + (ctx.stress || 0) * 3; else if (g.mood === 'late') w *= ctx.late ? 4 : 0.1; else if (g.mood === 'bored') w *= ctx.bored ? 3 : 0.6;
      if (g.habit && this.habits.includes(g.habit)) w *= 4; else if (g.habit) w *= 0.5;
      if (ctx.playerNear && (id === 'look_around' || id === 'glance_back')) w *= 0.4;
      if (id === 'cross_arms' || id === 'hands_on_hips') w *= this.p.rank >= 4 ? 1.6 : 0.8;
      w *= 0.6 + hash01('gw', this.seed, this.p.id, id, this.n) * 0.8; cand.push([id, w]);
    }
    const total = cand.reduce((a, c) => a + c[1], 0); let r = hash01('pick', this.seed, this.p.id, this.n) * total; for (const [id, w] of cand) { r -= w; if (r <= 0) return id; } return cand[0]?.[0] || null;
  }
  update(dt, ctx = {}) {
    this.t += dt; const out = { bones: {}, face: {}, cue: null, gesture: null };
    const amb = ambient(this.t, this.phase, 1 - (ctx.stress || 0) * 0.6, ctx.tired || 0); toBones(amb, 1, out.bones);
    if (!this.cur) {
      this.next -= dt;
      if (this.next <= 0) {
        const id = this.pick(ctx); this.n++; if (id) { const g = GESTURES[id]; this.cur = { id, g, at: 0, dur: g.dur[0] + hash01('dur', this.seed, this.p.id, this.n) * (g.dur[1] - g.dur[0]) }; this.last = id; this.hist.push(id); if (this.hist.length > 8) this.hist.shift(); if (g.cue && hash01('cue', this.seed, this.p.id, this.n) < 0.7) out.cue = g.cue; }
        const busy = (ctx.state === 'walking' ? 1.5 : ctx.state === 'working' ? 0.9 : 1), gap = (3.5 + hash01('gap', this.seed, this.p.id, this.n) * 7) * busy / this.fidgety * (1.25 - (ctx.stress || 0) * 0.5);
        this.next = gap;
        if (!id && this.cueHab && hash01('hum', this.seed, this.p.id, this.n) < 0.25) out.cue = this.cueHab;
      }
    }
    if (this.cur) {
      const c = this.cur; c.at += dt; const u = c.at / c.dur;
      if (u >= 1) this.cur = null; else { const env = Math.min(1, u / 0.12, (1 - u) / 0.15), w = smooth(Math.max(0, env)), s = sample(c.g, u); toBones(s.ch, w, out.bones); for (const k in s.face) out.face[k] = s.face[k] * w; out.gesture = c.id; }
    }
    return out;
  }
  describe() { return this.cur ? `${this.cur.id} (${(this.cur.at / this.cur.dur * 100) | 0}%)` : `idle (next ${this.next.toFixed(1)}s)`; }
}
