import * as THREE from 'three';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const name = params.get('scenario') || 'carJump';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 220);
scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(20, 40, 10); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x7cb342 }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 500);

const mod = await import(`./scenarios/${name}.js`);
const update = await mod.setup(scene, camera, { vehicle: params.get('vehicle') });

// The capture script drives time; open the page without ?live to preview in real time.
window.__duration = mod.duration;
window.renderFrame = (t) => { update(t); renderer.render(scene, camera); };
window.__ready = true;
if (params.has('live')) {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => window.renderFrame(((performance.now() - t0) / 1000) % mod.duration));
} else window.renderFrame(0);
