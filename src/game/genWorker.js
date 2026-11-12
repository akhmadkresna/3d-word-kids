// Web worker: generates + bot-verifies one stage so recording mode never makes the game wait.
import { generateStage } from './stages.js';
import { runBot } from './bot.js';
import SPECS from './vehicleSpecs.json';

self.onmessage = (e) => {
  const { id, k, vehicle, salt, theme, avoid, maxLen } = e.data;
  try {
    const spec = SPECS.find((s) => s.id === vehicle);
    let chosen = null;
    for (let attempt = 0; attempt < 9 && !chosen; attempt++) {
      const def = generateStage(k, spec, attempt, { salt, theme, avoid, maxLen });
      for (const policy of ['air', 'smart']) {
        const res = runBot(def, spec, policy, 160, 2);
        if (res.ok && res.resets <= (policy === 'air' ? 2 : 1)) { chosen = { def, res, policy }; break; }
      }
    }
    if (!chosen) { // extremely unlikely: fall back to the easiest version
      const def = generateStage(k, spec, 8, { salt, theme, avoid, maxLen: 200 });
      chosen = { def, res: runBot(def, spec, 'smart', 160, 3), policy: 'smart' };
    }
    const t = chosen.res.ok ? chosen.res.time : 60;
    self.postMessage({ id, def: { ...chosen.def, length: Math.round(chosen.res.stage.finishX), par: +(t * 1.3).toFixed(1), botTime: +t.toFixed(1), solvedBy: chosen.policy } });
  } catch (err) { self.postMessage({ id, error: String(err && err.stack || err) }); }
};
