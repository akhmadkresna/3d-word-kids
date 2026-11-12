// Headless players used to check every stage can be finished with the single gas button.
import { Sim, DT } from './sim.js';
import { buildStage } from './terrain.js';

// policies: decide gas (true/false) each step
export const POLICIES = {
  hold: () => true,
  // lift off the gas when the nose is too high (wheelie) or while airborne
  smart: (sim) => !(sim.angle > 0.7 || (sim.grounded() === 0 && sim.angle < -0.5)),
  // tap pattern: 1.2 s on, 0.25 s off (helps on ice / steep climbs)
  pulse: (sim) => (sim.time % 1.45) < 1.2,
};

export function runBot(def, spec, policy = 'hold', maxTime = 150, maxResets = 3) {
  const stage = buildStage(def), sim = new Sim(stage, spec), pol = POLICIES[policy];
  const steps = Math.ceil(maxTime / DT);
  for (let i = 0; i < steps; i++) {
    sim.step(pol(sim));
    sim.events.length = 0;
    if (sim.finished) return { ok: true, time: sim.finishTime, resets: sim.resets, policy, stage };
    if (sim.resets > maxResets) break;
  }
  return { ok: false, time: sim.time, resets: sim.resets, x: sim.x, policy, stage, finishX: stage.finishX };
}
