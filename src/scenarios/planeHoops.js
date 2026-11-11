import * as THREE from 'three';
import { makePlane, makeHoop } from '../vehicles.js';

export const duration = 8;

export function setup(scene, camera) {
  const plane = makePlane(); scene.add(plane);
  const hoops = [];
  for (let i = 0; i < 5; i++) {
    const h = makeHoop(i % 2 ? 0xffeb3b : 0xff4081);
    h.position.set(Math.sin(i * 1.3) * 8, 12 + Math.cos(i * 1.7) * 3, -20 - i * 25);
    scene.add(h); hoops.push(h);
  }
  // path passes through every hoop (Catmull-Rom spline)
  const pts = [new THREE.Vector3(0, 10, 20), ...hoops.map((h) => h.position.clone()),
    new THREE.Vector3(0, 12, -170)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tmp = new THREE.Vector3(), look = new THREE.Vector3();
  return (t) => {
    const u = Math.min(t / duration, 0.999);
    curve.getPointAt(u, plane.position);
    curve.getPointAt(Math.min(u + 0.01, 1), look);
    plane.lookAt(look); plane.rotation.z += Math.sin(t * 2) * 0.3;
    plane.userData.prop.rotation.z = t * 40;
    hoops.forEach((h) => h.lookAt(h.position.x, h.position.y, 100));
    tmp.copy(plane.position).add(new THREE.Vector3(6, 3, 12));
    camera.position.lerp(tmp, 1); camera.lookAt(plane.position);
  };
}
