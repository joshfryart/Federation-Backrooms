// Procedural WebAudio: no asset files needed.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.vol ?? 0.8; this.master.connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ship hum
    this.hum = ctx.createGain(); this.hum.gain.value = 0.10; this.hum.connect(this.master);
    for (const f of [48, 72.3, 96.5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = f < 60 ? 0.5 : 0.2;
      o.connect(lp); lp.connect(g); g.connect(this.hum); o.start();
    }
    const nz = ctx.createBufferSource(); nz.buffer = this.noiseBuf; nz.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    this.nzGain = ctx.createGain(); this.nzGain.gain.value = 0.03;
    nz.connect(bp); bp.connect(this.nzGain); this.nzGain.connect(this.master); nz.start();

    // tension drone (gain driven by gorn proximity)
    this.tension = ctx.createGain(); this.tension.gain.value = 0; this.tension.connect(this.master);
    for (const f of [55, 58.3, 110.7]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      o.connect(lp); lp.connect(this.tension); o.start();
    }
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
  klaxon() { for (let i = 0; i < 3; i++) { this.tone(520, 0.35, 'sawtooth', 0.08, 120, i * 0.5); this.tone(380, 0.35, 'square', 0.04, 80, i * 0.5); } }
  clang(vol = 0.25) { this.tone(160 + Math.random() * 80, 0.9, 'triangle', vol, -60); this.noise(0.3, vol * 0.6, 900, 4, 'bandpass'); }
  zap() { this.noise(0.25, 0.22, 2500, 1.5, 'bandpass'); this.tone(1200, 0.12, 'sawtooth', 0.06, -900); }
  chirp() { this.tone(1760, 0.07, 'sine', 0.1); this.tone(2349, 0.09, 'sine', 0.1, 0, 0.08); }
  squelch() { this.noise(0.35, 0.4, 400, 2, 'lowpass'); this.noise(0.2, 0.25, 1500, 3, 'bandpass', 0.05); }
  breath(vol = 0.12) { this.noise(0.45, vol, 900, 0.5, 'bandpass'); }
  setVolume(v) { if (this.master) this.master.gain.value = v; this.vol = v; }
  flick() { this.noise(0.05, 0.1, 3000, 2, 'highpass'); }
}
