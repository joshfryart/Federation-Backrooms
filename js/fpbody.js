// First-person body: sleeved forearms + hands that appear during traversal moves (mantle, vault, slide, wall-run, grapple, ladder, crawl),
// a left-hand grapple launcher, a landing-roll camera offset and per-move footstep / cloth audio (procedural, via the Sound module).
// Pose maths (fpPose, fpCam) is pure so node tests can run it; meshes are built only when THREE + a scene are given.
// Glue in js/main.js: `fp = new FPBody({THREE, vmScene, P, sound})`, `fp.update(dt, dtActive)`, `fp.onEvent(name, d)`, read `fp.cam` / `fp.gunDrop`.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

// Hand targets in viewmodel space (camera looks down -Z; x right, y up). Each of L/R: {x,y,z, rx,ry,rz, show 0..1, open 0..1 (0 fist, 1 flat)}.
// s: {mode, crouch, low, sprint, speed, bob, mantK (0..1), mantFast, wallSide (-1 left,1 right), ladderY (climb phase), vy, grapT, sinceLand}
export function fpPose(s) {
  const hand = (x, y, z, rx = 0.2, ry = 0, rz = 0, show = 1, open = 0) => ({ x, y, z, rx, ry, rz, show, open });
  let L = hand(-0.2, -0.3, -0.35, 0.2, 0, 0, 0), R = hand(0.2, -0.3, -0.35, 0.2, 0, 0, 0), gunDrop = 0, tag = 'idle';
  const ph = s.bob || 0;
  if (s.mode === 'mantle') {
    // both hands slap the ledge ahead and below the eyeline, press down as the body comes up, then drop away at the exit
    const k = s.mantK || 0, reach = sm(k * 2.2), push = sm((k - 0.35) * 2.2), away = sm((k - 0.8) * 5);
    const y = -0.22 + reach * 0.1 - push * 0.34 - away * 0.2, z = -0.5 + push * 0.18 + (s.mantFast ? 0.08 : 0);
    L = hand(-0.17 - push * 0.04, y, z, -1.35, 0, 0, 1, 1); R = hand(0.17 + push * 0.04, y, z, -1.35, 0, 0, 1, 1); gunDrop = 1; tag = 'mantle';
  } else if (s.mode === 'slide') {
    // lean back: left hand trails the floor beside the hip for balance, right keeps the gun low
    const sway = Math.sin(ph * 3) * 0.01;
    L = hand(-0.3, -0.42 + sway, -0.28, 0.35, 0.15, -0.3, 1, 1); R = hand(0.22, -0.34, -0.32, 0.3, 0, 0, 0); gunDrop = 0.35; tag = 'slide';
  } else if (s.mode === 'wallrun') {
    // palm trails along the wall on the near side
    const sd = s.wallSide || 1, sw = Math.sin(ph * 5) * 0.015;
    const wall = hand(sd * 0.36, -0.12 + sw, -0.4, -0.2, -sd * 0.5, sd * 1.35, 1, 1), free = hand(-sd * 0.22, -0.3, -0.35, 0.2, 0, 0, 0);
    if (sd > 0) { R = wall; L = hand(-0.2, -0.3, -0.35, 0.2, 0, 0, 0); gunDrop = 0.5; } else { L = wall; R = free; gunDrop = 0; } tag = 'wallrun';
  } else if (s.mode === 'grapple') {
    // left arm thrust out with the launcher aimed ahead, the line reeling in
    const g = Math.min(1, (s.grapT || 0) * 6); L = hand(-0.1 - (1 - g) * 0.06, -0.12, -0.42 - g * 0.1, 0.0, 0.08, 0, 1, 0); R = hand(0.2, -0.3, -0.35, 0.2, 0, 0, 0); tag = 'grapple';
  } else if (s.mode === 'ladder') {
    // alternate hands over hand up the rungs
    const a = Math.sin((s.ladderY || 0) * 7), la = clamp(a, -1, 1);
    L = hand(-0.14, -0.04 + la * 0.12, -0.42, -1.25, 0, 0, 1, 0.2); R = hand(0.14, -0.04 - la * 0.12, -0.42, -1.25, 0, 0, 1, 0.2); gunDrop = 1; tag = 'ladder';
  } else if (s.crouch && (s.low || s.speed > 0.4)) {
    // crawling: hands plant ahead on the floor alternately, bob in time with the knees
    const a = Math.sin(ph * 1.6), mv = clamp(s.speed / 1.4, 0, 1), lift = 0.05;
    L = hand(-0.19, -0.36 + Math.max(0, -a) * lift * mv, -0.42 - a * 0.1 * mv, 0.9, 0, 0, 1, 1); R = hand(0.19, -0.36 + Math.max(0, a) * lift * mv, -0.42 + a * 0.1 * mv, 0.9, 0, 0, 1, 1);
    gunDrop = s.low ? 1 : 0.4; tag = 'crawl';
  } else if (s.sinceLand < 0.45 && s.vyLast < -8) {
    // landing roll: both hands brace in front
    L = hand(-0.2, -0.28, -0.4, 0.9, 0, 0, 1, 1); R = hand(0.2, -0.28, -0.4, 0.9, 0, 0, 1, 1); gunDrop = 1; tag = 'landing';
  }
  return { L, R, gunDrop, tag };
}

