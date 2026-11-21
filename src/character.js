import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { WALK_SPEED, TURN_SPEED } from './config.js';

const HALF_PI = Math.PI / 2;
const ARM_DOWN = 1.25;
const SIT_CUSHION = 0.08; // hips rest a little above the seat surface
const BODY_HALF_THICKNESS = 0.12; // lying down, the back sits this far below the root

const BONE_NAMES = [
  'hips', 'spine', 'head',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg',
];

export async function loadVrm(url) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm); // VRM0 models face -Z; make every model face +Z
  vrm.scene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.frustumCulled = false; // skinned bounds don't follow poses, so culling would pop the mesh
  });
  return vrm;
}

// Normalized VRM bones share one axis convention, so these angles work for any VRM model.
function armsDown(bone) {
  bone.leftUpperArm.rotation.z = -ARM_DOWN;
  bone.rightUpperArm.rotation.z = ARM_DOWN;
}

function seatedLegs(bone) {
  bone.leftUpperLeg.rotation.x = -HALF_PI;
  bone.rightUpperLeg.rotation.x = -HALF_PI;
  bone.leftLowerLeg.rotation.x = HALF_PI;
  bone.rightLowerLeg.rotation.x = HALF_PI;
}

function breathe(bone, time, speed) {
  bone.spine.rotation.x = Math.sin(time * speed) * 0.02;
}

const POSES = {
  idle(bone, time) {
    armsDown(bone);
    breathe(bone, time, 1.6);
    bone.head.rotation.y = Math.sin(time * 0.5) * 0.1;
  },
  walk(bone, time) {
    const swing = Math.sin(time * 8);
    armsDown(bone);
    bone.leftUpperLeg.rotation.x = swing * 0.5;
    bone.rightUpperLeg.rotation.x = -swing * 0.5;
    bone.leftLowerLeg.rotation.x = Math.max(0, swing) * 0.7;
    bone.rightLowerLeg.rotation.x = Math.max(0, -swing) * 0.7;
    bone.leftUpperArm.rotation.x = -swing * 0.4;
    bone.rightUpperArm.rotation.x = swing * 0.4;
  },
  sit(bone, time) {
    armsDown(bone);
    seatedLegs(bone);
    breathe(bone, time, 1.2);
    bone.leftUpperArm.rotation.x = -0.5;
    bone.rightUpperArm.rotation.x = -0.5;
  },
  work(bone, time) {
    seatedLegs(bone);
    bone.leftUpperArm.rotation.set(0, -1.1, -0.6);
    bone.rightUpperArm.rotation.set(0, 1.1, 0.6);
    bone.leftLowerArm.rotation.y = -0.6;
    bone.rightLowerArm.rotation.y = 0.6;
    bone.leftHand.rotation.z = Math.sin(time * 18) * 0.15; // typing
    bone.rightHand.rotation.z = Math.sin(time * 18 + 1.3) * 0.15;
    bone.head.rotation.x = 0.25;
  },
  eat(bone, time) {
    armsDown(bone);
    breathe(bone, time, 1.6);
    bone.rightUpperArm.rotation.x = -1.0 - Math.max(0, Math.sin(time * 3)) * 0.3;
    bone.rightLowerArm.rotation.y = 1.6;
  },
  sleep(bone, time) {
    armsDown(bone);
    breathe(bone, time, 0.8);
  },
};

const SEATED_POSES = new Set(['sit', 'work']);

export class Character {
  constructor(vrm) {
    this.vrm = vrm;
    this.root = new THREE.Group();
    this.root.add(vrm.scene);
    this.pose = 'idle';
    this.seatHeight = 0;
    this.target = null;
    this.time = 0;
    this.bone = {};
    for (const name of BONE_NAMES) this.bone[name] = vrm.humanoid.getNormalizedBoneNode(name);
    vrm.scene.updateMatrixWorld(true);
    this.hipsHeight = this.bone.hips.getWorldPosition(new THREE.Vector3()).y;
    this.toTarget = new THREE.Vector3();
  }

  get arrived() {
    return this.target === null;
  }

  get isSleeping() {
    return this.pose === 'sleep';
  }

  moveTo(spot) {
    this.target = spot;
    this.pose = 'walk';
  }

  use(spot, pose) {
    this.root.position.copy(spot.position);
    this.root.rotation.y = spot.facing;
    this.seatHeight = spot.seatHeight;
    this.pose = pose;
  }

  idle() {
    this.target = null;
    this.pose = 'idle';
  }

  update(dt) {
    this.time += dt;
    if (this.target) this.walk(dt);

    this.vrm.humanoid.resetNormalizedPose(); // poses set only the bones they need
    POSES[this.pose](this.bone, this.time);

    const body = this.vrm.scene;
    body.rotation.x = this.isSleeping ? -HALF_PI : 0;
    if (this.isSleeping) body.position.y = this.seatHeight + BODY_HALF_THICKNESS;
    else if (SEATED_POSES.has(this.pose)) body.position.y = this.seatHeight + SIT_CUSHION - this.hipsHeight;
    else body.position.y = 0;
  }

  walk(dt) {
    this.toTarget.subVectors(this.target.position, this.root.position).setY(0);
    const distance = this.toTarget.length();
    const step = WALK_SPEED * dt;
    if (distance <= step) {
      this.root.position.copy(this.target.position);
      this.root.rotation.y = this.target.facing;
      this.target = null;
      return;
    }
    // ponytail: straight line through furniture; add waypoints or a navmesh if the room gets crowded
    this.root.position.addScaledVector(this.toTarget, step / distance);
    const heading = Math.atan2(this.toTarget.x, this.toTarget.z);
    const turn = Math.atan2(Math.sin(heading - this.root.rotation.y), Math.cos(heading - this.root.rotation.y));
    const maxTurn = TURN_SPEED * dt;
    this.root.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, turn));
  }
}
