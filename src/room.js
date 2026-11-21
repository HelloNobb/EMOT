import * as THREE from 'three';

// Placeholder furniture from boxes; swap a group for a loaded model later without touching spots.

function box(parent, width, height, depth, color, x, y, z, material) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material ?? new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function furniture(scene, action, x, z, rotationY = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  group.userData.action = action; // clicked mesh walks up to this to find the command
  scene.add(group);
  return group;
}

export function buildRoom(scene) {
  const floor = box(scene, 8, 0.1, 6, 0xb08a64, 0, -0.05, 0);
  floor.castShadow = false;
  box(scene, 8, 2.8, 0.1, 0xe7e2d8, 0, 1.4, -3.05);
  box(scene, 0.1, 2.8, 6, 0xdcd6ca, -4.05, 1.4, 0);
  box(scene, 2.6, 0.01, 1.8, 0x6d7f99, 0.4, 0.005, 0.4).castShadow = false; // rug

  const fridge = furniture(scene, 'eat', -3.45, -2.55);
  box(fridge, 0.8, 1.8, 0.7, 0xf2f4f5, 0, 0.9, 0);
  box(fridge, 0.82, 0.02, 0.72, 0x9aa3ab, 0, 1.2, 0);
  box(fridge, 0.04, 0.4, 0.04, 0x9aa3ab, 0.3, 1.5, 0.37);

  const desk = furniture(scene, 'work', 0.6, -2.6);
  box(desk, 1.4, 0.05, 0.7, 0x7a5a3c, 0, 0.74, 0);
  for (const [legX, legZ] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) {
    box(desk, 0.05, 0.72, 0.05, 0x4a3a2a, legX, 0.36, legZ);
  }
  box(desk, 0.36, 0.02, 0.25, 0x30343a, 0, 0.775, 0.05);
  const screenMaterial = new THREE.MeshStandardMaterial({ color: 0x15181c, emissive: 0x3fd28b, emissiveIntensity: 0 });
  const screen = box(desk, 0.36, 0.24, 0.015, 0, 0, 0.9, -0.08, screenMaterial);
  screen.rotation.x = -0.25;
  box(desk, 0.45, 0.05, 0.45, 0x3d4450, 0, 0.45, 0.75); // chair seat
  box(desk, 0.45, 0.5, 0.05, 0x3d4450, 0, 0.72, 0.98);
  box(desk, 0.05, 0.45, 0.05, 0x22262c, 0, 0.22, 0.75);

  const bed = furniture(scene, 'sleep', 3.1, -1.65);
  box(bed, 1.2, 0.3, 2.1, 0x5b4636, 0, 0.15, 0);
  box(bed, 1.1, 0.2, 2.0, 0xf0ede6, 0, 0.4, 0);
  box(bed, 0.6, 0.1, 0.35, 0xffffff, 0, 0.55, -0.75);
  box(bed, 1.12, 0.06, 1.2, 0x8fa8c8, 0, 0.53, 0.38);

  const sofa = furniture(scene, 'rest', -3.0, 1.0, Math.PI / 2);
  box(sofa, 1.6, 0.42, 0.8, 0x9c5b4b, 0, 0.21, 0);
  box(sofa, 1.6, 0.5, 0.2, 0x8a4e40, 0, 0.67, -0.32);
  box(sofa, 0.15, 0.3, 0.8, 0x8a4e40, -0.8, 0.5, 0);
  box(sofa, 0.15, 0.3, 0.8, 0x8a4e40, 0.8, 0.5, 0);

  // Where the character stands or sits for each action. facing = root rotation.y (0 looks toward +Z).
  const spots = {
    eat: { position: new THREE.Vector3(-3.45, 0, -1.75), facing: Math.PI, seatHeight: 0 },
    work: { position: new THREE.Vector3(0.6, 0, -1.85), facing: Math.PI, seatHeight: 0.47 },
    sleep: { position: new THREE.Vector3(3.1, 0, -0.95), facing: 0, seatHeight: 0.5 },
    rest: { position: new THREE.Vector3(-2.82, 0, 1.0), facing: Math.PI / 2, seatHeight: 0.42 },
  };

  return {
    spots,
    clickables: [fridge, desk, bed, sofa],
    setLaptopOn(on) {
      screenMaterial.emissiveIntensity = on ? 0.9 : 0;
    },
  };
}
