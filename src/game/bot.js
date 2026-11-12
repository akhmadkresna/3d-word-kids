// Headless players used to check every stage can be finished with the single gas button.
import { Sim, DT, ferryDockRemaining, ferryU } from './sim.js';
import { buildStage } from './terrain.js';

// policies: decide gas (true/false) each step
export const POLICIES = {
  hold: () => true,
  // the "good player": gas on the ground, let go of it in the air (so the car does not spin and lands level)
  air: (sim) => !(sim.airT > 0.3),
  // lift off the gas when the nose is too high (wheelie) or while airborne
  smart: (sim) => {
    if (sim.airT > 0.3 || sim.angle > 0.7 || (sim.grounded() === 0 && sim.angle < -0.5)) return false;
    // ferry: approach slowly, board while it is docked, release the gas to ride across, drive off at the far dock
    for (const p of sim.props) {
      if (p.def.type !== 'ferry') continue;
      const d = p.def, dist = d.x0 - sim.x;
      if (sim.x > d.x1 + 0.3) continue;
      if (dist > 40) return true;
      if (sim.x >= d.x0 - 0.3) return ferryU(sim.time) > 0.97;           // on the ferry: ride until it docks on the far side
      const docked = ferryDockRemaining(sim.time);
      if (docked > 1.4) return sim.speed < 5;                             // docked: roll on slowly
      return dist > 12 ? sim.speed < 5 : false;                           // away: wait (brake) before the edge
    }
    return true;
  },
  // tap pattern: 1.2 s on, 0.25 s off (helps on ice / steep climbs)
  pulse: (sim) => (sim.time % 1.45) < 1.2,
};

export function runBot(def, spec, policy = 'air', maxTime = 150, maxResets = 3) {
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
