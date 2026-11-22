// Logic self-check without a browser: node tests/check.mjs
import assert from 'node:assert/strict';
import { parseAnswers, createEmotionJudge } from '../src/emotion.js';
import { JUDGE_INTERVAL_MS } from '../src/config.js';
import { Sim, levelForMoney, moneyForLevel } from '../src/sim.js';

// Jev answer with an interpolated score
const result = parseAnswers({
  answers: {
    emotion: { type: 'choice', choice: 'surprised', probabilities: { surprised: 0.64, fear: 0.34, sad: 0.01, angry: 0.01 } },
    intensity: { type: 'score', score: 1.94, probabilities: { 0: 0.04, 1: 0.2, 2: 0.55, 3: 0.21, 4: 0 } },
  },
});
assert.equal(result.emotion, 'surprised');
assert.equal(result.probabilities.happy, 0); // missing keys become 0
assert.equal(result.intensity, 1.94 / 4);

// Without a score, fall back to the expected level: 0*.04 + 1*.2 + 2*.55 + 3*.21 = 1.93
const noScore = parseAnswers({
  answers: {
    emotion: { probabilities: { happy: 0.9, neutral: 0.1 } },
    intensity: { probabilities: { 0: 0.04, 1: 0.2, 2: 0.55, 3: 0.21 } },
  },
});
assert.equal(noScore.emotion, 'happy'); // no choice field -> highest probability
assert.ok(Math.abs(noScore.score - 1.93) < 1e-9);
assert.throws(() => parseAnswers({ answers: {} }));

// Level curve
assert.equal(levelForMoney(0), 1);
assert.equal(levelForMoney(49.9), 1);
assert.equal(levelForMoney(50), 2);
assert.equal(moneyForLevel(2), 50);
assert.equal(levelForMoney(moneyForLevel(5)), 5);

// Autonomous choice and action flow with a stand-in body (no localStorage in node -> fresh save)
const body = { arrived: true, moveTo() {}, use() {}, idle() {} };
const sim = new Sim(body, { eat: {}, sleep: {}, work: {}, rest: {} });
const pick = (hunger, fatigue) => Object.assign(sim.state, { hunger, fatigue }) && sim.choose();
assert.equal(pick(60, 90), 'eat'); // hunger wins over fatigue
assert.equal(pick(10, 70), 'sleep');
assert.equal(pick(10, 40), 'rest');
assert.equal(pick(10, 10), 'work');

Object.assign(sim.state, { hunger: 30, fatigue: 10 });
sim.command('eat');
sim.update(0.1); // moving -> using
assert.equal(sim.phase, 'using');
for (let step = 0; step < 40 && sim.phase === 'using'; step++) sim.update(0.1);
assert.equal(sim.phase, 'idle'); // ended because hunger reached 0
assert.equal(sim.state.hunger, 0);

Object.assign(sim.state, { hunger: 10, fatigue: 10, money: 0 });
sim.command('work');
sim.update(0.1);
sim.update(1);
assert.ok(sim.state.money > 0.9 && sim.state.money < 1.1);


// Throttle: first keystroke sends at once, a burst collapses into one more send with the newest text
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
assert.deepEqual(sent, ['a']); // first keystroke goes out at once
judge.queue('ab');
judge.queue('abc');
await wait(10);
assert.deepEqual(sent, ['a']); // inside the interval: held
await wait(JUDGE_INTERVAL_MS);
assert.deepEqual(sent, ['a', 'abc']); // one send, newest text
judge.queue('   ');
assert.equal(cleared, 1);

console.log('throttle checks passed');
