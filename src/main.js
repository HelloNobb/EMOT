import * as THREE from 'three';
import { buildRoom } from './room.js';
import { loadVrm, Character } from './character.js';
import { Sim } from './sim.js';
import { showStats } from './ui.js';
import { CHARACTER_URL, SAVE_INTERVAL_SECONDS } from './config.js';

const UI_INTERVAL_SECONDS = 0.1; // DOM writes don't need 60 Hz

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
const sim = new Sim(character, room.spots);
document.getElementById('loading').remove();

const BASE_FOV = 40;
const BASE_ASPECT = 1.5;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  // Narrow screens widen the vertical FOV so the whole room still fits horizontally.
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * Math.max(1, BASE_ASPECT / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight));
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Furniture click -> command. The hit mesh walks up to the group that carries userData.action.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function furnitureActionAt(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(room.clickables, true)[0];
  let object = hit?.object;
  while (object && !object.userData.action) object = object.parent;
  return object?.userData.action ?? null;
}

canvas.addEventListener('click', (event) => {
  const action = furnitureActionAt(event);
  if (action) sim.command(action);
});
canvas.addEventListener('pointermove', (event) => {
  canvas.style.cursor = furnitureActionAt(event) ? 'pointer' : 'default';
});

window.addEventListener('pagehide', () => sim.save());

let lastTime = 0;
let uiTimer = 0;
let saveTimer = 0;
renderer.setAnimationLoop((time) => {
  const dt = Math.min((time - lastTime) / 1000, 0.1); // a hidden tab returns a huge gap; don't teleport
  lastTime = time;

  sim.update(dt);
  character.update(dt);
  vrm.update(dt);
  room.setLaptopOn(sim.isWorking);
  renderer.render(scene, camera);

  uiTimer += dt;
  if (uiTimer >= UI_INTERVAL_SECONDS) {
    uiTimer = 0;
    showStats(sim);
  }
  saveTimer += dt;
  if (saveTimer >= SAVE_INTERVAL_SECONDS) {
    saveTimer = 0;
    sim.save();
  }
});
