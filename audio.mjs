// Procedural audio: sound effects from a scenario's cues + a bouncy generated background tune. No assets needed.
import fs from 'node:fs';

const SR = 44100, TAU = Math.PI * 2;
const rng = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const saw = (ph) => ((ph / TAU) % 1) * 2 - 1;
const sq = (ph) => (((ph / TAU) % 1) < 0.5 ? 1 : -1);
const tri = (ph) => 2 * Math.abs(saw(ph)) - 1;
const pulse = (ph, w = 0.25) => (((ph / TAU) % 1) < w ? 1 : -1);

// Run gen(t, k) for len seconds starting at t0 and mix it into buf.
function add(buf, t0, len, gain, gen) {
  const i0 = Math.round(t0 * SR), m = Math.round(len * SR);
  for (let i = 0; i < m; i++) { const j = i0 + i; if (j >= 0 && j < buf.length) buf[j] += gen(i / SR, i / m) * gain; }
}

const voices = {
  engine(b, c) {
    const len = c.t1 - c.t0; let ph = 0, lp = 0;
    add(b, c.t0, len, c.g, (t, k) => {
      const f = c.f0 + (c.f1 - c.f0) * k, wob = 1 + 0.035 * Math.sin(TAU * 17 * t);
      ph += (TAU * f * wob) / SR;
      lp += 0.14 * (saw(ph) * 0.55 + sq(ph * 0.5) * 0.45 - lp);
      return lp * Math.min(1, t / 0.15, (len - t) / 0.2);
    });
  },
  whoosh(b, c) {
    const len = c.t1 - c.t0, r = rng(3); let l1 = 0, l2 = 0;
    add(b, c.t0, len, c.g, (t, k) => {
      const x = r() * 2 - 1, a = 0.04 + 0.3 * Math.sin(k * Math.PI);
      l1 += a * (x - l1); l2 += 0.015 * (l1 - l2);
      return (l1 - l2) * 3 * Math.sin(k * Math.PI) ** 1.5;
    });
  },
  crash(b, c) {
    const r = rng(8); let lp = 0;
    add(b, c.t0, 0.9, c.g, (t) => { lp += 0.35 * ((r() * 2 - 1) - lp); return lp * Math.exp(-t * 6) * 1.4; });
    add(b, c.t0, 0.6, c.g, (t) => Math.sin(TAU * (30 + 90 * Math.exp(-t * 5)) * t) * Math.exp(-t * 6));
  },
  thud(b, c) {
    const r = rng(2); let lp = 0;
    add(b, c.t0, 0.5, c.g, (t) => Math.sin(TAU * (40 + 90 * Math.exp(-t * 14)) * t) * Math.exp(-t * 9));
    add(b, c.t0, 0.4, c.g * 0.6, (t) => { lp += 0.12 * ((r() * 2 - 1) - lp); return lp * Math.exp(-t * 10) * 2; });
  },
  clatter(b, c) {
    const r = rng(17), span = c.t1 - c.t0;
    for (let i = 0; i < c.count; i++) {
      const u = r(), t = c.t0 + span * u ** 1.7, amp = (1 - u) * 0.8 + 0.2, a = 0.1 + r() * 0.35, f = 220 + r() * 500;
      let lp = 0; const nr = rng(100 + i);
      add(b, t, 0.09, c.g * amp, (tt) => { lp += a * ((nr() * 2 - 1) - lp); return (lp * 1.8 + Math.sin(TAU * f * tt) * 0.5) * Math.exp(-tt * 55); });
    }
  },
  trombone(b, c) { // sad "wah wah wah waaah"
    let t0 = c.t0;
    for (const [f, d] of [[233, 0.35], [220, 0.35], [208, 0.35], [196, 1.0]]) {
      let ph = 0, lp = 0; const last = d > 0.9;
      add(b, t0, d, c.g, (t, k) => {
        const vib = last ? 1 + 0.025 * Math.sin(TAU * 5.5 * t) * Math.min(1, t * 3) : 1, fl = last ? f * (1 - 0.06 * k) : f;
        ph += (TAU * fl * vib) / SR; lp += 0.07 * (saw(ph) - lp);
        return lp * 2.2 * Math.min(1, t / 0.03, (d - t) / 0.08);
      });
      t0 += d;
    }
  },
  splash(b, c) {
    const r = rng(31); let l1 = 0, l2 = 0;
    add(b, c.t0, 1.2, c.g, (t) => { const x = r() * 2 - 1; l1 += 0.22 * (x - l1); l2 += 0.03 * (l1 - l2); return (l1 - l2) * 3 * Math.min(1, t / 0.01) * Math.exp(-t * 3.2); });
    add(b, c.t0, 0.5, c.g * 0.7, (t) => Math.sin(TAU * (260 - 160 * t) * t) * Math.exp(-t * 7));
  },
  bloop(b, c) { // little bubbles
    for (const [o, f] of [[0, 330], [0.22, 420], [0.4, 290], [0.62, 380]]) {
      add(b, c.t0 + o, 0.16, c.g, (t) => Math.sin(TAU * (f + 900 * t) * t) * Math.exp(-t * 18));
    }
  },
  pop(b, c) {
    const r = rng(6);
    add(b, c.t0, 0.25, c.g, (t) => ((r() * 2 - 1) * 0.6 + Math.sin(TAU * (500 + 1500 * Math.exp(-t * 30)) * t)) * Math.exp(-t * 28));
  },
  fanfare(b, c) {
    let t0 = c.t0;
    for (const [f, d] of [[523.3, 0.11], [659.3, 0.11], [784, 0.11], [1046.5, 0.9]]) {
      let ph = 0;
      add(b, t0, d + 0.3, c.g, (t) => { ph += (TAU * f) / SR; return (sq(ph) * 0.35 + tri(ph) * 0.5 + tri(ph * 1.5) * 0.15) * Math.min(1, t / 0.005) * Math.exp(-t * (d > 0.5 ? 2.2 : 12)); });
      t0 += d;
    }
  },
  cheer(b, c) {
    const len = c.t1 - c.t0, r = rng(55); let l1 = 0, l2 = 0, ph = [0, 0, 0, 0, 0];
    add(b, c.t0, len, c.g, (t, k) => {
      const x = r() * 2 - 1; l1 += 0.28 * (x - l1); l2 += 0.04 * (l1 - l2);
      const clap = 0.65 + 0.35 * Math.sin(TAU * (6 + 3 * k) * t + Math.sin(t * 3) * 2);
      let v = 0; ph = ph.map((p, i) => { const f = (380 + i * 95) * (1 + 0.1 * k) * (1 + 0.02 * Math.sin(TAU * (5 + i) * t)); return p + (TAU * f) / SR; });
      v = ph.reduce((a, p) => a + Math.sin(p), 0) * 0.08;
      return ((l1 - l2) * 1.6 + v) * clap * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * Math.min(1, (len - t) / 0.5);
    });
  },
  horn(b, c) {
    for (const o of [0, 0.3]) {
      let p1 = 0, p2 = 0;
      add(b, c.t0 + o, 0.2, c.g, (t) => { p1 += (TAU * 420) / SR; p2 += (TAU * 530) / SR; return (sq(p1) + sq(p2)) * 0.3 * Math.min(1, t / 0.01, (0.2 - t) / 0.02); });
    }
  },
};

