// Procedural stage definitions. Obstacles scale with each vehicle's wheel size + speed and with stage number.
import { mulberry32 } from './terrain.js';
import { vehiclePhysics, GRAVITY } from './vehicleClass.js';

export const THEMES = ['meadow', 'desert', 'snow', 'sunset', 'candy', 'night'];
const UNLOCK = { hills: 1, bumps: 1, jump: 1, boost: 2, slope: 4, crates: 6, drop: 8, barrels: 8, boostjump: 12, pins: 14, balls: 16, logs: 18, ice: 20, ferry: 20, seesaw: 24, spring: 28, steps: 30, mud: 34 };
const lerp = (a, b, t) => a + (b - a) * t;

export function segLength(s) {
  switch (s.t) {
    case 'flat': return s.len;
    case 'slope': case 'hills': return s.len + 3;
    case 'bumps': return s.n * (s.w + 3);
    case 'logs': return s.n * 7.2 + 3;
    case 'steps': return s.n * s.run + 2;
    case 'jump': return s.runup + s.rampLen + s.w + 10;
    case 'boostjump': return s.runup + s.boostLen + 3 + s.rampLen + s.w + 10;
    case 'ferry': return s.runup + s.w + 14;
    case 'drop': return s.len + s.h * 4.5 + 10;
    case 'crates': return s.cols * s.size + 6;
    case 'barrels': return 8; case 'pins': return s.n * 1.3 + 6; case 'balls': return 12;
    case 'seesaw': return s.len + 6; case 'boost': return s.len + 4; case 'spring': return 12;
    case 'ice': case 'mud': return s.len + 4;
    default: return 10;
  }
}

