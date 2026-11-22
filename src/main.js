import { CHARACTER, FACE_HOLD_MS, AFTER_BUBBLE_HOLD_MS, WORRY_CHANCE, SAVE_INTERVAL_SECONDS } from './config.js';
import { loadImage, CharacterView } from './character.js';
import { Face } from './face.js';
import { Game } from './game.js';
import { post } from './api.js';
import { parseAnswers, createEmotionJudge } from './emotion.js';
import {
  showStats, showEmotion, showJudgeStats, showStatus, placeBubble, setBubbleClosedHandler, showThinking, showLine,
  hideBubble, showToast, describeChange, showWorry,
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
// Infinity = hold until something ends it (Emot's bubble closing).
let holdUntil = 0;
function react(result, source, holdMs = FACE_HOLD_MS) {
  face.setEmotion(result.probabilities, result.intensity);
  showEmotion(result, source);
  holdUntil = performance.now() + holdMs;
}
setBubbleClosedHandler(() => {
  holdUntil = performance.now() + AFTER_BUBBLE_HOLD_MS;
});

function afterChange(change) {
  showToast(describeChange(change));
  if (change.levelChange) face.setRest(game.level, game.state.personality);
  game.save();
}

// ---- live reaction while typing (Jev /judge) ----

const judge = createEmotionJudge({
  getContext: () => game.context(),
  onResult: (result) => react(result, '쓰는 중'),
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
      showStatus('idle', `고민에 대한 대답 ${score.toFixed(1)}점 (4점 만점)`);
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

// ---- touching Emot: a line (Claude /line), or sometimes today's worry (/worry). Both cost 1 energy ----

let speaking = false;

async function sayLine(now) {
  const line = await post('/line', game.llmContext(now));
  showLine(line.text);
  react(parseAnswers(line), '이모트 대사', Infinity); // the Worker has Jev read her line
  afterChange(game.applyLine(line));
}

async function shareWorry(now) {
  const worry = await post('/worry', game.llmContext(now));
  const { text } = worry;
  react(parseAnswers(worry), '이모트의 고민', Infinity);
  game.startWorry(text);
  game.save();
  showWorry(text);
  showLine(text, '이모트의 고민');
}

canvas.addEventListener('click', async (event) => {
  if (speaking || !view.hitTest(event.clientX, event.clientY)) return;
  const now = Date.now();
  if (!game.spendEnergy(now)) {
    showToast('에너지가 없어요. 충전되면 다시 눌러 주세요');
    return;
  }
  speaking = true;
  showThinking();
  const worry = game.canAskWorry && Math.random() < WORRY_CHANCE;
  try {
    await (worry ? shareWorry(now) : sayLine(now));
  } catch (error) {
    game.refundEnergy();
    hideBubble();
    showToast(`이모트가 말하지 못했어요: ${error.message}`);
  } finally {
    speaking = false;
  }
});

canvas.addEventListener('pointermove', (event) => {
  canvas.style.cursor = view.hitTest(event.clientX, event.clientY) ? 'pointer' : 'default';
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
