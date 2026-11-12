// Turns a stage definition (a list of segments) into terrain + props. Pure data, no rendering/physics.
// Coordinates: x forward, y up, metres.
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sm = (t) => t * t * (3 - 2 * t);
const STEP = 0.8;

export function buildStage(def) {
  const rng = mulberry32(def.seed || 1);
  const S = { def, pieces: [], walls: [], props: [], pads: [], pits: [], blocks: [], checkpoints: [], loops: [], tunnels: [] };
  let x = 0, y = 0, cur = { surface: 'grass', pts: [[0, 0]] }, lastCp = -999;
  // collectibles: stars + balloons. Line/balloon requests are resolved once the ground height is known.
  S.collectibles = []; const lineReqs = [], balloonReqs = [], crng = mulberry32((def.seed || 1) + 4242);
  const addStar = (px, py) => S.collectibles.push({ type: 'star', x: px, y: py });
  const starLine = (x0, x1, hover = 1.7, step = 6.5) => lineReqs.push({ x0, x1, hover, step });
  const balloons = (x0, x1, n) => balloonReqs.push({ x0, x1, n });
  // a trail of stars along the arc a vehicle flies over a gap/cliff
  const starArc = (x0, y0, x1, y1, height, n) => { for (let i = 1; i <= n; i++) { const t = i / (n + 1); addStar(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + height * 4 * t * (1 - t)); } };

  const push = (nx, ny) => { cur.pts.push([nx, ny]); x = nx; y = ny; };
  const piece = (surface) => { if (cur.pts.length > 1) S.pieces.push(cur); cur = { surface, pts: [[x, y]] }; };
  const profile = (len, fn) => { const x0 = x, y0 = y, n = Math.max(1, Math.ceil(len / STEP)); for (let i = 1; i <= n; i++) push(x0 + (len * i) / n, y0 + fn(i / n)); };
  const flat = (len, surface = 'grass') => { if (surface !== cur.surface) piece(surface); profile(len, () => 0); if (surface !== 'grass') piece('grass'); };
  const groundAt = () => y;
  const checkpoint = () => { if (x - lastCp > 85) { S.checkpoints.push({ x, y }); lastCp = x; } };

  // a pit (water gap) between the current point and x+w; returns the lip/landing coordinates
  const pit = (w, landDy) => {
    piece('grass');
    const lipX = x, lipY = y, landX = x + w, landY = y + landDy;
    S.walls.push([[lipX, lipY], [lipX, lipY - 7]], [[landX, landY - 7], [landX, landY]]);
    S.pits.push({ x0: lipX, x1: landX, y: Math.min(lipY, landY) - 3 });
    x = landX; y = landY; cur = { surface: 'grass', pts: [[x, y]] };
    return { lipX, lipY, landX, landY };
  };

  const SEG = {
    flat: (s) => flat(s.len, s.surf),
    slope: (s) => { profile(s.len, (t) => s.dy * sm(t)); flat(3); },
    hills: (s) => { profile(s.len, (t) => s.amp * Math.sin(Math.PI * 2 * s.waves * t)); flat(3); },
    bumps: (s) => { for (let i = 0; i < s.n; i++) { profile(s.w, (t) => s.h * Math.sin(Math.PI * t)); flat(s.gap ?? 3); } },
    logs: (s) => { for (let i = 0; i < s.n; i++) { flat(s.gap ?? 6); S.blocks.push({ x: x + 0.35, y: y + s.h / 2, w: 0.7, h: s.h }); flat(1.2); } flat(3); },
    steps: (s) => { for (let i = 0; i < s.n; i++) { push(x, y + s.h); flat(s.run); } flat(2); },
    jump: (s) => { // runup, kicker ramp, pit, landing
      flat(s.runup); profile(s.rampLen, (t) => s.rise * t); const r = pit(s.w, s.landDy); flat(10);
      starArc(r.lipX, r.lipY, r.landX, r.landY, 2.6 + s.w * 0.16, 4 + Math.floor(s.w / 3));
    },
    mountain: (s) => { // HIGH CLIMB: long smooth climb, summit plateau with a big star, then down (optionally off a cliff)
      flat(6); profile(s.up, (t) => s.h * sm(t)); flat(s.plateau);
      addStar(x - s.plateau / 2, y + 2.6); addStar(x - s.plateau / 2 - 2.5, y + 1.8); addStar(x - s.plateau / 2 + 2.5, y + 1.8);
      if (s.cliff) { push(x, y - s.cliff); flat(4); profile(s.down, (t) => -(s.h - s.cliff) * sm(t)); } else profile(s.down, (t) => -s.h * sm(t));
      flat(4);
    },
    skijump: (s) => { // very tall kicker, cliff drop into a landing zone far below, then a long ramp back up
      flat(s.runup); profile(s.rampLen, (t) => s.rise * t); const lipX = x, lipY = y; push(x, y - s.drop); flat(8);
      const L = 20 + s.rise * 2.6; for (let i = 1; i <= 8; i++) { const t = i / 9; addStar(lipX + L * t, lipY + (s.rise * 0.55 + 2.8) * 4 * t * (1 - t) - s.drop * t * t * 0.7); }
      profile((s.drop - s.rise) * 4.5, (t) => (s.drop - s.rise) * sm(t)); flat(4);
    },
    roller: (s) => { // roller-coaster hills: big rounded crests = airtime
      for (let i = 0; i < s.n; i++) { addStar(x + s.w / 2, y + s.amp + 2.6); profile(s.w, (t) => s.amp * Math.pow(Math.sin(Math.PI * t), 1.6)); }
      flat(3);
    },
    boostjump: (s) => { // boost pad -> ramp -> very wide gap
      flat(s.runup); S.pads.push({ type: 'boost', x0: x, x1: x + s.boostLen, y }); flat(s.boostLen, 'boost'); flat(3);
      profile(s.rampLen, (t) => s.rise * t); const r = pit(s.w, s.landDy); flat(10);
      starArc(r.lipX, r.lipY, r.landX, r.landY, 3 + s.w * 0.16, 5 + Math.floor(s.w / 3));
    },
    ferry: (s) => { // gap crossed on a moving platform: wait for it to dock, then drive on
      flat(s.runup); const r = pit(s.w, 0);
      S.props.push({ type: 'ferry', x0: r.lipX, x1: r.landX, y: r.lipY, len: s.len });
      flat(14);
    },
    loop: (s) => { // boost pad -> scripted vertical loop (the vehicle rides the ring), then flat ground
      flat(s.runup); S.pads.push({ type: 'boost', x0: x, x1: x + 12, y }); flat(12, 'boost'); flat(5);
      const l = { x0: x, y, R: s.R }; S.loops.push(l);
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + ((i + 0.5) / 8) * Math.PI * 2; addStar(l.x0 + (s.R - 1.4) * Math.cos(a), y + s.R + (s.R - 1.4) * Math.sin(a)); }
      flat(s.R + 12);
    },
    rainbow: (s) => { // floating rainbow bridge: no ground under it
      flat(6); piece('rainbow'); profile(s.up, (t) => s.h * sm(t)); flat(s.top); profile(s.up, (t) => -s.h * sm(t)); piece('grass'); flat(4);
    },
    tunnel: (s) => { // dark tunnel with a few bumps (rendering darkens the world while you are inside)
      flat(6); const x0 = x, n = s.bumps, seg = s.len / n;
      for (let i = 0; i < n; i++) { flat(seg - 4); profile(4, (t) => 0.4 * Math.sin(Math.PI * t)); }
      S.tunnels.push({ x0, x1: x }); flat(6);
    },
    shrooms: (s) => { // big red bouncy mushrooms: each one launches you high
      for (let i = 0; i < s.n; i++) {
        flat(s.gap); const x0 = x, y0 = y; piece('shroom'); profile(6, (t) => 1.5 * Math.pow(Math.sin(Math.PI * t), 0.7)); piece('grass');
        S.pads.push({ type: 'shroom', x0, x1: x, y: y0 });
        if (i < s.n - 1) starArc(x, y0, x + s.gap, y0, 7.5, 4);
      }
      flat(10);
    },
    drop: (s) => { // sudden cliff down, then climb back up
      flat(s.len); push(x, y - s.h); flat(6); profile(s.h * 4.5, (t) => s.h * 0.9 * sm(t)); flat(4);
    },
    crates: (s) => {
      flat(2);
      for (let c = 0; c < s.cols; c++) for (let r = 0; r < s.rows; r++) S.props.push({ type: 'crate', x: x + 1.5 + c * s.size, y: y + s.size / 2 + r * s.size, w: s.size, h: s.size });
      flat(s.cols * s.size + 4);
    },
    barrels: (s) => { flat(2); for (let i = 0; i < s.n; i++) S.props.push({ type: 'barrel', x: x + 1 + (i % 4) * 1.0 + Math.floor(i / 4) * 0.5, y: y + 0.5 + Math.floor(i / 4) * 1.0, r: 0.5 }); flat(6); },
    pins: (s) => { flat(2); for (let i = 0; i < s.n; i++) S.props.push({ type: 'pin', x: x + 1.5 + i * 1.3, y: y + 0.9, w: 0.4, h: 1.8 }); flat(s.n * 1.3 + 4); },
    balls: (s) => { flat(2); for (let i = 0; i < s.n; i++) S.props.push({ type: 'ball', x: x + 1 + (i % 6) * 1.1, y: y + 0.6 + Math.floor(i / 6) * 1.1, r: 0.55, ci: i % 6 }); flat(10); },
    seesaw: (s) => { flat(3); S.props.push({ type: 'seesaw', x: x + s.len / 2, y, len: s.len }); flat(s.len + 3); },
    boost: (s) => { flat(2); S.pads.push({ type: 'boost', x0: x, x1: x + s.len, y }); flat(s.len, 'boost'); flat(2); },
    spring: (s) => { flat(2); S.pads.push({ type: 'spring', x0: x, x1: x + 4, y }); flat(4, 'spring'); flat(6); },
    ice: (s) => { flat(2); flat(s.len, 'ice'); flat(2); },
    mud: (s) => { flat(2); S.pads.push({ type: 'mud', x0: x, x1: x + s.len, y }); flat(s.len, 'mud'); flat(2); },
  };

  flat(20); // start area
  for (const seg of def.segs) {
    const x0 = x; SEG[seg.t](seg); checkpoint();
    if (seg.t !== 'flat') { starLine(x0 + 3, x - 3); if (crng() < 0.7 && seg.t !== 'ferry') balloons(x0 + 4, x - 4, 3 + Math.floor(crng() * 3)); }
    else if (seg.len > 14) starLine(x0 + 2, x - 2, 1.6, 7);
  }
  flat(8); const finishX = x; flat(22); piece('grass');
  S.pieces.push(cur);

  // ground height lookup (null over pits)
  const flatPieces = S.pieces.map((p) => ({ x0: p.pts[0][0], x1: p.pts[p.pts.length - 1][0], pts: p.pts })).filter((p) => p.x1 > p.x0).sort((a, b) => a.x0 - b.x0);
  S.groundY = (px) => {
    for (const p of flatPieces) {
      if (px < p.x0 || px > p.x1) continue;
      let lo = 0, hi = p.pts.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.pts[m][0] <= px) lo = m; else hi = m; }
      const a = p.pts[lo], b = p.pts[hi], t = b[0] === a[0] ? 0 : (px - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
    return null;
  };
  for (const r of lineReqs) for (let px = r.x0; px <= r.x1; px += r.step) { const gy = S.groundY(px); if (gy != null) addStar(px, gy + r.hover); }
  for (const r of balloonReqs) for (let i = 0; i < r.n; i++) {
    const px = r.x0 + ((r.x1 - r.x0) * (i + 0.5)) / r.n, gy = S.groundY(px); if (gy == null) continue;
    S.collectibles.push({ type: 'balloon', x: px, y: gy + (crng() < 0.7 ? 1.7 + crng() * 1.2 : 4.2 + crng() * 2.2), ci: Math.floor(crng() * 6) });
  }
  // keep it readable: at most ~85 stars per stage (balloons are always kept)
  const starIdx = S.collectibles.map((c, i) => (c.type === 'star' ? i : -1)).filter((i) => i >= 0);
  if (starIdx.length > 85) { const drop = new Set(); const stepK = starIdx.length / 85; let acc = 0; starIdx.forEach((i) => { acc += 1; if (acc >= stepK) acc -= stepK; else drop.add(i); }); S.collectibles = S.collectibles.filter((c, i) => !drop.has(i)); }
  S.collectibles.sort((a, b) => a.x - b.x);
  S.start = { x: 7, y: S.groundY(7) };
  S.checkpoints.unshift({ x: 7, y: S.start.y });
  S.finishX = finishX; S.length = x;
  S.minY = Math.min(...S.pieces.flatMap((p) => p.pts.map((q) => q[1])));
  S.deathY = S.minY - 45;
  return S;
}
