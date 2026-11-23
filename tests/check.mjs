// Logic self-check without a browser: node tests/check.mjs
import assert from 'node:assert/strict';
import { parseAnswers, createEmotionJudge } from '../src/emotion.js';
import { Game, levelForXp } from '../src/game.js';
import { Face } from '../src/face.js';
import { JUDGE_INTERVAL_MS, ENERGY_MAX, ENERGY_REGEN_MS, LEVEL_XP, DECAY_PER_HOUR } from '../src/config.js';

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
game.remember('player', '고마워');
const warm = game.applySend(4, 0);
assert.ok(warm.bond > 0 && warm.xp > 0);
game.remember('player', '바보');
const hurt = game.applySend(0, 0.9);
assert.ok(hurt.bond < 0);
assert.equal(game.state.xp, Math.max(0, warm.xp + hurt.xp));
assert.equal(game.state.history.length, 2);

// a reply is remembered without a reward; a touch line earns one
assert.equal(game.isNew, true); // no save in node: a new Emot, so the page asks for a name
const xpBeforeReply = game.state.xp;
const found = (overrides) => ({
  player: { name: '', likes: [], dislikes: [], people: [], plans: [] },
  self: { likes: [], dislikes: [], treasures: [] },
  episode: null,
  ...overrides,
});
game.rememberLine({ text: '그래서?', memory: found({ player: { name: '민수', likes: ['떡볶이', '라면'], dislikes: [], people: [], plans: [] } }) }, later);
assert.equal(game.state.xp, xpBeforeReply);
assert.equal(game.state.memory.player.name, '민수');
assert.ok(game.applyLine({ text: '창밖 봤어?', memory: found({}) }).social > 0);
assert.equal(game.state.history.at(-1).text, '창밖 봤어?');

// key-value memory: duplicates collapse (re-mentioned moves to newest), each key keeps only its newest few
game.rememberLine({ text: '응', memory: found({ player: { name: '', likes: ['떡볶이', 'A', 'B', 'C', 'D', 'E'], dislikes: [], people: [], plans: [] } }) }, later);
assert.deepEqual(game.state.memory.player.likes, ['떡볶이', 'A', 'B', 'C', 'D', 'E']); // 라면 was oldest, pushed out at 6
assert.equal(game.state.memory.player.name, '민수'); // an empty name never erases the known one

// conversations: over 12, the least important goes first, oldest among equals
for (let index = 0; index < 12; index++) {
  game.rememberLine({ text: '…', memory: found({ episode: { summary: `대화 ${index}`, weight: index === 0 ? 3 : 1, feeling: 'neutral' } }) }, later);
}
game.rememberLine({ text: '…', memory: found({ episode: { summary: '중요한 얘기', weight: 3, feeling: 'sad' } }) }, later);
const episodes = game.state.memory.episodes;
assert.equal(episodes.length, 12);
assert.equal(episodes[0].summary, '대화 0'); // weight 3 survives
assert.ok(!episodes.some((episode) => episode.summary === '대화 1')); // oldest weight-1 was dropped
assert.equal(episodes.at(-1).summary, '중요한 얘기');

// naming
game.rename('  콩이  ');
assert.equal(game.state.name, '콩이');
game.rename('   ');
assert.equal(game.state.name, '이모트'); // blank falls back to the default

// recent talk keeps only the last few lines
for (let index = 0; index < 10; index++) game.remember('player', `말 ${index}`);
assert.equal(game.state.history.length, 6);

// meeting a new Emot wipes progress and never repeats the personality
for (let round = 0; round < 10; round++) {
  const before = game.state.personality;
  game.reroll(later);
  assert.notEqual(game.state.personality, before);
  assert.equal(game.state.xp, 0);
  assert.equal(game.state.history.length, 0);
}

// ---- level gate: XP stops at the next heart until its event is passed ----
const day1 = new Date(2026, 10, 23, 15).getTime(); // 3 pm
const night1 = new Date(2026, 10, 23, 22).getTime();
const day2 = new Date(2026, 10, 24, 15).getTime();
const gate = new Game(day1);
gate.state.personality = 'polite';
gate.state.social = 100;
gate.state.bond = 100;
for (let step = 0; step < 20; step++) gate.applySend(4, 0);
assert.equal(gate.state.xp, LEVEL_XP[1]); // capped at the Lv2 threshold
assert.equal(gate.level, 1);
assert.ok(gate.eventReady);
const lv2 = gate.nextEvent(day1);
assert.equal(lv2.event.title, '방명록');
assert.equal(lv2.blocked, null);
gate.completeEvent(lv2.event, true, '민수', day1);
assert.equal(gate.level, 2);
assert.equal(gate.state.memory.player.name, '민수'); // the guestbook answer is the player's name
assert.deepEqual(gate.state.story.items, ['방명록 첫 줄']);

// a failed judged scene reopens tomorrow; 'nextDay' scenes wait for a later day than they became ready
gate.state.unlocked = 4;
gate.state.xp = LEVEL_XP[4];
gate.state.eventReadyDay = new Date(day1).toDateString();
assert.equal(gate.nextEvent(day1).event.title, '휴무일');
assert.equal(gate.nextEvent(day1).blocked, 'nextDay');
assert.equal(gate.nextEvent(day2).blocked, null);
gate.completeEvent(gate.nextEvent(day2).event, false, '몰라', day2);
assert.equal(gate.nextEvent(day2).blocked, 'retry');
assert.equal(gate.level, 4);

// 'night' scenes only open from 21:00
gate.state.personality = 'blunt';
gate.state.unlocked = 5;
gate.state.xp = LEVEL_XP[5];
gate.state.eventRetryDay = null;
assert.equal(gate.nextEvent(day1).blocked, 'night');
assert.equal(gate.nextEvent(night1).blocked, null);

// persona flags from the last scene
gate.state.personality = 'polite';
gate.state.unlocked = 9;
gate.state.xp = LEVEL_XP[9];
gate.completeEvent(gate.nextEvent(night1).event, true, '그래', night1);
assert.equal(gate.level, 10);
assert.equal(gate.state.story.flags.casual, true);
assert.equal(gate.eventReady, false); // nothing after the last heart

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