// Camera offsets for the landing roll (hard landings tuck forward) and the crawl sway. t is seconds since the hard landing.
export function fpCam(s) {
  let pitch = 0, roll = 0, y = 0;
  if (s.rollT >= 0 && s.rollT < 0.55) { const k = s.rollT / 0.55, e = Math.sin(k * Math.PI); pitch = -e * 0.45 * s.rollPow + (k > 0.5 ? (k - 0.5) * 0 : 0); roll = Math.sin(k * Math.PI * 2) * 0.1 * s.rollPow * s.rollSide; y = -e * 0.28 * s.rollPow; }
  if (s.tag === 'crawl') { const a = Math.sin((s.bob || 0) * 1.6), mv = clamp(s.speed / 1.4, 0, 1); roll += a * 0.018 * mv; pitch += Math.abs(a) * 0.012 * mv; y -= Math.abs(a) * 0.02 * mv; }
  return { pitch, roll, y };
}

// Which audio cue to play for a movement event (pure, so it can be unit tested). Returns an array of cue names.
export function fpCues(name, d = {}) {
  switch (name) {
    case 'jump': return ['cloth'];
    case 'land': return d.impact > 11 ? ['roll', 'cloth'] : d.impact > 6 ? ['cloth'] : [];
    case 'mantle': case 'vault': return ['palm', 'cloth', 'scuff'];
    case 'slide': return ['cloth', 'scrape'];
    case 'wallrun': return ['palm'];
    case 'walljump': return ['palm', 'cloth'];
    case 'grapple': case 'fire': return ['launcher'];
    case 'release': return ['cloth'];
    default: return [];
  }
}

