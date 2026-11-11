// Renders a scenario once per vehicle: node batch.mjs [fps=30] [scenario=carJump]   (VEHICLES lives in src/vehicles.js)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const fps = process.argv[2] || '30', scenario = process.argv[3] || 'carJump';
const list = [...fs.readFileSync('src/vehicles.js', 'utf8').match(/VEHICLES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const v of list) {
  const r = spawnSync('node', ['capture.mjs', scenario, fps, `--vehicle=${v}`], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
