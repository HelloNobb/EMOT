import { CHARACTER, PERSONALITIES, EMOTIONS, FACE_HOLD_MS, AFTER_BUBBLE_HOLD_MS, SAVE_INTERVAL_SECONDS } from './config.js';
import { fillTemplate, josa } from './events.js';
import { loadImage, CharacterView } from './character.js';
import { Face } from './face.js';
import { Game } from './game.js';
import { post } from './api.js';
import { parseAnswers, createEmotionJudge } from './emotion.js';
import {
  showStats, showEmotion, showJudgeStats, showStatus, placeBubble, setBubbleClosedHandler, showThinking, showLine,
  hideBubble, showToast, describeChange, openMemory, confirmReroll, showName, askName, placeEventMark, showAsk,
  placeThought,
} from './ui.js';

const UI_INTERVAL_SECONDS = 0.25; // DOM writes and the game clock don't need 60 Hz

const canvas = document.getElementById('stage');
const input = document.getElementById('message');
const view = new CharacterView(canvas, await loadImage(CHARACTER.url));
const game = new Game(Date.now());
const face = new Face();
// Resting face follows the level, the personality, and whether an event has calmed her down.
const refreshRest = () => face.setRest(game.level, game.state.personality, game.state.story.flags.calm === true);
refreshRest();
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
// Event scenes wait for each bubble to be closed before showing the next line.
let waitForBubble = null;
setBubbleClosedHandler(() => {
  holdUntil = performance.now() + AFTER_BUBBLE_HOLD_MS;
  const next = waitForBubble;
  waitForBubble = null;
  next?.();
});

function afterChange(change) {
  const { name } = game.state;
  showToast(change.eventReady ? `하트가 준비됐어요. ${name}${josa(name, '을', '를')} 눌러 보세요` : describeChange(change));
  if (change.levelChange) refreshRest();
  game.save();
}

// Shows a line Emot said: typed bubble + her face from Jev's reading of it.
function say(line, source) {
  showLine(line.text);
  react(parseAnswers(line), source, Infinity);
}

// One Claude line at a time: a touch is ignored while a reply is still coming, and the other way round.
let talking = false;

// ---- level-up events: written scenes (src/events.js); a heart is earned only by finishing one ----

let eventAsk = null; // { event, scene } while a scene waits for the player's typed answer

// A scripted line's face: the written emotion at moderate strength, shaped like a Jev reading for the panel.
function sceneReading(feel) {
  return {
    emotion: feel,
    probabilities: Object.fromEntries(EMOTIONS.map((name) => [name, name === feel ? 1 : 0])),
    intensityProbabilities: [0, 0, 1, 0, 0],
    score: 2,
    intensity: 0.5,
    confidence: {},
    raw: { scene: feel },
  };
}

function playLines(lines, answer = '') {
  return lines.reduce((previous, [feel, text]) => previous.then(() => new Promise((resolve) => {
    waitForBubble = resolve;
    showLine(fillTemplate(text, game.templateValues(answer)));
    react(sceneReading(feel), '이벤트', Infinity);
  })), Promise.resolve());
}

async function startEvent(event) {
  talking = true;
  await playLines(event.lines);
  if (!event.ask) {
    finishEvent(event, true, '');
    return;
  }
  const scene = event.lines.map(([, text]) => fillTemplate(text, game.templateValues())).join(' ');
  eventAsk = { event, scene };
  showAsk(event.ask);
  input.focus();
  talking = false; // the chat line is open again, for the answer
}

async function answerEvent(text) {
  const { event, scene } = eventAsk;
  talking = true;
  input.value = '';
  judge.queue('');
  let passed = true;
  if (event.ask.kind === 'judge') {
    showThinking();
    try {
      const result = await post('/event', { ...game.context(), eventLevel: event.level, scene, text });
      passed = result.passed;
    } catch (error) {
      hideBubble();
      input.value = text;
      showStatus('error', error.message);
      talking = false;
      return;
    }
  }
  eventAsk = null;
  showAsk(null);
  await playLines(passed ? event.pass ?? [] : event.fail ?? [], text);
  finishEvent(event, passed, text);
}