// ease: 1 = intended difficulty, lower = easier fallback when the bot cannot finish
export function generateStage(k, spec, attempt = 0) {
  const seed = k * 7919 + attempt * 104729 + 17, rnd = mulberry32(seed);
  const vp = vehiclePhysics(spec), r = Math.min(...vp.axles.map((a) => a.r));
  const boss = k % 10 === 0, ease = Math.max(0.3, 1 - attempt * 0.12);
  const d = Math.min(1, (k / 100 + (boss ? 0.08 : 0))) * ease;
  const theme = THEMES[(k - 1) % THEMES.length];
  const target = lerp(170, 520, k / 100) * (boss ? 1.25 : 1) * lerp(0.85, 1.15, rnd());
  const avail = Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= k);
  const weights = Object.fromEntries(avail.map((t) => [t, 1]));
  if (theme === 'snow' && weights.ice) weights.ice = 3;
  if (theme === 'desert' && weights.mud) weights.mud = 2;
  if (k < 10) { weights.hills = 2; weights.bumps = 1; }
  weights.jump = k < 10 ? 5 : 4; // jumps over gaps are the signature obstacle
  if (weights.boostjump) weights.boostjump = 2;
  if (weights.ferry) weights.ferry = 1.5;
  if (weights.drop) weights.drop = 2;
  const pick = () => { const tot = Object.values(weights).reduce((a, b) => a + b, 0); let x = rnd() * tot; for (const [t, w] of Object.entries(weights)) { if ((x -= w) <= 0) return t; } return 'hills'; };

  const g = {
    hills() { const waves = rnd() < 0.5 ? 1 : 2, len = lerp(40, 70, rnd()), maxAmp = (0.55 * len) / (Math.PI * 2 * waves); return { t: 'hills', len: +len.toFixed(1), amp: +Math.min(maxAmp, lerp(1.2, 3.4, d) * (0.8 + rnd() * 0.4)).toFixed(2), waves }; },
    bumps() { return { t: 'bumps', n: 3 + Math.floor(rnd() * 3 + d * 4), h: +Math.min(r * 0.8, r * lerp(0.35, 0.8, d)).toFixed(2), w: +lerp(3, 5, rnd()).toFixed(1) }; },
    slope() { const len = lerp(35, 65, rnd()); const dir = rnd() < 0.5 ? 1 : -1; return { t: 'slope', len: +len.toFixed(1), dy: +(dir * Math.min(len * 0.34, lerp(5, 16, d) * (0.7 + rnd() * 0.6))).toFixed(1) }; },
    crates() { return { t: 'crates', cols: 2 + Math.floor(rnd() * (1 + d * 2)), rows: 1 + Math.floor(rnd() * (1 + d * 2.2)), size: 1.2 }; },
    barrels() { return { t: 'barrels', n: 6 + Math.floor(rnd() * 4 + d * 8) }; },
    pins() { return { t: 'pins', n: 6 + Math.floor(rnd() * 4 + d * 6) }; },
    balls() { return { t: 'balls', n: 10 + Math.floor(rnd() * 6 + d * 12) }; },
    logs() { return { t: 'logs', n: 2 + Math.floor(rnd() * 3 + d * 3), h: +Math.min(r * 0.62, r * lerp(0.4, 0.62, d)).toFixed(2), gap: +lerp(5, 8, rnd()).toFixed(1) }; },
    steps() { return { t: 'steps', n: 2 + Math.floor(rnd() * 2 + d * 2), h: +Math.min(r * 0.5, r * lerp(0.3, 0.5, d)).toFixed(2), run: +lerp(4, 6, rnd()).toFixed(1) }; },
    jump(short = false) {
      const v = vp.top * 0.82, rampLen = lerp(6, 9, rnd()), rise = +lerp(1.6, 2.6, rnd()).toFixed(2);
      const ang = Math.atan2(rise, rampLen), range = (v * v * Math.sin(2 * ang)) / GRAVITY;
      const w = Math.max(3.5, range * lerp(0.2, 0.78, d) * (0.85 + rnd() * 0.3));
      return { t: 'jump', runup: short ? 16 : +lerp(26, 36, rnd()).toFixed(1), rampLen: +rampLen.toFixed(1), rise, w: +w.toFixed(1), landDy: +(-rise * lerp(0.55, 0.85, rnd())).toFixed(2) };
    },
    boostjump() {
      const v = vp.top * 1.45 * 0.85, rampLen = lerp(7, 9, rnd()), rise = +lerp(2, 2.8, rnd()).toFixed(2);
      const ang = Math.atan2(rise, rampLen), range = (v * v * Math.sin(2 * ang)) / GRAVITY;
      return { t: 'boostjump', runup: 12, boostLen: 10, rampLen: +rampLen.toFixed(1), rise, w: +Math.max(8, range * lerp(0.3, 0.7, d)).toFixed(1), landDy: +(-rise * lerp(0.55, 0.85, rnd())).toFixed(2) };
    },
    ferry() { return { t: 'ferry', runup: 24, w: +lerp(14, 18, rnd()).toFixed(1), len: 10 }; },
    drop() { return { t: 'drop', len: +lerp(8, 14, rnd()).toFixed(1), h: +(lerp(2.5, 7, d) * (0.8 + rnd() * 0.4)).toFixed(1) }; },
    seesaw() { return { t: 'seesaw', len: 9 }; },
    boost() { return { t: 'boost', len: +lerp(8, 14, rnd()).toFixed(1) }; },
    spring() { return { t: 'spring' }; },
    ice() { return { t: 'ice', len: +lerp(14, 28, rnd()).toFixed(1) }; },
    mud() { return { t: 'mud', len: +lerp(14, 28, rnd()).toFixed(1) }; },
  };

  const segs = []; let total = 20 + 30, drift = 0, last = '', first = true;
  while (total < target) {
    const gap = +lerp(10, 24, rnd() * (1 - d * 0.4)).toFixed(1); segs.push({ t: 'flat', len: gap }); total += gap;
    let type = first ? 'jump' : pick(); // every stage opens with a ramp jump
    if (!first && type === last && rnd() < 0.7) type = pick(); last = type; first = false;
    let s = g[type]();
    if (s.t === 'slope') { if (drift > 10 && s.dy > 0) s.dy = -s.dy; if (drift < -10 && s.dy < 0) s.dy = -s.dy; drift += s.dy; }
    if (s.t === 'jump') drift += s.rise + s.landDy;
    segs.push(s); total += segLength(s);
    // later stages: chain a second jump right after the first
    if (s.t === 'jump' && k >= 15 && rnd() < 0.35) { const j2 = g.jump(true); drift += j2.rise + j2.landDy; segs.push(j2); total += segLength(j2); }
  }
  // pull the stage back to roughly its starting height so it never drifts off screen
  if (Math.abs(drift) > 3) segs.push({ t: 'slope', len: Math.min(80, Math.abs(drift) * 4 + 12), dy: -drift });
  return { k, vehicle: spec.id, theme, seed, attempt, boss, segs, expectedLength: Math.round(total) };
}
