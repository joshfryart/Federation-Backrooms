// Per-room-type ambience and positional audio, all procedural WebAudio on top of the game's `Sound` (js/audio.js: ctx, master, noiseBuf).
//   const amb = new Ambience(sound);
//   amb.update(dt, camera, roomType, hasLos)   every frame (the room the player stands in; null / '' = corridor)
//   amb.bindEnemy(enemy)                       gives the enemy a `sound` that is panned (and muffled behind walls) at the enemy's x / z
//   amb.at(kind, x, z)                         one-shot positional sound ('hiss', 'clank', 'beep', 'zap')
// Layers: engineering hum (also plant / workshop), sickbay monitor beeps (also morgue, lab), shuttlebay echo (also cargo, airlock),
// bridge chirps (also ready room), computer-core fans, arboretum air. Each fades in over ~1.5 s when you enter the room.
const LAYER_OF = {
  engineering: 'eng', plant: 'eng', workshop: 'eng', laundry: 'eng',
  sickbay: 'sick', morgue: 'sick', lab: 'sick',
  shuttlebay: 'bay', cargo: 'bay', airlock: 'bay', stores: 'bay',
  bridge: 'bridge', readyroom: 'bridge', transporter: 'bridge',
  datacore: 'core',
  arboretum: 'air', holodeck: 'air', gym: 'air',
};
const GAIN = { eng: 1, sick: 1, bay: 1, bridge: 1, core: 1, air: 1 };

export class Ambience {
  constructor(sound) {
    this.s = sound; this.ready = false; this.layers = {}; this.w = {}; this.cur = ''; this.t = 0;
    this.enemies = []; this.beepT = 0; this.chirpT = 0; this.clankT = 6; this.dripT = 3; this.listenerOk = true;
  }
  _build() {
    const s = this.s, ctx = s.ctx; if (!ctx || !s.noiseBuf || !s.master) return;
    const L = this.layers, out = (g) => { g.gain.value = 0; g.connect(s.master); return g; };
    const loopNoise = (type, freq, q) => { const n = ctx.createBufferSource(); n.buffer = s.noiseBuf; n.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; n.connect(f); n.start(0, Math.random()); return f; };
    const osc = (type, freq, dst, vol, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; if (det) o.detune.value = det; const g = ctx.createGain(); g.gain.value = vol; o.connect(g); g.connect(dst); o.start(); return o; };
    const lfo = (rate, depth, param) => { const o = ctx.createOscillator(); o.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(param); o.start(); };
    // engineering: warp-core drone with a slow beat, turbine whine and a rumble
    { const g = out(ctx.createGain()), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(g);
      osc('sawtooth', 55, lp, 0.5); osc('sawtooth', 55.6, lp, 0.45); osc('sine', 110.4, lp, 0.25); osc('sine', 27.5, g, 0.5);
      const whine = ctx.createGain(); whine.gain.value = 0.012; whine.connect(g); osc('triangle', 612, whine, 1); lfo(0.31, 0.006, whine.gain);
      const rum = loopNoise('lowpass', 140, 0.5), rg = ctx.createGain(); rg.gain.value = 0.9; rum.connect(rg); rg.connect(g); lfo(0.13, 0.25, rg.gain);
      L.eng = g; }
    // sickbay: soft air handling (beeps are scheduled in update)
    { const g = out(ctx.createGain()), f = loopNoise('bandpass', 1500, 0.4), a = ctx.createGain(); a.gain.value = 0.35; f.connect(a); a.connect(g); osc('sine', 120, g, 0.05); L.sick = g; }
    // shuttlebay: big empty hall: low wind, and a feedback delay bus for the clanks (the echo)
    { const g = out(ctx.createGain()), f = loopNoise('bandpass', 220, 0.7), a = ctx.createGain(); a.gain.value = 0.9; f.connect(a); a.connect(g); lfo(0.07, 0.3, a.gain);
      const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.43; const fb = ctx.createGain(); fb.gain.value = 0.52; const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 1400;
      const send = ctx.createGain(); send.gain.value = 1; send.connect(dly); dly.connect(lp2); lp2.connect(fb); fb.connect(dly); lp2.connect(g); send.connect(g);
      L.bay = g; this.bayBus = send; }
    // bridge: quiet bed with a faint comm hiss (chirps scheduled in update)
    { const g = out(ctx.createGain()), f = loopNoise('highpass', 3500, 0.5), a = ctx.createGain(); a.gain.value = 0.05; f.connect(a); a.connect(g); osc('sine', 98, g, 0.05); L.bridge = g; }
    // computer core: fans and cooling
    { const g = out(ctx.createGain()), f = loopNoise('bandpass', 700, 0.8), a = ctx.createGain(); a.gain.value = 0.7; f.connect(a); a.connect(g); lfo(5.2, 0.05, a.gain); osc('sawtooth', 180, g, 0.02); L.core = g; }
    // arboretum / holodeck / gym: moving air
    { const g = out(ctx.createGain()), f = loopNoise('bandpass', 500, 0.3), a = ctx.createGain(); a.gain.value = 0.35; f.connect(a); a.connect(g); lfo(0.11, 0.2, a.gain); L.air = g; }
    this.ready = true;
  }
  // gain per layer when fully in the room (kept low: this sits under footsteps and speech)
  _level(name) { return ({ eng: 0.05, sick: 0.014, bay: 0.03, bridge: 0.02, core: 0.016, air: 0.014 })[name] * (GAIN[name] || 1); }

