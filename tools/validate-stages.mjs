// Re-checks that every stage in src/game/stages.json can still be finished by the bot policy that solved it
// (mostly 'hold GAS'; ferry stages need the bot to wait for the platform), with <= 3 resets.
// Run after changing physics: npm run validate     Exit code 1 if any stage is no longer solvable.
import fs from 'node:fs';
import { runBot } from '../src/game/bot.js';

const stages = JSON.parse(fs.readFileSync('src/game/stages.json', 'utf8'));
const specs = Object.fromEntries(JSON.parse(fs.readFileSync('src/game/vehicleSpecs.json', 'utf8')).map((s) => [s.id, s]));
let bad = 0;
for (const st of stages) {
  const r = runBot(st, specs[st.vehicle], st.solvedBy === 'smart' ? 'smart' : 'hold', 170, 3);
  if (!r.ok) { bad++; console.log(`FAIL stage ${st.k} (${st.vehicle}) stuck at x=${Math.round(r.x)}/${Math.round(r.finishX)}`); }
}
console.log(bad ? `${bad} of ${stages.length} stages failed` : `all ${stages.length} stages finishable`);
process.exit(bad ? 1 : 0);