function finishEvent(event, passed, answer) {
  const result = game.completeEvent(event, passed, answer, Date.now());
  game.save();
  talking = false;
  if (result.levelChange) {
    refreshRest();
    showToast(`하트가 하나 늘었어요: ${event.title}`);
  } else {
    showToast('오늘은 여기까지. 내일 다시 이야기해 보세요');
  }
  showStats(game, Date.now());
}

const EVENT_WAIT_HINT = {
  night: '할 말이 있는 것 같아요. 밤에 다시 와 보세요',
  nextDay: '할 말이 있는 것 같아요. 내일 다시 와 보세요',
  retry: '오늘은 여기까지예요. 내일 다시 이야기해 보세요',
};

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

// ---- sending: Jev judges the message (/send), then Claude answers with that same feeling (/reply) ----

document.getElementById('chat').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || talking) return;
  if (eventAsk) {
    answerEvent(text);
    return;
  }
  talking = true;
  input.value = '';
  judge.queue(''); // drop live readings still in flight for the text just sent
  showStatus('pending');
  game.remember('player', text);
  showThinking();

  // One feeling drives everything: Jev's reading of the message sets the face now, stays on it while she
  // answers, and is handed to Claude so the words carry the same emotion.
  const judging = post('/send', { ...game.context(), text }).then((data) => {
    const reading = parseAnswers(data);
    react(reading, '보낸 말');
    afterChange(game.applySend(Number(data.answers?.warmth?.score) || 0, Number(data.answers?.hurtful?.noul) || 0));
    showStatus('idle');
    return reading;
  });
  const replying = judging.catch(() => null).then(async (reading) => {
    const feeling = reading && { emotion: reading.emotion, intensity: Math.round(reading.score) };
    const reply = await post('/reply', { ...game.llmContext(Date.now()), text, feeling });
    game.rememberLine(reply);
    game.save();
    if (reading) {
      showLine(reply.text);
      react(reading, '보낸 말', Infinity); // keep the same feeling while the answer is on screen
    } else {
      say(reply, '이모트 대답'); // no reading to share: Jev read the answer itself
    }
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

// The next touch line is written in the background right after the previous one, so a touch answers at once.
// Touch lines start a new topic anyway, so being written a little earlier doesn't break the conversation.
let nextLine = null; // Promise of a /line answer

function prepareNextLine() {
  const request = post('/line', game.llmContext(Date.now()));
  request.catch(() => {}); // a failed prefetch is retried on the touch itself
  nextLine = request;
}

async function takeLine(now) {
  const prepared = nextLine;
  nextLine = null;
  try {
    if (prepared) return await prepared;
  } catch {
    // fall through to a fresh request
  }
  return post('/line', game.llmContext(now));
}

canvas.addEventListener('click', async (event) => {
  if (talking || eventAsk || !view.hitTest(event.clientX, event.clientY)) return;
  const now = Date.now();
  // A ready heart's scene comes before anything else, and costs no energy.
  const pending = game.nextEvent(now);
  if (pending && !pending.blocked) {
    startEvent(pending.event);
    return;
  }
  if (pending) showToast(`${game.state.name}, ${EVENT_WAIT_HINT[pending.blocked]}`);
  if (!game.spendEnergy(now)) {
    showToast('에너지가 없어요. 충전되면 다시 눌러 주세요');
    return;
  }
  talking = true;
  showThinking();
  try {
    face.lookUp(true);
    const line = await takeLine(now);
    say(line, '이모트 대사');
    afterChange(game.applyLine(line));
    prepareNextLine();
  } catch (error) {
    game.refundEnergy();
    hideBubble();
    showToast(`이모트가 말하지 못했어요: ${error.message}`);
  } finally {
    face.lookUp(false);
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
    nextLine = null; // written for the previous Emot
    eventAsk = null;
    showAsk(null);
    refreshRest();
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
  placeEventMark(view.toScreen(CHARACTER.eventMark));
  placeThought(view.toScreen(CHARACTER.thought));
}
window.addEventListener('resize', resize);
resize();
window.addEventListener('pagehide', () => game.save());
prepareNextLine();

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
