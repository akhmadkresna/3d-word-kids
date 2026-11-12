// Procedural stage definitions. Obstacles scale with each vehicle's wheel size + speed and with stage number.
import { mulberry32, trainLength } from './terrain.js';
import SPECS from './vehicleSpecs.json' with { type: 'json' };
import { vehiclePhysics, GRAVITY, FLOAT } from './vehicleClass.js';

export const THEMES = ['meadow', 'desert', 'snow', 'sunset', 'candy', 'night'];
const UNLOCK = { hills: 1, bumps: 1, jump: 1, mountain: 1, rampTrain: 1, bumpfield: 1, washboard: 2, roller: 3, shrooms: 3, tunnel: 4, skijump: 5, rainbow: 6, loop: 7, boost: 2, slope: 4, crates: 6, drop: 8, funk: 4, whoops: 5, launcher: 8, barrels: 8, boostjump: 12, pins: 14, balls: 16, logs: 18, ice: 20, ferry: 20, seesaw: 24, spring: 28, steps: 30, mud: 34 };
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
    case 'mountain': return 10 + s.up + s.plateau + s.down + 4;
    case 'rampTrain': return s.runup + s.n * (s.rampLen + (s.gap || 0) + s.land) + s.land;
    case 'bumpfield': return s.ws.reduce((a, b) => a + b, 0) + 3;
    case 'skijump': return s.runup + s.rampLen + 12 + (s.drop - s.rise) * 4.5 + 4;
    case 'roller': return s.n * s.w + 3;
    case 'loop': { const n = s.n || 1; return s.runup + 6 * (n - 1) + n * 17 + (n - 1) * (s.R + 6) + s.R + 12; }
    case 'funk': return s.w.reduce((a, b) => a + b, 0) + s.gap.reduce((a, b) => a + b, 0) + 3;
    case 'washboard': return 7 + s.n * s.wl + 4;
    case 'whoops': return 7 + s.n * s.w + 4;
    case 'launcher': return 10 + s.w + 8;
    case 'rainbow': return 10 + s.up * 2 + s.top;
    case 'tunnel': return 12 + s.len;
    case 'shrooms': return s.n * (s.gap + 6) + 10;
    case 'crates': return s.cols * s.size + 6;
    case 'barrels': return 8; case 'pins': return s.n * 1.3 + 6; case 'balls': return 12;
    case 'seesaw': return s.len + 6; case 'boost': return s.len + 4; case 'spring': return 12;
    case 'ice': case 'mud': return s.len + 4;
    default: return 10;
  }
}

