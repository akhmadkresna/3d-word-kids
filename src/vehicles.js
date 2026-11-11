import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Primitive vehicles so the project runs with zero downloads.
// Swap for free CC0 glTF models (Kenney / Quaternius) via GLTFLoader later.
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));

export function makeCar(color = 0xe53935) {
  const g = new THREE.Group();
  const body = box(1.8, 0.5, 3.6, color); body.position.y = 0.6; g.add(body);
  const cab = box(1.5, 0.5, 1.7, 0xffffff); cab.position.set(0, 1.1, -0.2); g.add(cab);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.2], [0.95, 1.2], [-0.95, -1.2], [0.95, -1.2]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 20), mat(0x222222));
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makePlane(color = 0x1e88e5) {
  const g = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 4, 16), mat(color));
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const wing = box(5, 0.1, 1, 0xffffff); wing.position.z = 0.2; g.add(wing);
  const tail = box(1.6, 0.1, 0.6, 0xffffff); tail.position.z = 1.8; g.add(tail);
  const fin = box(0.1, 0.8, 0.6, 0xffffff); fin.position.set(0, 0.4, 1.8); g.add(fin);
  const prop = box(1.6, 0.08, 0.08, 0x333333); prop.position.z = -2.05; g.add(prop);
  g.userData.prop = prop;
  return g;
}

export function makeBarrel() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), mat(0xff9800));
  m.position.y = 0.5; return m;
}

export function makeHoop(color = 0xffeb3b) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(2, 0.2, 12, 32), mat(color));
  return m;
}

// ---- Real CC0 models (Kenney) ----
export const VEHICLES = ['vehicle-truck-red', 'vehicle-truck-yellow', 'vehicle-truck-green',
  'vehicle-truck-purple', 'vehicle-motorcycle'];
const loader = new GLTFLoader();

// Loads a glb, scales it to `length` units long, rests it on y=0 and faces it toward -Z.
export async function loadVehicle(name, length = 3.6) {
  const gltf = await loader.loadAsync(`/models/${name}.glb`);
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = length / Math.max(size.x, size.z);
  model.scale.setScalar(k);
  box.setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  model.rotation.y = Math.PI; // Kenney models face +Z; we drive toward -Z
  model.position.x *= -1; model.position.z *= -1;
  const g = new THREE.Group(); g.add(model);
  g.userData.wheels = [];
  model.traverse((o) => { if (/wheel/i.test(o.name)) g.userData.wheels.push(o); });
  return g;
}