// Cheerful loop: I - vi - IV - V, bass + kick/snare/hat + pulse-wave melody. 118 bpm.
function music(buf, duration) {
  const beat = 60 / 118, eighth = beat / 2, r = rng(4);
  const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
  const bass = [130.81, 110, 87.31, 98], shift = [0, 5, 3, 4];
  const pat = [0, 2, 4, 2, 1, 3, 5, 3, 2, 4, 6, 4, 3, 1, 2, 0];
  for (let i = 0; i * eighth < duration; i++) {
    const t = i * eighth, bar = Math.floor(i / 8) % 4, e = i % 8;
    let ph = 0;
    const f = scale[(pat[(i % 16)] + shift[bar]) % 8];
    add(buf, t, eighth * 1.4, 0.16, (tt) => { ph += (TAU * f) / SR; return pulse(ph) * Math.exp(-tt * 9) * Math.min(1, tt / 0.004); });
    if (e % 4 === 0) { let bp = 0; add(buf, t, beat * 1.6, 0.34, (tt) => { bp += (TAU * bass[bar]) / SR; return tri(bp) * Math.exp(-tt * 3.2) * Math.min(1, tt / 0.01); }); }
    if (e % 4 === 0) add(buf, t, 0.2, 0.5, (tt) => Math.sin(TAU * (45 + 90 * Math.exp(-tt * 28)) * tt) * Math.exp(-tt * 12));
    if (e % 4 === 2) { let lp = 0; add(buf, t, 0.15, 0.22, (tt) => { lp += 0.5 * ((r() * 2 - 1) - lp); return lp * Math.exp(-tt * 26); }); }
    let hp = 0; add(buf, t, 0.05, 0.07, (tt) => { const x = r() * 2 - 1; const y = x - hp; hp = x; return y * Math.exp(-tt * 80); });
  }
}

export function renderAudio({ cues = [], duration, withMusic = true, withSfx = true }) {
  const n = Math.ceil(duration * SR), sfx = new Float32Array(n), mus = new Float32Array(n);
  if (withSfx) for (const c of cues) if (voices[c.type]) voices[c.type](sfx, c);
  if (withMusic) music(mus, duration);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR; let duck = 1;
    for (const c of cues) if (c.type === 'duck') {
      const w = Math.min(1, Math.max(0, Math.min((t - (c.t0 - 0.05)) / 0.1, (c.t1 + 0.25 - t) / 0.25)));
      duck = Math.min(duck, 1 - (1 - c.g) * w);
    }
    out[i] = sfx[i] + mus[i] * 0.6 * duck;
  }
  // gentle limiter, normalize, fade out the last 0.7 s
  let peak = 0; for (let i = 0; i < n; i++) { out[i] = Math.tanh(out[i] * 1.1); peak = Math.max(peak, Math.abs(out[i])); }
  const g = peak > 0 ? 0.9 / peak : 1, fadeStart = Math.max(0, n - 0.7 * SR);
  for (let i = 0; i < n; i++) out[i] *= g * (i > fadeStart ? (n - i) / (n - fadeStart) : 1);
  return out;
}

export function writeWav(path, mono) {
  const n = mono.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, mono[i])) * 32767; buf.writeInt16LE(v, 44 + i * 4); buf.writeInt16LE(v, 46 + i * 4); }
  fs.writeFileSync(path, buf);
}

// CLI: node audio.mjs <scenario> [outcome] -> out/<scenario>-audio.wav
if (import.meta.url === `file://${process.argv[1]}`) {
  const [scenario = 'carJump', outcome = 'both'] = process.argv.slice(2);
  const m = await import(`./src/scenarios/${scenario}.cues.js`);
  const duration = outcome === 'fail' ? m.FAIL_LEN : outcome === 'success' ? m.WIN_LEN : m.FAIL_LEN + m.WIN_LEN;
  fs.mkdirSync('out', { recursive: true });
  const t0 = Date.now(); writeWav(`out/${scenario}-audio.wav`, renderAudio({ cues: m.cues(outcome), duration }));
  console.log(`wrote out/${scenario}-audio.wav (${duration}s) in ${Date.now() - t0}ms`);
}
