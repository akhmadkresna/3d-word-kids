import * as THREE from 'three';
import { loadVehicle, makeBarrel } from '../vehicles.js';

export const duration = 8; // seconds

// Deterministic: everything is a pure function of t (no real-time physics).
export async function setup(scene, camera, opts = {}) {
  const car = await loadVehicle(opts.vehicle || 'vehicle-truck-red'); scene.add(car);
  const TILT = 0.28, T = Math.tan(TILT);
  // ramp: low end at z=-14 (ground), high end at z=-22
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 8.3),
    new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
  ramp.position.set(0, 4 * T * 0.97, -18); ramp.rotation.x = TILT; scene.add(ramp);
  // barrels to jump over
  for (let i = -2; i <= 2; i++) {
    const b = makeBarrel(); b.position.set(i * 1.1, 0, -32); scene.add(b);
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
    camera.position.set(7, 3.5 + y * 0.4, z + 9);
    camera.lookAt(0, 1 + y * 0.6, z - 3);
  };
}
