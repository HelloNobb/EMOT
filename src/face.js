import {
  EXPRESSION_MAP, INTENSITY_GAIN, EXPRESSION_SMOOTHING, BLINK_MIN_SECONDS, BLINK_MAX_SECONDS, BLINK_SECONDS,
} from './config.js';

const EXPRESSIONS = [...new Set(Object.values(EXPRESSION_MAP).flatMap(Object.keys))];

const nextBlinkDelay = () => BLINK_MIN_SECONDS + Math.random() * (BLINK_MAX_SECONDS - BLINK_MIN_SECONDS);

// Emotion probabilities -> target expression weights; every frame current weights ease toward the target.
export class Face {
  constructor(expressionManager) {
    this.expressions = expressionManager;
    this.target = Object.fromEntries(EXPRESSIONS.map((name) => [name, 0]));
    this.current = { ...this.target };
    this.blinkTimer = nextBlinkDelay();
    this.time = 0;
  }

  // probabilities: { happy: 0.7, ... } summing to ~1. intensity: 0..1 (Jev score / 4).
  setEmotion(probabilities, intensity) {
    const strength = Math.min(1, intensity * INTENSITY_GAIN);
    for (const name of EXPRESSIONS) this.target[name] = 0;
    for (const [emotion, probability] of Object.entries(probabilities)) {
      for (const [name, weight] of Object.entries(EXPRESSION_MAP[emotion])) {
        this.target[name] += probability * weight * strength;
      }
    }
    for (const name of EXPRESSIONS) this.target[name] = Math.min(1, this.target[name]);
  }

  update(dt, pose) {
    this.time += dt;
    // Frame-rate independent easing: same feel at 30 or 144 fps.
    const blend = 1 - Math.exp(-EXPRESSION_SMOOTHING * dt);
    for (const name of EXPRESSIONS) {
      this.current[name] += (this.target[name] - this.current[name]) * blend;
      this.expressions.setValue(name, this.current[name]);
    }
    if (pose === 'eat') {
      const chew = Math.max(0, Math.sin(this.time * 9)) * 0.5;
      this.expressions.setValue('aa', Math.max(this.current.aa, chew));
    }
    this.expressions.setValue('blink', pose === 'sleep' ? 1 : this.blink(dt));
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
}