  update(dt, camera, room, hasLos = true) {
    const s = this.s; if (!s.ctx || s.muted) return;
    if (!this.ready) { this._build(); if (!this.ready) return; }
    const ctx = s.ctx, now = ctx.currentTime; this.t += dt;
    const want = LAYER_OF[room] || '';
    for (const k in this.layers) this.layers[k].gain.setTargetAtTime(k === want ? this._level(k) : 0, now, 0.6);
    this.cur = want;
    // listener follows the camera
    if (camera) {
      const l = ctx.listener, p = camera.position, e = camera.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
      if (l.positionX) { l.positionX.setTargetAtTime(p.x, now, 0.03); l.positionY.setTargetAtTime(p.y, now, 0.03); l.positionZ.setTargetAtTime(p.z, now, 0.03); l.forwardX.setTargetAtTime(fx, now, 0.03); l.forwardY.setTargetAtTime(fy, now, 0.03); l.forwardZ.setTargetAtTime(fz, now, 0.03); l.upX.setTargetAtTime(ux, now, 0.03); l.upY.setTargetAtTime(uy, now, 0.03); l.upZ.setTargetAtTime(uz, now, 0.03); }
      else if (l.setPosition) { l.setPosition(p.x, p.y, p.z); l.setOrientation(fx, fy, fz, ux, uy, uz); }
    }
    // scheduled one-shots of the current room
    if (want === 'sick') { this.beepT -= dt; if (this.beepT <= 0) { this.beepT = 0.95 + Math.random() * 0.25; s.tone(1046, 0.07, 'sine', 0.035); if (Math.random() < 0.4) s.tone(1568, 0.05, 'sine', 0.02, 0, 0.45); if (Math.random() < 0.08) { s.tone(880, 0.12, 'square', 0.02); s.tone(880, 0.12, 'square', 0.02, 0, 0.2); } } }
    else if (want === 'bridge') { this.chirpT -= dt; if (this.chirpT <= 0) { this.chirpT = 3 + Math.random() * 6; const f = [1318, 1760, 1568, 2093][Math.floor(Math.random() * 4)]; s.tone(f, 0.06, 'sine', 0.018); s.tone(f * 1.5, 0.05, 'sine', 0.014, 0, 0.09); } }
    else if (want === 'bay') { this.clankT -= dt; if (this.clankT <= 0) { this.clankT = 7 + Math.random() * 14; this._clank(); } }
    else if (want === 'eng') { this.dripT -= dt; if (this.dripT <= 0) { this.dripT = 5 + Math.random() * 9; s.noise(0.25, 0.012, 2400, 3, 'bandpass'); } }
    // bound enemies: follow the monster, muffle it behind walls
    const l = this.enemies; for (let i = l.length - 1; i >= 0; i--) {
      const b = l[i], e = b.e;
      if (!e.mesh || !e.mesh.parent) { try { b.pan.disconnect(); b.lp.disconnect(); } catch (_) { /* gone */ } l.splice(i, 1); continue; }
      const p = b.pan; if (p.positionX) { p.positionX.setTargetAtTime(e.x, now, 0.05); p.positionY.setTargetAtTime(e.kind === 'clinger' ? 2.6 : 1.3, now, 0.05); p.positionZ.setTargetAtTime(e.z, now, 0.05); } else if (p.setPosition) p.setPosition(e.x, 1.3, e.z);
      if (camera) { const occ = this.occluded ? this.occluded(e.x, e.z) : false; b.lp.frequency.setTargetAtTime(occ ? 650 : 16000, now, 0.12); }
    }
  }
  _clank() {
    const s = this.s, ctx = s.ctx; if (!this.bayBus) return; const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(150 + Math.random() * 120, t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.5);
    const g = ctx.createGain(); s._env(g, t0, 0.005, 0.6, 0.12); o.connect(g); g.connect(this.bayBus); o.start(t0); o.stop(t0 + 0.7);
    const n = ctx.createBufferSource(); n.buffer = s.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3; const g2 = ctx.createGain(); s._env(g2, t0, 0.003, 0.2, 0.08);
    n.connect(f); f.connect(g2); g2.connect(this.bayBus); n.start(t0, Math.random()); n.stop(t0 + 0.3);
  }

