import * as THREE from 'three';
import { buildRoom } from './room.js';
import { loadVrm, Character } from './character.js';
import { CHARACTER_URL } from './config.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2026);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
camera.position.set(5.5, 5.2, 7.5);
camera.lookAt(0, 0.6, -0.8);

scene.add(new THREE.HemisphereLight(0xffffff, 0x50505a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
scene.add(sun);

const room = buildRoom(scene);
const vrm = await loadVrm(CHARACTER_URL);
const character = new Character(vrm);
character.root.position.set(0, 0, 0.5);
scene.add(character.root);
document.getElementById('loading').remove();

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastTime = 0;
renderer.setAnimationLoop((time) => {
  const dt = Math.min((time - lastTime) / 1000, 0.1); // a hidden tab returns a huge gap; don't teleport
  lastTime = time;
  character.update(dt);
  vrm.update(dt);
  renderer.render(scene, camera);
});
