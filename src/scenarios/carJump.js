import * as THREE from 'three';
import { loadVehicle, loadModel } from '../vehicles.js';

export const duration = 8; // seconds

// Deterministic: everything is a pure function of t (no real-time physics).
export async function setup(scene, camera, opts = {}) {
  const car = await loadVehicle(opts.vehicle || 'car-kit/sedan'); scene.add(car);
  const TILT = 0.28, T = Math.tan(TILT);
  // ramp: low end at z=-14 (ground), high end at z=-22
  const ramp = await loadModel('racing-kit/roadRampLong', { scale: 4.15, center: true });
  ramp.position.set(0, 0, -18); scene.add(ramp);
  // crates to jump over (wall 5 wide x 2 high) + cones leading up to it
  for (let i = -2; i <= 2; i++) for (let h = 0; h < 2; h++) {
    const c = await loadModel('car-kit/box', { scale: 1.7, center: true });
    c.position.set(i * 1.2, h * 1.2, -32); scene.add(c);
  }
  for (const x of [-3, 3]) for (const z of [-26, -28.5]) {
    const c = await loadModel('car-kit/cone', { scale: 1.6, center: true }); c.position.set(x, 0, z); scene.add(c);
  }
  const startZ = 12, rampLow = -14, rampHigh = -22, landZ = -50;
  const lift = (rampLow - rampHigh) * T; // height at ramp top
  const ease = (k) => k * k * (3 - 2 * k);
  return (t) => {
    const u = t / duration;
    let z, y = 0, pitch = 0;
    if (u < 0.4) { // accelerate on the ground
      z = THREE.MathUtils.lerp(startZ, rampLow, ease(u / 0.4) * 0.3 + (u / 0.4) * 0.7);
    } else if (u < 0.5) { // up the ramp
      const k = (u - 0.4) / 0.1; z = THREE.MathUtils.lerp(rampLow, rampHigh, k);
      y = (rampLow - z) * T; pitch = TILT;
    } else if (u < 0.8) { // airborne: parabola from ramp top back to the ground
      const k = (u - 0.5) / 0.3; z = THREE.MathUtils.lerp(rampHigh, landZ, k);
      y = lift * (1 - k) + 24 * k * (1 - k); pitch = TILT - 2 * TILT * k;
    } else { // land and brake
      const k = (u - 0.8) / 0.2; z = landZ - 7 * (1 - (1 - k) ** 2);
    }
    car.position.set(0, y, z); car.rotation.set(pitch, 0, 0);
    car.userData.wheels.forEach((w) => (w.rotation.x = z * 0.8));
    camera.position.set(5.5, 4.5 + y * 0.4, z + 10);
    camera.lookAt(0, 1 + y * 0.6, z - 3);
  };
}
