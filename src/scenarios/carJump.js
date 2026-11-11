import * as THREE from 'three';
import { makeCar, makeBarrel } from '../vehicles.js';

export const duration = 8; // seconds

// Deterministic: everything is a pure function of t (no real-time physics).
export function setup(scene, camera) {
  const car = makeCar(); scene.add(car);
  // ramp
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
  ramp.position.set(0, 0.9, -16); ramp.rotation.x = -0.28; scene.add(ramp);
  // barrels to jump over
  for (let i = -2; i <= 2; i++) {
    const b = makeBarrel(); b.position.set(i * 1.1, 0, -30); scene.add(b);
  }
  const startZ = 12, rampZ = -14, landZ = -46;
  return (t) => {
    const u = t / duration;
    let z, y = 0, pitch = 0;
    if (u < 0.45) { // accelerate
      const k = u / 0.45; z = THREE.MathUtils.lerp(startZ, rampZ, k * k * (3 - 2 * k) * 0.2 + k * 0.8);
      pitch = k > 0.9 ? 0.28 : 0;
    } else if (u < 0.75) { // airborne
      const k = (u - 0.45) / 0.3; z = THREE.MathUtils.lerp(rampZ, landZ, k);
      y = 1 + 7 * 4 * k * (1 - k); pitch = 0.28 - 0.56 * k;
    } else { // land and brake
      const k = (u - 0.75) / 0.25; z = landZ - 8 * (1 - (1 - k) ** 2);
    }
    car.position.set(0, y, z); car.rotation.set(pitch, 0, 0);
    car.userData.wheels.forEach((w) => (w.rotation.x = -z * 0.8));
    camera.position.set(9, 5 + y * 0.3, z + 10);
    camera.lookAt(0, 1 + y * 0.5, z - 4);
  };
}
