// Generates 100 stages, tests each with a bot player, and writes src/game/stages.json.
// Run: node tools/build-stages.mjs   (about a minute or two)
import fs from 'node:fs';
import { generateStage } from '../src/game/stages.js';
import { runBot } from '../src/game/bot.js';

const allSpecs = JSON.parse(fs.readFileSync('src/game/vehicleSpecs.json', 'utf8')), specs = allSpecs.filter((v) => !v.carriage); // wagons are not playable vehicles
const COUNT = Number(process.argv[2] || 100);

// vehicle order: friendly sedan first, then a seeded shuffle that cycles through all vehicles before repeating
let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const order = [];
while (order.length < COUNT) {
  const pool = specs.filter((v) => !(order.length === 0 && v.id !== 'car-kit/sedan') && (order.length > 0 || true)).map((v) => v.id);
  const shuffled = pool.sort(() => rnd() - 0.5);
  if (order.length === 0) order.push('car-kit/sedan', ...shuffled.filter((x) => x !== 'car-kit/sedan')); else order.push(...shuffled);
}

const stages = []; let relaxed = 0, failed = 0;
for (let k = 1; k <= COUNT; k++) {
  const spec = specs.find((v) => v.id === order[k - 1]);
  let chosen = null;
  for (let attempt = 0; attempt < 9 && !chosen; attempt++) {
    const def = generateStage(k, spec, attempt);
    for (const policy of ['air', 'smart']) {
      const res = runBot(def, spec, policy, 160, 2);
      if (res.ok && (policy === 'air' ? res.resets <= 2 : res.resets <= 1)) { chosen = { def, res, policy }; break; }
    }
  }
  if (!chosen) { failed++; const def = generateStage(k, spec, 8); chosen = { def, res: runBot(def, spec, 'smart', 160, 3), policy: 'none' }; console.log(`!! stage ${k} (${spec.id}) not solved by bots`); }
  if (chosen.def.attempt > 0) relaxed++;
  const t = chosen.res.ok ? chosen.res.time : 90;
  stages.push({ ...chosen.def, length: Math.round(chosen.res.stage.finishX), par: +(t * 1.3).toFixed(1), botTime: +t.toFixed(1), solvedBy: chosen.policy, botResets: chosen.res.resets ?? 0 });
  if (k % 10 === 0) console.log(`stage ${k}/${COUNT} done (relaxed so far ${relaxed}, unsolved ${failed})`);
}
fs.writeFileSync('src/game/stages.json', JSON.stringify(stages));
const lens = stages.map((x) => x.length), solved = stages.filter((x) => x.solvedBy !== 'none').length;
console.log(`wrote ${stages.length} stages. solved by bot: ${solved}. relaxed difficulty: ${relaxed}. length ${Math.min(...lens)}-${Math.max(...lens)} m. policies: air ${stages.filter((x) => x.solvedBy === 'air').length}, smart ${stages.filter((x) => x.solvedBy === 'smart').length}`);
