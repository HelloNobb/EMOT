import { CHARACTER, FACE_HOLD_MS, SAVE_INTERVAL_SECONDS } from './config.js';
import { loadImage, CharacterView } from './character.js';
import { Face } from './face.js';
import { Game } from './game.js';
import { post } from './api.js';
import { parseAnswers, createEmotionJudge } from './emotion.js';
import {
  showStats, showEmotion, showJudgeStats, showStatus, placeBubble, showBubble, hideBubble, showToast,
  describeChange, showWorry,
} from './ui.js';

const UI_INTERVAL_SECONDS = 0.25; // DOM writes and the game clock don't need 60 Hz

const canvas = document.getElementById('stage');
const input = document.getElementById('message');
const view = new CharacterView(canvas, await loadImage(CHARACTER.url));
const game = new Game(Date.now());
const face = new Face();
face.setRest(game.level, game.state.personality);
showWorry(game.state.worry);
document.getElementById('loading').remove();

// A reaction stays on the face for a while, then the face eases back to rest.
let holdUntil = 0;
function react(result, source, holdMs = FACE_HOLD_MS) {
  face.setEmotion(result.probabilities, result.intensity);
  showEmotion(result, source);
  holdUntil = performance.now() + holdMs;
}

function afterChange(change) {
  showToast(describeChange(change));
  if (change.levelChange) face.setRest(game.level, game.state.personality);
  game.save();
}

// ---- live reaction while typing (Jev /judge) ----

const judge = createEmotionJudge({
  getContext: () => game.context(),
  onResult: (result) => react(result, '입력 중'),
  onClear: () => {
    face.setEmotion({}, 0);
    showStatus('cleared');
  },
  onStatus: showStatus,
  onStats: showJudgeStats,
});
input.addEventListener('input', () => judge.queue(input.value));

// ---- sending: a normal message (/send) or the answer to today's worry (/answer) ----

let sending = false;
document.getElementById('chat').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || sending) return;
  sending = true;
  input.value = '';
  judge.queue(''); // drop live readings still in flight for the text just sent
  showStatus('pending');
  const worry = game.state.worry;
  try {
    const data = await post(worry ? '/answer' : '/send', { ...game.context(), text, worry: worry ?? undefined });
    const reading = parseAnswers(data);
    if (worry) {
      const score = Number(data.answers?.help?.score) || 0;
      afterChange(game.applyAnswer(text, score));
      showWorry(null);
      showStatus('idle', `고민 점수 ${score.toFixed(1)} / 4`);
      react(reading, '고민 대답');
    } else {
      const warmth = Number(data.answers?.warmth?.score) || 0;
      const hurtful = Number(data.answers?.hurtful?.noul) || 0;
      afterChange(game.applySend(text, warmth, hurtful));
      showStatus('idle');
      react(reading, '보낸 말');
    }
  } catch (error) {
    input.value = text; // don't lose what the player typed
    showStatus('error', error.message);
  } finally {
    sending = false;
  }
});

// ---- clicking Emot: she speaks first (Claude /line, costs energy) ----

let speaking = false;
canvas.addEventListener('click', async (event) => {
  if (speaking || !view.hitTest(event.clientX, event.clientY)) return;
  const now = Date.now();
  if (!game.spendEnergy(now)) {
    showToast('에너지가 없어요. 조금만 기다려 주세요');
    return;
  }
  speaking = true;
  showBubble('…', 0, true);
  try {
    const line = await post('/line', game.llmContext(now));
    const ms = 3500 + line.text.length * 90; // longer lines stay up longer
    showBubble(line.text, ms);
    react(parseAnswers(line), '이모트 대사', ms); // the Worker has Jev read her line
    afterChange(game.applyLine(line));
  } catch (error) {
    game.refundEnergy();
    hideBubble();
    showToast(`이모트가 말을 못 했어요: ${error.message}`);
  } finally {
    speaking = false;
  }
});

// ---- today's worry (Claude /worry), answered through the chat box ----

document.getElementById('worry-button').addEventListener('click', async (event) => {
  if (!game.canAskWorry) return;
  event.currentTarget.disabled = true;
  showBubble('…', 0, true);
  try {
    const { text } = await post('/worry', game.llmContext(Date.now()));
    game.startWorry(text);
    game.save();
    showWorry(text);
    showBubble(text, 6000);
    input.focus();
  } catch (error) {
    hideBubble();
    showToast(`고민을 못 들었어요: ${error.message}`);
  }
});

// ---- frame loop ----

function resize() {
  view.resize();
  placeBubble(view.toScreen(CHARACTER.bubble));
}
window.addEventListener('resize', resize);
resize();
window.addEventListener('pagehide', () => game.save());

let lastTime = 0;
let uiTimer = UI_INTERVAL_SECONDS;
let saveTimer = 0;
requestAnimationFrame(function frame(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1); // a hidden tab returns a huge gap
  lastTime = time;

  if (holdUntil && time > holdUntil && !input.value) {
    holdUntil = 0;
    face.setEmotion({}, 0);
  }
  face.update(dt);
  view.draw(face.params, time / 1000);

  uiTimer += dt;
  if (uiTimer >= UI_INTERVAL_SECONDS) {
    uiTimer = 0;
    const now = Date.now();
    game.tick(now);
    showStats(game, now);
  }
  saveTimer += dt;
  if (saveTimer >= SAVE_INTERVAL_SECONDS) {
    saveTimer = 0;
    game.save();
  }
  requestAnimationFrame(frame);
});
