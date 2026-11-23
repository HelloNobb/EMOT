import {
  FACE_REST_LOW, FACE_REST_HIGH, PERSONALITY_FACE, EMOTION_FACE, INTENSITY_GAIN, EXPRESSION_SMOOTHING,
  BLINK_MIN_SECONDS, BLINK_MAX_SECONDS, BLINK_SECONDS,
} from './config.js';

const PARAMS = Object.keys(FACE_REST_LOW);
const nextBlinkDelay = () => BLINK_MIN_SECONDS + Math.random() * (BLINK_MAX_SECONDS - BLINK_MIN_SECONDS);

// The face as numbers: target = resting face (level + personality) + Σ emotion offset × probability × strength.
// Current values ease toward the target every frame; blink and glances are layered on at output.
export class Face {
  constructor() {
    this.rest = { ...FACE_REST_LOW };
    this.offset = Object.fromEntries(PARAMS.map((name) => [name, 0]));
    this.current = { ...this.rest };
    this.params = { ...this.rest };
    this.blinkTimer = nextBlinkDelay();
    this.glance = 0;
    this.glanceTimer = 2;
  }

  // Growth shows on the resting face: a wary stranger at level 1, relaxed and looking at you at 10.
  // calm: an event settled her nerves, so the personality's anxious look no longer applies.
  setRest(level, personality, calm = false) {
    const t = (level - 1) / 9;
    const extra = calm ? {} : PERSONALITY_FACE[personality];
    for (const name of PARAMS) {
      this.rest[name] = FACE_REST_LOW[name] + (FACE_REST_HIGH[name] - FACE_REST_LOW[name]) * t + (extra[name] ?? 0);
    }
  }

  // probabilities: { happy: 0.7, ... }. intensity: 0..1 (Jev score / 4). Empty object = neutral.
  setEmotion(probabilities, intensity) {
    const strength = Math.min(1, intensity * INTENSITY_GAIN);
    for (const name of PARAMS) this.offset[name] = 0;
    for (const [emotion, probability] of Object.entries(probabilities)) {
      for (const [name, value] of Object.entries(EMOTION_FACE[emotion])) {
        this.offset[name] += value * probability * strength;
      }
    }
  }

  update(dt) {
    const blend = 1 - Math.exp(-EXPRESSION_SMOOTHING * dt); // frame-rate independent easing
    for (const name of PARAMS) {
      const target = this.rest[name] + this.offset[name];
      this.current[name] += (target - this.current[name]) * blend;
      this.params[name] = this.current[name];
    }
    this.updateGlance(dt);
    this.params.eyeOpen = Math.max(0, this.current.eyeOpen * (1 - this.blink(dt)));
    this.params.gazeX = Math.max(-1, Math.min(1, this.current.gazeX + this.glance));
  }

  blink(dt) {
    this.blinkTimer -= dt;
    if (this.blinkTimer > 0) return 0;
    const progress = -this.blinkTimer / BLINK_SECONDS;
    if (progress >= 1) {
      this.blinkTimer = nextBlinkDelay();
      return 0;
    }
    return 1 - Math.abs(progress * 2 - 1); // close then open
  }

  // Small random eye darts so the face never looks frozen.
  updateGlance(dt) {
    this.glanceTimer -= dt;
    if (this.glanceTimer > 0) return;
    this.glanceTimer = 1.5 + Math.random() * 3;
    this.glance = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 0.5;
  }
}