// ease: 1 = intended difficulty, lower = easier fallback when the bot cannot finish
export function generateStage(k, spec, attempt = 0, opts = {}) {
  // opts (recording mode): salt = extra randomness, theme = forced theme, avoid = obstacle types to make rarer, maxLen = cap stage length
  const seed = k * 7919 + attempt * 104729 + 17 + (opts.salt || 0) * 1299709, rnd = mulberry32(seed);
  const vp = vehiclePhysics(spec), r = Math.min(...vp.axles.map((a) => a.r));
  const boss = k % 10 === 0, ease = Math.max(0.3, 1 - attempt * 0.12);
  const d = Math.min(1, (k / 100 + (boss ? 0.08 : 0))) * ease;
  const theme = opts.theme || THEMES[(k - 1) % THEMES.length];
  const target = Math.min(opts.maxLen || 1e9, lerp(120, 300, k / 100) * (boss ? 1.2 : 1) * lerp(0.85, 1.15, rnd()));
  const avail = Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= k);
  const weights = Object.fromEntries(avail.map((t) => [t, 1]));
  if (theme === 'snow' && weights.ice) weights.ice = 3;
  if (theme === 'desert' && weights.mud) weights.mud = 2;
  if (k < 10) { weights.hills = 2; weights.bumps = 1; }
  weights.jump = k < 10 ? 1.6 : 1.3; // jumps over gaps are the signature obstacle
  if (weights.boostjump) weights.boostjump = 2;
  if (weights.ferry) weights.ferry = 1.5;
  if (weights.drop) weights.drop = 2;
  weights.mountain = 0.35; if (weights.loop) weights.loop = 1.6; if (weights.rainbow) weights.rainbow = 1.6; if (weights.tunnel) weights.tunnel = 1.2; if (weights.shrooms) weights.shrooms = 1.6;
  for (const t of ['funk', 'washboard', 'whoops', 'launcher']) if (weights[t]) weights[t] = 2.2; // the bumpy, flying and shaking obstacles are favourites if (weights.roller) weights.roller = 2.5; if (weights.skijump) weights.skijump = 2;
  for (const t of opts.avoid || []) if (weights[t] && t !== 'jump') weights[t] *= 0.3;
  // trains pull 2-4 wagons (gerbong). They are too long for loops, ferries and seesaws.
  const isTrain = /train/.test(spec.id) && !spec.carriage;
  let wagons = [];
  if (isTrain) {
    const pool = SPECS.filter((v) => v.carriage).map((v) => v.id), n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) wagons.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    for (const t of ['loop', 'ferry', 'seesaw']) delete weights[t];
  }
  const trainLen = trainLength({ vehicle: spec.id, wagons });
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
    mountain() { // peak slope = 1.5*h/up ~= 0.5 (27 deg), which every vehicle class climbs in the bot tests
      const h = +(lerp(14, 46, Math.pow(d, 0.8)) * (0.85 + rnd() * 0.3)).toFixed(1), cliff = d > 0.4 && rnd() < 0.4 ? +(h * 0.35).toFixed(1) : 0;
      return { t: 'mountain', h, up: +(h * 3).toFixed(1), plateau: +lerp(5, 9, rnd()).toFixed(1), cliff, down: +((h - cliff) * 3.3).toFixed(1) };
    },
    skijump() {
      const rise = +(lerp(4, 8, d) * (0.85 + rnd() * 0.3)).toFixed(1), drop = +(rise * 1.15 + lerp(2, 5, d)).toFixed(1);
      return { t: 'skijump', runup: +lerp(28, 36, rnd()).toFixed(1), rampLen: +(rise / 0.55).toFixed(1), rise, drop };
    },
    rampTrain() { // launch ramps back to back; the landing zone is sized to how far this vehicle flies
      const rise = +(lerp(2.8, 4.8, d) * (0.85 + rnd() * 0.3)).toFixed(1), land = +Math.max(30, Math.min(46, vp.top * 1.7), trainLen + 14).toFixed(0);
      // CLIFF GAPS: about 70 % of ramp trains launch over a water gap (fall in = splash + respawn); the gap is 50-78 % of this vehicle's flight distance
      const v = vp.top * 0.85, range = (v * v * Math.sin(2 * Math.atan(0.55))) / (GRAVITY * (1 - FLOAT)), gap = rnd() < 0.7 ? +Math.max(7, Math.min(30, range * lerp(0.5, 0.78, d))).toFixed(1) : 0;
      return { t: 'rampTrain', n: 2 + Math.floor(d * 2.4 + rnd() * 0.8), runup: 16, rampLen: +(rise / 0.55).toFixed(1), rise, land, gap };
    },
    bumpfield() { // 10-16 big bouncy bumps, heights limited by wheel size and bump width
      const n = 10 + Math.floor(rnd() * 5 + d * 4), ws = [], hs = [];
      for (let i = 0; i < n; i++) { const w = +lerp(3.6, 5.6, rnd()).toFixed(1); ws.push(w); hs.push(+Math.min(r * 2.3, w * 0.2, lerp(0.55, 1.25, rnd()) * (0.8 + d * 0.4)).toFixed(2)); }
      return { t: 'bumpfield', n, ws, hs };
    },
    funk() { // random funky bump shapes, sized to the vehicle's wheels
      const n = 4 + Math.floor(d * 3 + rnd() * 2), shapes = [], w = [], h = [], gap = [];
      const WIDTH = [[4, 7], [4, 6], [6.5, 8.5], [5, 7]]; // round, spike, camel (two humps), plateau: narrow shapes get steep, so each has a minimum width
      for (let i = 0; i < n; i++) { const k = Math.floor(rnd() * 4), ww = +lerp(WIDTH[k][0], WIDTH[k][1], rnd()).toFixed(1); shapes.push(k); w.push(ww); h.push(+Math.min(r * 2.2, ww * 0.21, lerp(0.9, 2.0, rnd()) * (0.7 + d * 0.5)).toFixed(2)); gap.push(+lerp(2, 6, rnd()).toFixed(1)); }
      return { t: 'funk', n, shapes, w, h, gap };
    },
    washboard() { return { t: 'washboard', n: 14 + Math.floor(rnd() * 10 + d * 8), wl: +lerp(1.6, 2.2, rnd()).toFixed(2), h: +Math.min(0.3, r * 0.6).toFixed(2) }; },
    whoops() { const w = +lerp(8, 10, rnd()).toFixed(1); return { t: 'whoops', n: 4 + Math.floor(rnd() * 3 + d * 3), w, h: +Math.min(r * 3.2, lerp(1.1, 1.8, rnd()) * (0.8 + d * 0.4)).toFixed(2) }; },
    launcher() { return { t: 'launcher', w: +lerp(5, 7, rnd()).toFixed(1), h: +lerp(1.6, 2.4, rnd()).toFixed(1), far: 28 }; },
    loop() { // ring radius grows with the vehicle's height so tall trains/trams still fit inside
      const carH = vp.chassis.y1 - (Math.min(...vp.axles.map((a) => a.y - a.r)));
      return { t: 'loop', n: k >= 30 && rnd() < 0.45 ? 2 : 1, runup: +lerp(30, 36, rnd()).toFixed(1), R: +Math.max(lerp(5, 7.5, d), carH * 0.85 + 1.6).toFixed(1) };
    },
    rainbow() { const h = +(lerp(5, 12, d) * (0.8 + rnd() * 0.4)).toFixed(1); return { t: 'rainbow', h, up: +(h * 3.2).toFixed(1), top: +lerp(14, 26, rnd()).toFixed(1) }; },
    tunnel() { return { t: 'tunnel', len: +lerp(42, 72, rnd()).toFixed(1), bumps: 3 }; },
    shrooms() { return { t: 'shrooms', n: 2 + Math.floor(d * 2 + rnd()), gap: +lerp(24, 30, rnd()).toFixed(1) }; },
    roller() { return { t: 'roller', n: 3 + Math.floor(d * 3), w: +lerp(22, 32, rnd()).toFixed(1), amp: +(lerp(2.5, 4.8, d) * (0.85 + rnd() * 0.3)).toFixed(1) }; },
    seesaw() { return { t: 'seesaw', len: 9 }; },
    boost() { return { t: 'boost', len: +lerp(8, 14, rnd()).toFixed(1) }; },
    spring() { return { t: 'spring' }; },
    ice() { return { t: 'ice', len: +lerp(14, 28, rnd()).toFixed(1) }; },
    mud() { return { t: 'mud', len: +lerp(14, 28, rnd()).toFixed(1) }; },
  };

  const segs = []; let total = 16 + 16 + 6, drift = 0, last = '', featureCount = 0;
  // PACE: no flat filler. Every stage = a RAMP TRAIN (flying!) + a BUMP FIELD (bouncing!) + one showpiece or favourite bumpy obstacle.
  const showpieces = ['shrooms', 'tunnel', 'rainbow', 'loop'].filter((t) => UNLOCK[t] <= k && !(isTrain && t === 'loop'));
  const bumpy = ['washboard', 'funk', 'whoops', 'launcher', 'jump'].filter((t) => weights[t]);
  const classics = Object.keys(weights).filter((t) => !['jump', 'mountain', 'shrooms', 'tunnel', 'rainbow', 'loop', 'hills', 'slope', 'rampTrain', 'bumpfield'].includes(t));
  const third = rnd() < 0.55 && showpieces.length ? showpieces[Math.floor(rnd() * showpieces.length)] : bumpy[Math.floor(rnd() * bumpy.length)];
  const fourth = !opts.maxLen && rnd() < 0.7 ? (rnd() < 0.5 ? 'jump' : classics.length ? classics[Math.floor(rnd() * classics.length)] : null) : null; // 'jump' = ramp over a water gap (a cliff you can fall off)
  const forced = ['rampTrain', 'bumpfield', third, ...(fourth ? [fourth] : [])];
  if (rnd() < 0.5) { const t = forced[0]; forced[0] = forced[1]; forced[1] = t; }
  while (total < target || featureCount < forced.length) {
    // between features: a couple of small bumps (or nothing) - never an empty road
    if (featureCount > 0) { const sb = { t: 'bumps', n: 2, h: +Math.min(0.4, r * 0.8).toFixed(2), w: 3.6, gap: 2 }; if (rnd() < 0.7) { segs.push(sb); total += segLength(sb); } else { segs.push({ t: 'flat', len: 4 }); total += 4; } }
    let type = forced[featureCount] || pick();
    if (!forced[featureCount] && type === last && rnd() < 0.7) type = pick(); last = type; featureCount++;
    let s = g[type]();
    if (s.t === 'mountain') { const room = Math.max(8, (target - total) / 6.4); if (s.h > room) { const h = +room.toFixed(1), cliff = s.cliff ? +(h * 0.35).toFixed(1) : 0; s = { ...s, h, up: +(h * 3).toFixed(1), cliff, down: +((h - cliff) * 3.3).toFixed(1) }; } }
    if (s.t === 'slope') { if (drift > 10 && s.dy > 0) s.dy = -s.dy; if (drift < -10 && s.dy < 0) s.dy = -s.dy; drift += s.dy; }
    if (s.t === 'jump') drift += s.rise + s.landDy;
    segs.push(s); total += segLength(s);
    if (s.t === 'jump' && k >= 15 && rnd() < 0.35) { const j2 = g.jump(true); drift += j2.rise + j2.landDy; segs.push(j2); total += segLength(j2); }
  }
  // pull the stage back to roughly its starting height so it never drifts off screen
  if (Math.abs(drift) > 3) segs.push({ t: 'slope', len: Math.min(80, Math.abs(drift) * 4 + 12), dy: -drift });
  // the finale: a SUPER RAMP (boosted, 7-11 m tall) with a long flight and landing zone; trains get a lower one
  const rise = +Math.min(isTrain ? 7 : 11, lerp(7, 11, d) * (0.9 + rnd() * 0.2)).toFixed(1), finale = { runup: 40, rise, rampLen: +(rise / 0.6).toFixed(1), land: opts.maxLen ? 95 : 105 };
  return { k, vehicle: spec.id, theme, seed, attempt, boss, dropIn: true, finale, ...(wagons.length ? { wagons } : {}), segs, expectedLength: Math.round(total) };
}
