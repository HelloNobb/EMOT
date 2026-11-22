// Logic self-check without a browser: node tests/check.mjs
import assert from 'node:assert/strict';
import { parseAnswers, createEmotionJudge } from '../src/emotion.js';
import { Game, levelForXp } from '../src/game.js';
import { Face } from '../src/face.js';
import { JUDGE_INTERVAL_MS, ENERGY_MAX, ENERGY_REGEN_MS, LEVEL_XP, WORRIES_PER_DAY, DECAY_PER_HOUR } from '../src/config.js';

// ---- Jev answer parsing ----
const result = parseAnswers({
  answers: {
    emotion: { type: 'choice', choice: 'surprised', probabilities: { surprised: 0.64, fear: 0.34, sad: 0.01, angry: 0.01 } },
    intensity: { type: 'score', score: 1.94, probabilities: { 0: 0.04, 1: 0.2, 2: 0.55, 3: 0.21, 4: 0 } },
  },
});
assert.equal(result.emotion, 'surprised');
assert.equal(result.probabilities.happy, 0); // missing keys become 0
assert.equal(result.intensity, 1.94 / 4);
const noScore = parseAnswers({
  answers: {
    emotion: { probabilities: { happy: 0.9, neutral: 0.1 } },
    intensity: { probabilities: { 0: 0.04, 1: 0.2, 2: 0.55, 3: 0.21 } },
  },
});
assert.equal(noScore.emotion, 'happy'); // no choice field -> highest probability
assert.ok(Math.abs(noScore.score - 1.93) < 1e-9); // expected level
assert.throws(() => parseAnswers({ answers: {} }));

// ---- levels ----
assert.equal(levelForXp(0), 1);
assert.equal(levelForXp(LEVEL_XP[1] - 0.1), 1);
assert.equal(levelForXp(LEVEL_XP[1]), 2);
assert.equal(levelForXp(1e9), 10);

// ---- game: no localStorage in node -> fresh Emot ----
const start = new Date(2026, 10, 22, 12).getTime();
const game = new Game(start);
assert.ok(['blunt', 'polite', 'anxious'].includes(game.state.personality));

// energy: spend 3, empty, refills one per interval, never above max
for (let index = 0; index < ENERGY_MAX; index++) assert.ok(game.spendEnergy(start));
assert.equal(game.spendEnergy(start), false);
assert.equal(game.energyTimer(start), ENERGY_REGEN_MS);
game.tick(start + ENERGY_REGEN_MS + 1);
assert.equal(game.state.energy, 1);
game.tick(start + ENERGY_REGEN_MS * 10);
assert.equal(game.state.energy, ENERGY_MAX);
assert.equal(game.energyTimer(start + ENERGY_REGEN_MS * 10), null);
game.refundEnergy();
assert.equal(game.state.energy, ENERGY_MAX);

// needs fall with real time, offline included
const later = start + ENERGY_REGEN_MS * 10 + 2 * 60 * 60 * 1000;
const socialBefore = game.state.social;
game.tick(later);
assert.ok(Math.abs(socialBefore - game.state.social - DECAY_PER_HOUR.social * 2) < 1e-6);

// warm message raises bond and XP; hurtful one lowers them, clamped at 0 and reported as clamped
const warm = game.applySend('고마워', 4, 0);
assert.ok(warm.bond > 0 && warm.xp > 0);
const hurt = game.applySend('바보', 0, 0.9);
assert.ok(hurt.bond < 0);
assert.equal(game.state.xp, Math.max(0, warm.xp + hurt.xp));
assert.equal(game.state.history.length, 2);

// worries: three per day, reset on the next local day
for (let index = 0; index < WORRIES_PER_DAY; index++) {
  assert.ok(game.canAskWorry);
  game.startWorry(`고민 ${index}`);
  assert.equal(game.canAskWorry, false); // one at a time
  game.applyAnswer('괜찮아', 3);
}
assert.equal(game.worriesLeft, 0);
game.tick(later + 24 * 60 * 60 * 1000);
assert.equal(game.worriesLeft, WORRIES_PER_DAY);

// line memory is trimmed to the limits
game.applyLine({ text: '흥', memory: Array.from({ length: 12 }, (_, index) => `기억 ${index}`) });
assert.equal(game.state.memory.length, 8);

// ---- face: emotion offsets move the target, and a blink closes the eyes ----
const face = new Face();
face.setRest(1, 'polite');
face.setEmotion({ happy: 1 }, 0.5);
for (let step = 0; step < 120; step++) face.update(1 / 60);
assert.ok(face.params.mouthCurve > 0.8);
face.setEmotion({}, 0);
for (let step = 0; step < 120; step++) face.update(1 / 60);
assert.ok(face.params.mouthCurve < 0.2);

// ---- throttle: first keystroke sends at once, a burst collapses into one send with the newest text ----
const sent = [];
globalThis.fetch = async (url, options) => {
  sent.push(JSON.parse(options.body).text);
  return new Response(JSON.stringify({ answers: { emotion: { probabilities: { happy: 1 } }, intensity: { probabilities: { 0: 1 } } } }));
};
let cleared = 0;
const judge = createEmotionJudge({
  getContext: () => ({}), onResult() {}, onClear: () => cleared++, onStatus() {}, onStats() {},
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
judge.queue('a');
await wait(10);
assert.deepEqual(sent, ['a']);
judge.queue('ab');
judge.queue('abc');
await wait(10);
assert.deepEqual(sent, ['a']);
await wait(JUDGE_INTERVAL_MS);
assert.deepEqual(sent, ['a', 'abc']);
judge.queue('   ');
assert.equal(cleared, 1);

console.log('all checks passed');
