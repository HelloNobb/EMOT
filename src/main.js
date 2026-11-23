import { CHARACTER, PERSONALITIES, FACE_HOLD_MS, AFTER_BUBBLE_HOLD_MS, SAVE_INTERVAL_SECONDS } from './config.js';
import { loadImage, CharacterView } from './character.js';
import { Face } from './face.js';
import { Game } from './game.js';
import { post } from './api.js';
import { parseAnswers, createEmotionJudge } from './emotion.js';
import {
  showStats, showEmotion, showJudgeStats, showStatus, placeBubble, setBubbleClosedHandler, showThinking, showLine,
  hideBubble, showToast, describeChange, openMemory, confirmReroll, showName, askName,
} from './ui.js';

const UI_INTERVAL_SECONDS = 0.25; // DOM writes and the game clock don't need 60 Hz

const canvas = document.getElementById('stage');
const input = document.getElementById('message');
const view = new CharacterView(canvas, await loadImage(CHARACTER.url));
const game = new Game(Date.now());
const face = new Face();
face.setRest(game.level, game.state.personality);
showName(game.state.name);
document.getElementById('loading').remove();

// Every new Emot is named by the player before anything else happens.
function nameNewEmot(onDone = () => {}) {
  askName(PERSONALITIES[game.state.personality], (name) => {
    game.rename(name);
    game.save();
    showName(game.state.name);
    onDone();
  });
}
if (game.isNew) nameNewEmot();

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

// Shows a line Emot said: typed bubble + her face from Jev's reading of it.
function say(line, source) {
  showLine(line.text);
  react(parseAnswers(line), source, Infinity);
}

// One Claude line at a time: a touch is ignored while a reply is still coming, and the other way round.
let talking = false;

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

// ---- sending: Jev judges the message (/send) while Claude writes Emot's answer (/reply) ----

document.getElementById('chat').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || talking) return;
  talking = true;
  input.value = '';
  judge.queue(''); // drop live readings still in flight for the text just sent
  showStatus('pending');
  game.remember('player', text);
  showThinking();

  let replied = false;
  const judging = post('/send', { ...game.context(), text }).then((data) => {
    if (!replied) react(parseAnswers(data), '보낸 말'); // her reaction until the answer arrives
    afterChange(game.applySend(Number(data.answers?.warmth?.score) || 0, Number(data.answers?.hurtful?.noul) || 0));
    showStatus('idle');
  });
  const replying = post('/reply', { ...game.llmContext(Date.now()), text }).then((reply) => {
    replied = true;
    game.rememberLine(reply);
    game.save();
    say(reply, '이모트 대답');
  });

  const [judged, answered] = await Promise.allSettled([judging, replying]);
  if (judged.status === 'rejected') showStatus('error', judged.reason.message);
  if (answered.status === 'rejected') {
    hideBubble();
    showToast(`이모트가 대답하지 못했어요: ${answered.reason.message}`);
  }
  talking = false;
});

// ---- touching Emot: she opens a new topic (Claude /line), costs 1 energy ----

canvas.addEventListener('click', async (event) => {
  if (talking || !view.hitTest(event.clientX, event.clientY)) return;
  const now = Date.now();
  if (!game.spendEnergy(now)) {
    showToast('에너지가 없어요. 충전되면 다시 눌러 주세요');
    return;
  }
  talking = true;
  showThinking();
  try {
    const line = await post('/line', game.llmContext(now));
    say(line, '이모트 대사');
    afterChange(game.applyLine(line));
  } catch (error) {
    game.refundEnergy();
    hideBubble();
    showToast(`이모트가 말하지 못했어요: ${error.message}`);
  } finally {
    talking = false;
  }
});

canvas.addEventListener('pointermove', (event) => {
  canvas.style.cursor = view.hitTest(event.clientX, event.clientY) ? 'pointer' : 'default';
});

// ---- memory view and meeting a new Emot ----

document.getElementById('memory-button').addEventListener('click', () => openMemory(game.state));

document.getElementById('reroll-button').addEventListener('click', () => {
  confirmReroll(() => {
    const now = Date.now();
    game.reroll(now);
    game.save();
    face.setRest(game.level, game.state.personality);
    face.setEmotion({}, 0);
    holdUntil = 0;
    hideBubble();
    showStats(game, now);
    showName(game.state.name);
    nameNewEmot(() => showToast(`${game.state.name}, 잘 부탁해`));
  });
});

// ---- frame loop ----

const NARROW_SCREEN = 760; // matches the narrow-screen breakpoint in style.css
const status = document.querySelector('.status');

function resize() {
  // On narrow screens the status block sits above Emot instead of beside her.
  view.resize(window.innerWidth < NARROW_SCREEN ? status.getBoundingClientRect().bottom + 8 : 0);
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
