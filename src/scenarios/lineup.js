import * as THREE from 'three';
import { loadVehicle } from '../vehicles.js';
// Debug/gallery: ?scenario=lineup&vehicle=car-kit/sedan,train-kit/train-diesel-a,...
export const duration = 1;
export async function setup(scene, camera, opts = {}) {
  const names = (opts.vehicle || '').split(',').filter(Boolean);
  const cols = Math.ceil(Math.sqrt(names.length));
  for (let i = 0; i < names.length; i++) {
    const m = await loadVehicle(names[i]);
    m.position.set((i % cols) * 6 - (cols - 1) * 3, 0, Math.floor(i / cols) * -7);
    scene.add(m);
  }
  const rows = Math.ceil(names.length / cols);
  return () => {
    camera.position.set(0, 9 + rows * 3, 12 + rows * 2);
    camera.lookAt(0, 0, -(rows - 1) * 3.5);
  };
}
