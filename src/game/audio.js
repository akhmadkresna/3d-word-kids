// Realtime sound: engine, effects and a small happy tune, all synthesized (no files).
export class GameAudio {
  constructor() { this.ctx = null; this.muted = false; this.musicOn = true; this.noiseBuf = null; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
    this.musBus = ctx.createGain(); this.musBus.gain.value = 0.16; this.musBus.connect(this.master);
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
    // engine: two detuned oscillators through a low-pass
    this.eng = { o1: ctx.createOscillator(), o2: ctx.createOscillator(), g: ctx.createGain(), f: ctx.createBiquadFilter() };
    this.eng.o1.type = 'sawtooth'; this.eng.o2.type = 'square'; this.eng.f.type = 'lowpass'; this.eng.f.frequency.value = 500; this.eng.g.gain.value = 0;
    this.eng.o1.connect(this.eng.f); this.eng.o2.connect(this.eng.f); this.eng.f.connect(this.eng.g); this.eng.g.connect(this.sfxBus);
    this.eng.o1.start(); this.eng.o2.start();
    this._startMusic();
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; }
  setMusic(on) { this.musicOn = on; if (this.musBus) this.musBus.gain.value = on ? 0.16 : 0; }

  engine(throttle, speed, alive, damage = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = 55 + Math.min(1, Math.abs(speed) / 22) * 120 + throttle * 25;
    this.eng.o1.frequency.setTargetAtTime(f, t, 0.05); this.eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.eng.f.frequency.setTargetAtTime(350 + throttle * 700 + Math.abs(speed) * 20, t, 0.08);
    this.eng.o1.detune.setTargetAtTime((Math.random() - 0.5) * damage * 500, t, 0.03); // rough, sputtering engine when damaged
    this.eng.g.gain.setTargetAtTime(alive ? (0.05 + throttle * 0.09) * (1 - damage * 0.35 * Math.random()) : 0, t, 0.05);
  }

  _noise(dur, { lp = 3000, hp = 0, gain = 0.5, decay = 6, when = 0 } = {}) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(h); h.connect(g); g.connect(this.sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  _tone(freq, dur, { type = 'sine', gain = 0.3, slide = 0, when = 0, attack = 0.005 } = {}) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }

  play(e) {
    if (!this.ctx) return;
    switch (e.type) {
      case 'bump': if (e.power < 0.15) break; this._noise(0.25, { lp: 900, gain: 0.25 + e.power * 0.7, decay: 8 }); this._tone(110 - e.power * 40, 0.2, { gain: 0.3 * e.power + 0.1, slide: -50 });
        if (e.hit > 0.03) { this._noise(0.18, { lp: 6000, hp: 1500, gain: 0.3 + e.hit * 1.2 }); this._tone(260 + Math.random() * 240, 0.16, { type: 'square', gain: 0.05 + e.hit * 0.5, slide: -120 }); } break;
      case 'splash': this._noise(1.0, { lp: 2500, hp: 400, gain: 0.8 }); this._tone(300, 0.4, { gain: 0.3, slide: -180 }); [0.5, 0.7, 0.9].forEach((w, i) => this._tone(330 + i * 70, 0.12, { gain: 0.2, slide: 300, when: w })); break;
      case 'boost': this._noise(0.6, { lp: 6000, hp: 1200, gain: 0.35 }); this._tone(300, 0.4, { type: 'sawtooth', gain: 0.12, slide: 500 }); break;
      case 'spring': this._tone(180, 0.35, { type: 'triangle', gain: 0.4, slide: 700 }); break;
      case 'checkpoint': this._tone(880, 0.12, { gain: 0.25 }); this._tone(1320, 0.25, { gain: 0.25, when: 0.1 }); break;
      case 'reset': this._tone(500, 0.08, { gain: 0.25, type: 'square' }); this._tone(300, 0.1, { gain: 0.25, type: 'square', when: 0.08 }); break;
      case 'finish': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, i === 3 ? 0.9 : 0.14, { type: 'square', gain: 0.16, when: i * 0.12 })); this._noise(2.2, { lp: 3500, hp: 500, gain: 0.3 }); break;
      case 'hint': this._tone(660, 0.15, { gain: 0.2, type: 'triangle' }); this._tone(520, 0.2, { gain: 0.2, type: 'triangle', when: 0.15 }); break;
    }
  }

  _startMusic() {
    const ctx = this.ctx, beat = 60 / 118, scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
    const bass = [130.81, 110, 87.31, 98], shift = [0, 5, 3, 4], pat = [0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 6, 4, 3, 1, 2, 0];
    let i = 0, next = ctx.currentTime + 0.2;
    const note = (f, t, d, type, g) => { const o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.value = f; a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0008, t + d); o.connect(a); a.connect(this.musBus); o.start(t); o.stop(t + d + 0.02); };
    const tick = () => {
      while (next < ctx.currentTime + 0.4) {
        const bar = Math.floor(i / 8) % 4, e = i % 8;
        note(scale[(pat[i % 16] + shift[bar]) % 8], next, beat * 0.5, 'square', 0.35);
        if (e % 4 === 0) note(bass[bar], next, beat * 1.6, 'triangle', 0.9);
        if (e % 4 === 0) { const o = ctx.createOscillator(), a = ctx.createGain(); o.frequency.setValueAtTime(130, next); o.frequency.exponentialRampToValueAtTime(45, next + 0.12); a.gain.setValueAtTime(0.9, next); a.gain.exponentialRampToValueAtTime(0.001, next + 0.16); o.connect(a); a.connect(this.musBus); o.start(next); o.stop(next + 0.2); }
        i++; next += beat / 2;
      }
    };
    setInterval(tick, 120); tick();
  }
}
