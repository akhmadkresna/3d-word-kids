import * as THREE from 'three';
import { buildWorld } from './world.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const name = params.get('scenario') || 'carJump';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
await buildWorld(scene, renderer, params.get('theme') || 'day');

const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 1200);

const mod = await import(`./scenarios/${name}.js`);
const update = await mod.setup(scene, camera, { vehicle: params.get('vehicle'), outcome: params.get('outcome') });
scene.traverse((o) => { if (o.isMesh && !o.userData.noShadow && !o.material.isShaderMaterial && !o.material.map?.isCanvasTexture) { o.castShadow = true; o.receiveShadow = true; } });

// The capture script drives time; open the page without ?live to preview in real time.
window.__duration = mod.duration;
window.renderFrame = (t) => { update(t); renderer.render(scene, camera); };
window.__ready = true;
if (params.has('live')) {
  const t0 = performance.now();
  renderer.setAnimationLoop(() => window.renderFrame(((performance.now() - t0) / 1000) % mod.duration));
} else window.renderFrame(0);