  _panner(x, y, z) {
    const ctx = this.s.ctx, p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 0.25; p.maxDistance = 60;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    return p;
  }
  // an enemy's sound object: the shared Sound with its output bus swapped for a panner at the enemy (volumes stay as the enemy code sets them)
  bindEnemy(e) {
    const base = this.s, self = this; let bus = null;
    const prox = Object.create(base);
    Object.defineProperty(prox, 'master', { configurable: true, get() {
      if (!base.ctx || !base.master) return undefined;
      if (!bus) { const lp = base.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; const pan = self._panner(e.x || 0, 1.3, e.z || 0); lp.connect(pan); pan.connect(base.master); bus = lp; self.enemies.push({ e, pan, lp }); }
      return bus; } });
    return prox;
  }
  // one-shot sound at a world position
  at(kind, x, z, y = 1.2) {
    const s = this.s, ctx = s.ctx; if (!ctx || !s.master || !s.noiseBuf) return; const t0 = ctx.currentTime, pan = this._panner(x, y, z);
    pan.connect(s.master); let dur = 1;
    if (kind === 'hiss') { dur = 1.6; const n = ctx.createBufferSource(); n.buffer = s.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200; const g = ctx.createGain(); s._env(g, t0, 0.15, 1.2, 0.07); n.connect(f); f.connect(g); g.connect(pan); n.start(t0, Math.random()); n.stop(t0 + 1.5); }
    else if (kind === 'zap') { dur = 0.4; const n = ctx.createBufferSource(); n.buffer = s.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.5; const g = ctx.createGain(); s._env(g, t0, 0.003, 0.2, 0.12); n.connect(f); f.connect(g); g.connect(pan); n.start(t0, Math.random()); n.stop(t0 + 0.3); }
    else { dur = 0.8; const o = ctx.createOscillator(); o.type = kind === 'beep' ? 'sine' : 'triangle'; o.frequency.value = kind === 'beep' ? 1046 : 180; const g = ctx.createGain(); s._env(g, t0, 0.005, kind === 'beep' ? 0.08 : 0.5, 0.1); o.connect(g); g.connect(pan); o.start(t0); o.stop(t0 + dur); }
    setTimeout(() => { try { pan.disconnect(); } catch (_) { /* gone */ } }, dur * 1000 + 300);
  }
}
