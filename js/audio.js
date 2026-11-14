// Procedural WebAudio: no asset files needed.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol ?? 0.8;
    // cavernous reverb: everything sounds like an empty hallway
    const irLen = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6); }
    const conv = ctx.createConvolver(); conv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.34;
    const dry = ctx.createGain(); dry.gain.value = 0.9;
    this.master.connect(dry); dry.connect(ctx.destination); this.master.connect(conv); conv.connect(wet); wet.connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ship hum
    this.hum = ctx.createGain(); this.hum.gain.value = 0.035; this.hum.connect(this.master);
    for (const f of [48, 72.3, 96.5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = f < 60 ? 0.5 : 0.2;
      o.connect(lp); lp.connect(g); g.connect(this.hum); o.start();
    }
    const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf; nz.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    this.nzGain = ctx.createGain(); this.nzGain.gain.value = 0.008;
    nz.connect(bp); bp.connect(this.nzGain); this.nzGain.connect(this.master); nz.start();

    // fluorescent buzz (louder under lit panels)
    this.buzz = ctx.createGain(); this.buzz.gain.value = 0; this.buzz.connect(this.master);
    for (const f of [120, 240.7, 360.4]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 4;
      const g = ctx.createGain(); g.gain.value = f === 120 ? 0.6 : 0.25; o.connect(bp); bp.connect(g); g.connect(this.buzz); o.start();
    }
    // tension drone (gain driven by gorn proximity)
    this.tension = ctx.createGain(); this.tension.gain.value = 0; this.tension.connect(this.master);
    for (const f of [55, 58.3, 110.7]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      o.connect(lp); lp.connect(this.tension); o.start();
    }
    // room bed: one filtered-noise layer + one tone, re-tuned per room type (setRoom); events from roomTick
    const rn = ctx.createBufferSource(); rn.buffer = this.noiseBuf; rn.loop = true;
    this.roomBP = ctx.createBiquadFilter(); this.roomBP.type = 'bandpass'; this.roomBP.frequency.value = 400; this.roomBP.Q.value = 0.7;
    this.roomG = ctx.createGain(); this.roomG.gain.value = 0; rn.connect(this.roomBP); this.roomBP.connect(this.roomG); this.roomG.connect(this.master); rn.start();
    this.roomOsc = ctx.createOscillator(); this.roomOsc.type = 'sine'; this.roomOsc.frequency.value = 100; this.roomTG = ctx.createGain(); this.roomTG.gain.value = 0; this.roomOsc.connect(this.roomTG); this.roomTG.connect(this.master); this.roomOsc.start();
    this.roomT = 0;
  }

  // ambience per room type: noise band (Hz, Q, gain), a tone (Hz, gain, waveform) and sporadic events
  static ROOM_AMB = {
    engineering: { f: 140, q: 0.5, g: 0.03, t: [55, 0.03, 'sawtooth'], ev: ['clang', 9] },
    bridge: { f: 2200, q: 1.5, g: 0.004, t: [1320, 0.0015, 'sine'], ev: ['chirp', 4] },
    readyroom: { f: 900, q: 0.8, g: 0.004, ev: ['chirp', 14] },
    sickbay: { f: 3000, q: 3, g: 0.003, t: [880, 0.002, 'sine'], ev: ['blip', 2.2] },
    morgue: { f: 200, q: 0.6, g: 0.014, t: [60, 0.01, 'sine'] },
    shuttlebay: { f: 220, q: 0.4, g: 0.02, ev: ['clang', 16] },
    cargo: { f: 260, q: 0.5, g: 0.014, ev: ['clang', 20] },
    stores: { f: 300, q: 0.6, g: 0.008 },
    arboretum: { f: 1800, q: 0.7, g: 0.016, ev: ['drip', 4] },
    plant: { f: 1600, q: 0.7, g: 0.016, ev: ['drip', 4] },
    washroom: { f: 1400, q: 0.6, g: 0.014, ev: ['drip', 2.5] },
    laundry: { f: 180, q: 0.6, g: 0.02, t: [30, 0.02, 'triangle'] },
    gym: { f: 320, q: 0.5, g: 0.008, ev: ['thud', 5] },
    lab: { f: 2600, q: 2.5, g: 0.004, t: [740, 0.0015, 'sine'], ev: ['blip', 3] },
    datacore: { f: 1100, q: 0.9, g: 0.016, t: [120, 0.01, 'sawtooth'], ev: ['blip', 1.4] },
    holodeck: { f: 600, q: 0.5, g: 0.002, t: [440, 0.001, 'sine'] },
    brig: { f: 400, q: 0.8, g: 0.006, t: [60, 0.012, 'square'], ev: ['clang', 18] },
    armory: { f: 500, q: 0.8, g: 0.004 },
    mess: { f: 700, q: 0.6, g: 0.012, ev: ['clang', 12] },
    lounge: { f: 500, q: 0.5, g: 0.008 },
    quarters: { f: 350, q: 0.6, g: 0.004 },
    workshop: { f: 900, q: 0.7, g: 0.008, ev: ['zap', 12] },
    transporter: { f: 1000, q: 1.2, g: 0.006, t: [220, 0.008, 'sine'] },
    airlock: { f: 250, q: 0.5, g: 0.012 },
    jefferies: { f: 180, q: 0.5, g: 0.02, t: [48, 0.015, 'sawtooth'], ev: ['clang', 11] },
  };
  setRoom(key) {
    if (!this.ctx || this.roomKey === key) return; this.roomKey = key; const a = Sound.ROOM_AMB[key], t = this.ctx.currentTime;
    this.roomAmb = a || null; this.roomT = 2 + Math.random() * 3;
    this.roomG.gain.setTargetAtTime(a ? a.g : 0.003, t, 0.6); if (a) { this.roomBP.frequency.setTargetAtTime(a.f, t, 0.5); this.roomBP.Q.value = a.q; }
    const tn = a?.t; this.roomTG.gain.setTargetAtTime(tn ? tn[1] : 0, t, 0.6); if (tn) { this.roomOsc.type = tn[2]; this.roomOsc.frequency.setTargetAtTime(tn[0], t, 0.3); }
  }
  roomTick(dt) {
    const a = this.roomAmb; if (!this.ctx || !a?.ev || this.muted) return; this.roomT -= dt; if (this.roomT > 0) return;
    this.roomT = a.ev[1] * (0.6 + Math.random() * 0.9); const k = a.ev[0];
    if (k === 'blip') { this.tone(1900, 0.05, 'sine', 0.012); this.tone(1900, 0.05, 'sine', 0.012, 0, 0.55); } else if (k === 'chirp') this.tone(1760, 0.07, 'sine', 0.025); else if (k === 'drip') this.tone(1400 + Math.random() * 600, 0.08, 'sine', 0.03, -500);
    else if (k === 'clang') this.clang(0.04); else if (k === 'thud') this.thud(0.08); else if (k === 'zap') this.noise(0.12, 0.05, 2500, 1.5, 'bandpass');
  }

  setBuzz(v) { if (this.ctx) this.buzz.gain.setTargetAtTime(v * 0.012, this.ctx.currentTime, 0.15); }
  setPower(on) { if (!this.ctx) return; const t = this.ctx.currentTime; this.hum.gain.setTargetAtTime(on ? 0.035 : 0.0, t, on ? 0.05 : 0.4); this.nzGain.gain.setTargetAtTime(on ? 0.008 : 0.002, t, 0.3); if (!on) this.buzz.gain.setTargetAtTime(0, t, 0.1); }
  powerDown() { this.tone(90, 1.4, 'sawtooth', 0.2, -70); this.noise(0.6, 0.2, 200, 0.5, 'lowpass'); }
  powerUp() { this.thud(0.5); this.tone(60, 0.8, 'square', 0.1, 180); this.noise(0.4, 0.2, 2500, 2, 'highpass', 0.1); this.flick(); }
  splash(vol = 0.12) { this.noise(0.18, vol, 1800, 1.2, 'bandpass'); this.noise(0.3, vol * 0.7, 500, 0.8, 'lowpass', 0.03); }
  drip() { this.tone(1400 + Math.random() * 600, 0.08, 'sine', 0.05, -500); }
  // faraway wrongness: footsteps, scraping, a whisper that isn't there
  distant(kind) {
    if (!this.ctx) return; const ctx = this.ctx, t0 = ctx.currentTime;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const out = ctx.createGain(); out.gain.value = 0.5; pan.connect(lp); lp.connect(out); out.connect(this.master);
    const burst = (dt, dur, vol, f) => { const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.8;
      const g = ctx.createGain(); this._env(g, t0 + dt, 0.01, dur, vol); s.connect(bp); bp.connect(g); g.connect(pan); s.start(t0 + dt, Math.random()); s.stop(t0 + dt + dur + 0.1); };
    if (kind === 'steps') { const n = 4 + Math.floor(Math.random() * 6), gap = 0.55 + Math.random() * 0.2; for (let i = 0; i < n; i++) burst(i * gap, 0.12, 0.35 * (1 - i / (n + 2)), 200); }
    else if (kind === 'scrape') { burst(0, 1.8, 0.18, 700); burst(0.2, 1.4, 0.12, 1200); }
    else if (kind === 'door') { burst(0, 0.7, 0.25, 900); burst(0.75, 0.15, 0.3, 160); }
    else { for (let i = 0; i < 9; i++) burst(i * 0.18, 0.2, 0.1 + Math.random() * 0.08, 1800 + Math.random() * 1800); lp.frequency.value = 3200; } // whisper
  }
  setTension(t) { // 0..1
    if (!this.ctx) return;
    this.tension.gain.setTargetAtTime(t * 0.12, this.ctx.currentTime, 0.2);
  }

  _env(node, t0, a, d, peak) {
    node.gain.cancelScheduledValues(t0);
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = this.ctx.createGain(); this._env(g, t, 0.01, dur, vol);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, vol = 0.2, freq = 800, q = 1, type = 'bandpass', delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); this._env(g, t, 0.005, dur, vol);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  step(vol = 0.15) { this.noise(0.09, vol, 300 + Math.random() * 120, 0.8, 'lowpass'); }
  phaser() { this.tone(1800, 0.35, 'sawtooth', 0.15, -1500); this.tone(900, 0.4, 'square', 0.06, -700); }
  empty() { this.tone(180, 0.12, 'square', 0.1); }
  pickup() { this.tone(880, 0.1, 'sine', 0.18); this.tone(1320, 0.18, 'sine', 0.18, 0, 0.09); }
  chip() { this.tone(660, 0.08, 'triangle', 0.2); this.tone(990, 0.08, 'triangle', 0.2, 0, 0.08); this.tone(1480, 0.2, 'triangle', 0.2, 0, 0.16); }
  heal() { this.tone(520, 0.3, 'sine', 0.15, 300); }
  ding() { this.tone(1046, 0.8, 'sine', 0.2); this.tone(784, 1.0, 'sine', 0.15, 0, 0.25); }
  denied() { this.tone(200, 0.25, 'sawtooth', 0.12); this.tone(160, 0.3, 'sawtooth', 0.12, 0, 0.2); }
  purr() { this.tone(70, 0.5, 'sawtooth', 0.05); this.noise(0.5, 0.04, 200, 1, 'lowpass'); }
  hit() { this.noise(0.4, 0.5, 200, 0.5, 'lowpass'); this.tone(90, 0.5, 'sawtooth', 0.3, -50); }
  stunned() { this.tone(400, 0.5, 'sawtooth', 0.1, -300); }
  roar(vol = 0.25) {
    this.tone(120, 1.1, 'sawtooth', vol, -70);
    this.tone(180, 0.9, 'square', vol * 0.5, -100);
    this.noise(1.0, vol * 0.8, 500, 0.7, 'bandpass');
  }
  growl(vol = 0.1) { this.tone(70 + Math.random() * 20, 0.6, 'sawtooth', vol, -20); this.noise(0.5, vol * 0.5, 300, 1, 'lowpass'); }
  heartbeat(vol = 0.3) { this.tone(60, 0.12, 'sine', vol, -20); this.tone(52, 0.14, 'sine', vol * 0.8, -15, 0.16); }
  lift() { this.tone(110, 1.6, 'sawtooth', 0.12, 50); this.noise(1.6, 0.1, 150, 0.6, 'lowpass'); }
  death() { this.noise(1.6, 0.5, 120, 0.5, 'lowpass'); this.tone(300, 1.6, 'sawtooth', 0.3, -270); }
  shriek(vol = 0.25) { this.tone(900, 0.7, 'sawtooth', vol, 700); this.tone(1300, 0.6, 'square', vol * 0.5, -500, 0.05); this.noise(0.6, vol * 0.5, 2200, 1, 'bandpass'); }
  mutter(vol = 0.1) { for (let i = 0; i < 4; i++) this.tone(110 + Math.random() * 90, 0.15, 'sawtooth', vol, 40, i * 0.17); this.noise(0.7, vol * 0.4, 700, 1.5, 'bandpass'); }
  whir(vol = 0.12) { this.tone(240, 0.8, 'sawtooth', vol, 160); this.tone(120, 0.9, 'square', vol * 0.5, 80); }
  giggle(vol = 0.15) { for (let i = 0; i < 5; i++) this.tone(900 + (i % 2) * 220, 0.08, 'sine', vol, 150, i * 0.1); this.tone(1800, 0.5, 'triangle', vol * 0.3, -600, 0.1); }
  skitter(vol = 0.15) { for (let i = 0; i < 8; i++) this.noise(0.03, vol, 3500 + Math.random() * 1500, 4, 'highpass', i * 0.04); }
  thud(vol = 0.3) { this.tone(55, 0.25, 'sine', vol, -20); this.noise(0.12, vol * 0.5, 150, 0.7, 'lowpass'); }
  klaxon() { for (let i = 0; i < 3; i++) { this.tone(520, 0.35, 'sawtooth', 0.08, 120, i * 0.5); this.tone(380, 0.35, 'square', 0.04, 80, i * 0.5); } }
  // per-alert klaxon / chime patterns (js/alerts.js ALERTS[id].klaxon)
  alertTone(id) {
    const T = (f, d, ty, v, sl, dl) => this.tone(f, d, ty, v, sl, dl);
    if (id === 'chime') { T(880, 0.4, 'sine', 0.16); T(1175, 0.6, 'sine', 0.16, 0, 0.35); }
    else if (id === 'red') this.klaxon();
    else if (id === 'fire') for (let i = 0; i < 8; i++) T(1000, 0.1, 'square', 0.06, 0, i * 0.16);
    else if (id === 'breach') { for (let i = 0; i < 5; i++) T(300, 0.14, 'sawtooth', 0.09, -80, i * 0.2); this.noise(0.9, 0.12, 1800, 1, 'highpass'); }
    else if (id === 'contam') for (let i = 0; i < 2; i++) T(400, 0.9, 'sawtooth', 0.07, 300, i * 1.0);
    else if (id === 'power') { T(600, 0.3, 'square', 0.08, -100); T(450, 0.3, 'square', 0.08, -100, 0.35); T(300, 0.7, 'square', 0.08, -150, 0.7); }
    else if (id === 'gravity') for (let i = 0; i < 6; i++) T(i % 2 ? 560 : 500, 0.12, 'triangle', 0.1, 0, i * 0.14);
    else if (id === 'intruder') for (let i = 0; i < 4; i++) T(i % 2 ? 500 : 700, 0.22, 'sawtooth', 0.07, 0, i * 0.26);
    else if (id === 'medical') for (let i = 0; i < 3; i++) T(1046, 0.25, 'sine', 0.13, 0, i * 0.3);
    else if (id === 'abandon') for (let i = 0; i < 3; i++) { T(300, 1.0, 'sawtooth', 0.08, 600, i * 1.1); T(450, 1.0, 'square', 0.04, 450, i * 1.1); }
    else if (id === 'clear') { T(784, 0.25, 'sine', 0.13); T(1046, 0.5, 'sine', 0.13, 0, 0.22); }
  }
  clang(vol = 0.25) { this.tone(160 + Math.random() * 80, 0.9, 'triangle', vol, -60); this.noise(0.3, vol * 0.6, 900, 4, 'bandpass'); }
  zap() { this.noise(0.25, 0.22, 2500, 1.5, 'bandpass'); this.tone(1200, 0.12, 'sawtooth', 0.06, -900); }
  chirp() { this.tone(1760, 0.07, 'sine', 0.1); this.tone(2349, 0.09, 'sine', 0.1, 0, 0.08); }
  squelch() { this.noise(0.35, 0.4, 400, 2, 'lowpass'); this.noise(0.2, 0.25, 1500, 3, 'bandpass', 0.05); }
  breath(vol = 0.12) { this.noise(0.45, vol, 900, 0.5, 'bandpass'); }
  setVolume(v) { if (this.master) this.master.gain.value = v; this.vol = v; }
  flick() { this.noise(0.05, 0.1, 3000, 2, 'highpass'); }
}
