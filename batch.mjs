// Renders carJump once per vehicle: node batch.mjs [fps=30]
import { spawnSync } from 'node:child_process';
const fps = process.argv[2] || '30';
for (const v of ['vehicle-truck-red', 'vehicle-truck-yellow', 'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-motorcycle']) {
  const r = spawnSync('node', ['capture.mjs', 'carJump', fps, `--vehicle=${v}`], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