export class FPBody {
  constructor({ THREE, vmScene, P, sound, skin = 0xd9a47c, sleeve = 0xa3231c }) {
    this.P = P; this.sound = sound; this.THREE = THREE; this.t = 0; this.rollT = -1; this.rollPow = 0; this.rollSide = 1; this.sinceLand = 9; this.vyLast = 0; this.crawlSide = 0; this.clothT = 0; this.lastSpeed = 0;
    this.cam = { pitch: 0, roll: 0, y: 0 }; this.gunDrop = 0; this.tag = 'idle'; this.kick = 0; this.vm = null;
    if (THREE && vmScene) this.build(THREE, vmScene, skin, sleeve);
  }
  build(THREE, vmScene, skin, sleeve) {
    const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }), cloth = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.8, roughness: 0.3 }), glow = new THREE.MeshBasicMaterial({ color: 0x40c8ff }), warm = new THREE.MeshBasicMaterial({ color: 0xff9a3a });
    const mk = (side) => {
      const a = new THREE.Group(), s = side;      // s: -1 left, 1 right; the arm runs back along +Z from the fist at the origin
      const mesh = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.renderOrder = 10; a.add(m); return m; };
      const sl = mesh(new THREE.CylinderGeometry(0.046, 0.034, 0.34, 12), cloth, 0, 0, 0.2, Math.PI / 2); sl.scale.set(1, 1, 0.9);   // tapering sleeve
      mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 12), dark, 0, 0, 0.035, Math.PI / 2);                                       // cuff
      mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.006, 12), trim, 0, 0, 0.1, Math.PI / 2);                                       // rank braid
      mesh(new THREE.CapsuleGeometry(0.027, 0.05, 3, 8), skinM, 0, 0, 0.0, Math.PI / 2);                                              // wrist/back of hand
      const palm = mesh(new THREE.BoxGeometry(0.07, 0.024, 0.07), skinM, 0, 0, -0.03); palm.scale.set(1, 1, 1);
      const fingers = [];
      for (let i = 0; i < 4; i++) {            // four jointed fingers hinged at the knuckle edge; rotation.x curls them
        const f = new THREE.Group(), x = (i - 1.5) * 0.0175 * s * -1; f.position.set(x, 0, -0.066);
        const L1 = 0.03 - (i === 3 ? 0.005 : 0) + (i === 1 ? 0.004 : 0), p1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, L1, 3, 6), skinM); p1.rotation.x = Math.PI / 2; p1.position.z = -L1 / 2 - 0.005; p1.renderOrder = 10;
        const f2 = new THREE.Group(); f2.position.z = -L1 - 0.012; const p2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.02, 3, 6), skinM); p2.rotation.x = Math.PI / 2; p2.position.z = -0.012; p2.renderOrder = 10; f2.add(p2);
        f.add(p1, f2); a.add(f); fingers.push({ f, f2 });
      }
      const th = new THREE.Group(); th.position.set(-0.034 * s, -0.004, -0.015); const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.03, 3, 6), skinM); t1.rotation.x = Math.PI / 2; t1.position.z = -0.02; t1.renderOrder = 10; th.add(t1); th.rotation.y = 0.5 * s; a.add(th);
      a.userData = { fingers, th, side: s }; return a;
    };
    this.armL = mk(-1); this.armR = mk(1);
    // grapple launcher on the left hand: a short barrel across the knuckles with a coil and a glowing reel, and the line anchor point
    const lau = new THREE.Group(), lm = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.renderOrder = 11; lau.add(m); return m; };
    lm(new THREE.CylinderGeometry(0.02, 0.026, 0.1, 10), dark, 0, 0.034, -0.03, Math.PI / 2); lm(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), dark, 0, 0.034, -0.095, Math.PI / 2);
    lm(new THREE.TorusGeometry(0.021, 0.004, 5, 14), warm, 0, 0.034, -0.08); lm(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), dark, 0, 0.012, 0.02, 0, 0).rotation.z = Math.PI / 2;
    this.reel = lm(new THREE.BoxGeometry(0.004, 0.02, 0.02), glow, 0.0, 0.012, 0.02); this.launcher = lau; this.armL.add(lau);
    const g = new THREE.Group(); g.add(this.armL, this.armR); g.visible = false; vmScene.add(g); this.vm = g;
    this.cur = { L: { x: -0.2, y: -0.4, z: -0.3, rx: 0.2, ry: 0, rz: 0, show: 0, open: 0 }, R: { x: 0.2, y: -0.4, z: -0.3, rx: 0.2, ry: 0, rz: 0, show: 0, open: 0 } };
  }

  // Movement events from js/move.js (call from moveApi.onEvent). Plays cloth / palm / roll audio and starts the landing roll.
  onEvent(name, d = {}) {
    const S = this.sound; const cues = fpCues(name, d);
    if (name === 'land') { this.sinceLand = 0; this.vyLast = -d.impact; if (d.impact > 11) { this.rollT = 0; this.rollPow = clamp((d.impact - 9) / 9, 0.3, 1); this.rollSide = Math.random() < 0.5 ? -1 : 1; } }
    if (name === 'grapple' || name === 'fire') this.kick = 1;
    if (!S?.ctx) return;
    for (const c of cues) {
      if (c === 'cloth') S.noise(0.16, 0.05, 1800 + Math.random() * 600, 0.6, 'bandpass');
      else if (c === 'palm') S.noise(0.07, 0.08, 700, 1.2, 'bandpass');
      else if (c === 'scuff') S.noise(0.12, 0.05, 350, 0.8, 'lowpass');
      else if (c === 'scrape') S.noise(0.5, 0.05, 2400, 0.5, 'highpass');
      else if (c === 'roll') { S.noise(0.28, 0.1, 500, 0.7, 'lowpass'); S.noise(0.22, 0.06, 2200, 0.5, 'bandpass'); }
      else if (c === 'launcher') { S.tone(220, 0.12, 'square', 0.05, 380); S.noise(0.1, 0.06, 3000, 1, 'bandpass'); }
    }
  }

  // Knee/hand cadence while crawling and cloth swish when speed changes sharply. Returns the active pose tag.
  _crawlAudio(dt, P, speed) {
    const S = this.sound; if (!S?.ctx || this.tag !== 'crawl' || speed < 0.4) { this._cp = null; return; }
    const ph = Math.floor((P.bob || 0) * 1.6 / Math.PI * 2), side = ph & 1;     // a plant every quarter of the bob sine
    if (this._cp !== null && ph !== this._cp) {
      S.noise(0.07, 0.07, side ? 180 : 260, 0.9, 'lowpass');                    // knee on metal
      S.noise(0.04, 0.035, side ? 900 : 700, 1.1, 'bandpass');                  // palm tap
      S.noise(0.1, 0.02, 1700, 0.6, 'bandpass');                                // sleeve rub
    } this._cp = ph;
  }

  // Call once per frame after movePlayer. dt in seconds; show=false hides everything (menus, cutscenes).
  update(dt, show = true) {
    const P = this.P, speed = Math.hypot(P.vx || 0, P.vz || 0); this.t += dt; if (this.rollT >= 0) { this.rollT += dt; if (this.rollT > 0.6) this.rollT = -1; } this.sinceLand += dt;
    const s = { mode: P.mode, crouch: !!P.crouch, low: !!P.low, sprint: !!P.sprint, speed, bob: P.bob || 0, mantK: P.mant ? Math.min(1, P.mant.t) : 0, mantFast: !!P.mant?.fast, wallSide: P.wallSide || 1, ladderY: P.y, vy: P.vy, grapT: P.grap?.t || 0, sinceLand: this.sinceLand, vyLast: this.vyLast };
    const pose = fpPose(s); this.tag = pose.tag; this.gunDrop += (pose.gunDrop - this.gunDrop) * Math.min(1, dt * 14);
    this.cam = fpCam({ rollT: this.rollT, rollPow: this.rollPow, rollSide: this.rollSide, tag: pose.tag, bob: P.bob || 0, speed });
    this._crawlAudio(dt, P, speed);
    if (Math.abs(speed - this.lastSpeed) > 6 * dt * 60 * 0.15 && this.sound?.ctx && (this.clothT -= dt) <= 0) { this.clothT = 0.4; this.sound.noise(0.12, 0.025, 2000, 0.6, 'bandpass'); } this.lastSpeed = speed;
    this.kick = Math.max(0, this.kick - dt * 5);
    if (!this.vm) return pose;
    this.vm.visible = !!show && (pose.L.show > 0 || pose.R.show > 0 || this.cur.L.show > 0.02 || this.cur.R.show > 0.02);
    const e = Math.min(1, dt * 16);
    for (const [k, arm] of [['L', this.armL], ['R', this.armR]]) {
      const c = this.cur[k], t = pose[k]; for (const f of ['x', 'y', 'z', 'rx', 'ry', 'rz', 'show', 'open']) c[f] += (t[f] - c[f]) * e;
      // hidden hands drift low and back so they slide in from below when a move starts
      const out = 1 - c.show; arm.visible = c.show > 0.02; arm.position.set(c.x, c.y - out * 0.12, c.z + out * 0.08); arm.rotation.set(c.rx, c.ry, c.rz);
      const curl = 1.2 - c.open * 1.15; for (const { f, f2 } of arm.userData.fingers) { f.rotation.x = -curl * 0.55; f2.rotation.x = -curl * 0.75; } arm.userData.th.rotation.x = -curl * 0.2;
    }
    this.launcher.visible = pose.tag === 'grapple' || P.grapCd > 0 || this.kick > 0;
    this.launcher.position.z = this.kick * 0.03; this.reel.rotation.x = this.t * (pose.tag === 'grapple' ? 20 : 1.5);
    return pose;
  }
}
