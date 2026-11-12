// "Fun metrics": how much airtime / how many big jumps / how fast a hold-GAS player experiences per stage.
// Run: node tools/fun-metrics.mjs [every-nth-stage=4]
import fs from 'node:fs';
import { Sim } from '../src/game/sim.js';
import { buildStage } from '../src/game/terrain.js';
import { POLICIES } from '../src/game/bot.js';

const stages = JSON.parse(fs.readFileSync('src/game/stages.json', 'utf8'));
const specs = Object.fromEntries(JSON.parse(fs.readFileSync('src/game/vehicleSpecs.json', 'utf8')).map((s) => [s.id, s]));
const every = Number(process.argv[2] || 4);
const rows = [];
for (const st of stages.filter((x) => (x.k - 1) % every === 0)) {
  const sim = new Sim(buildStage(st), specs[st.vehicle]), pol = POLICIES[st.solvedBy === 'smart' ? 'smart' : 'hold'];
  let air = 0, run = 0, big = 0, vsum = 0, n = 0, calm = 0, calmRun = 0, bestCalm = 0, maxAir = 0;
  for (let i = 0; i < 60 * 160 && !sim.finished; i++) {
    sim.step(pol(sim)); sim.events.length = 0;
    const g = sim.loop ? 1 : sim.grounded(); n++; vsum += Math.abs(sim.speed);
    if (g === 0) { air++; run++; } else { if (run * (1 / 60) > 0.8) big++; maxAir = Math.max(maxAir, run / 60); run = 0; }
    // "calm" = grounded, fairly level driving with nothing happening (boring stretch)
    const calmNow = g > 0 && Math.abs(sim.angle) < 0.12 && sim.rumble < 0.1;
    if (calmNow) { calmRun++; bestCalm = Math.max(bestCalm, calmRun / 60); } else calmRun = 0;
  }
  const T = n / 60;
  rows.push({ k: st.k, time: T, airPct: (100 * air) / n, bigPerMin: (big / T) * 60, avgSpeed: vsum / n, longestCalm: bestCalm, maxAir, len: st.length });
}
const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
console.log('stage  time  len  air%  bigJumps/min  avgSpeed  longestCalmStretch  maxAir');
for (const r of rows) console.log(String(r.k).padStart(4), r.time.toFixed(0).padStart(5) + 's', String(r.len).padStart(4), r.airPct.toFixed(0).padStart(4) + '%', r.bigPerMin.toFixed(1).padStart(10), r.avgSpeed.toFixed(1).padStart(9), r.longestCalm.toFixed(1).padStart(12) + 's', r.maxAir.toFixed(1).padStart(8) + 's');
console.log(`AVERAGE  time ${avg((r) => r.time).toFixed(0)}s | airtime ${avg((r) => r.airPct).toFixed(0)}% | big jumps/min ${avg((r) => r.bigPerMin).toFixed(1)} | avg speed ${avg((r) => r.avgSpeed).toFixed(1)} m/s | longest calm stretch ${avg((r) => r.longestCalm).toFixed(1)}s`);
