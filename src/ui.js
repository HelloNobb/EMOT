import { PERSONALITIES, TYPE_MS, TYPE_PAUSE_MS } from './config.js';

// Only writes into elements that index.html already declares.
const element = (id) => document.getElementById(id);

const stats = {
  personality: element('personality'),
  hearts: [...document.querySelectorAll('.hearts i')],
  level: element('level'),
  xp: element('xp'),
  social: element('social'),
  socialBar: element('social-bar'),
  bond: element('bond'),
  bondBar: element('bond-bar'),
  pips: [...document.querySelectorAll('.pips i')],
  energyTimer: element('energy-timer'),
};

const formatTimer = (ms) => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const EVENT_HINT = {
  ready: '하트가 준비됐어요. 눌러서 이야기를 들어 보세요',
  night: '하트가 준비됐어요. 밤에 무슨 일이 있을 것 같아요',
  nextDay: '하트가 준비됐어요. 내일 다시 와 보세요',
  retry: '오늘은 여기까지. 내일 다시 이야기해 보세요',
};

const eventMark = element('event-mark');

export function placeEventMark({ x, y }) {
  eventMark.style.left = `${x}px`;
  eventMark.style.top = `${y}px`;
}

export function showStats(game, now) {
  const { personality, social, bond, energy } = game.state;
  const { level, xp, to } = game.levelProgress();
  const pending = game.nextEvent(now);
  eventMark.hidden = !pending || Boolean(pending.blocked);
  stats.personality.textContent = PERSONALITIES[personality];
  // One heart per level: earned levels solid, the one being filled in screentone.
  stats.hearts.forEach((heart, index) => {
    heart.className = index < level - 1 ? 'full' : index === level - 1 ? 'now' : '';
  });
  stats.level.textContent = `Lv ${level}`;
  stats.xp.textContent = pending
    ? EVENT_HINT[pending.blocked ?? 'ready']
    : to === null ? '마음을 다 열었어요' : `다음 하트까지 ${Math.ceil(to - xp)}`;
  stats.social.textContent = Math.round(social);
  stats.socialBar.style.width = `${social}%`;
  stats.bond.textContent = Math.round(bond);
  stats.bondBar.style.width = `${bond}%`;
  stats.pips.forEach((pip, index) => pip.classList.toggle('on', index < energy));
  const timer = game.energyTimer(now);
  stats.energyTimer.textContent = timer === null ? '에너지 가득' : `${formatTimer(timer)} 뒤 하나 더`;
}

// ---- feelings readout ----

const EMOTION_LABELS = {
  neutral: '평온', happy: '기쁨', sad: '슬픔', angry: '분노',
  surprised: '놀람', fear: '두려움', disgust: '혐오', contempt: '경멸',
};
const INTENSITY_LABELS = ['거의 없음', '약함', '분명함', '강함', '압도적'];

const metricRow = (row) => ({ row, bar: row.querySelector('i'), value: row.querySelector('b') });
const emotionRows = [...document.querySelectorAll('[data-emotion]')].map(metricRow);
const intensityRows = [...document.querySelectorAll('[data-intensity]')].map(metricRow);

const judge = {
  name: element('emotion-name'),
  intensity: element('emotion-intensity'),
  source: element('source'),
  confidence: element('confidence'),
  latency: element('latency'),
  requests: element('requests'),
  failures: element('failures'),
  raw: element('raw-json'),
  status: element('judge-status'),
};

function fillRow({ bar, value }, probability) {
  bar.style.width = `${probability * 100}%`;
  value.textContent = probability.toFixed(2);
}

const formatConfidence = (value) => (Number.isFinite(value) ? value.toFixed(2) : '-');

// source: what produced this reading ("쓰는 중", "보낸 말", "이모트 대사"...).
export function showEmotion(result, source) {
  for (const entry of emotionRows) {
    const name = entry.row.dataset.emotion;
    fillRow(entry, result.probabilities[name]);
    entry.row.classList.toggle('top', name === result.emotion);
  }
  const topLevel = Math.round(result.score);
  intensityRows.forEach((entry, level) => {
    fillRow(entry, result.intensityProbabilities[level]);
    entry.row.classList.toggle('top', level === topLevel);
  });
  judge.name.textContent = EMOTION_LABELS[result.emotion];
  judge.intensity.textContent = INTENSITY_LABELS[topLevel];
  judge.source.textContent = source;
  judge.confidence.textContent =
    `${formatConfidence(result.confidence.emotion)} / ${formatConfidence(result.confidence.intensity)}`;
  judge.raw.textContent = JSON.stringify(result.raw, null, 2);
}

export function showJudgeStats({ requests, failures, latency }) {
  judge.requests.textContent = requests;
  judge.failures.textContent = failures;
  judge.latency.textContent = latency === null ? '-' : `${latency}ms`;
}

const STATUS_TEXT = {
  pending: '',
  idle: '이모트가 반응했어요',
  cleared: '말을 쓰는 동안 이모트 표정이 바뀌어요',
};

export function showStatus(state, message) {
  judge.status.className = `status-line ${state}`;
  judge.status.textContent = state === 'error' ? `보내지 못했어요: ${message}` : (message ?? STATUS_TEXT[state]);
}

// ---- speech bubble: typed out like a visual novel; click to finish, click again to close ----

const bubble = element('bubble');
const bubbleName = element('bubble-name');
const bubbleText = element('bubble-text');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let typing = null; // { text, shown, timer } while characters are still appearing
let onBubbleClosed = () => {};
let emotName = '이모트';

// The player's chosen name everywhere it is shown: status title, dialogs, the bubble's name tag.
export function showName(name) {
  emotName = name;
  for (const node of document.querySelectorAll('[data-emot-name]')) node.textContent = name;
}

const CHAT_SPACE = 150; // CSS px the chat line takes at the bottom
const BUBBLE_ROOM = 110; // enough height for a three-line caption

// anchor: the centre of the box's top edge, over Emot's legs. It stays on screen and above the chat line.
export function placeBubble(anchor) {
  const width = Math.min(270, window.innerWidth - 32); // matches the CSS width
  bubble.style.left = `${Math.max(16, Math.min(anchor.x - width / 2, window.innerWidth - width - 16))}px`;
  bubble.style.top = `${Math.max(16, Math.min(anchor.y, window.innerHeight - CHAT_SPACE - BUBBLE_ROOM))}px`;
}

// Manga thought dots beside the head: shown while a line is being written instead of an empty box.
const thought = element('thought');

export function placeThought({ x, y }) {
  thought.style.left = `${x}px`;
  thought.style.top = `${y}px`;
}

export function setBubbleClosedHandler(handler) {
  onBubbleClosed = handler;
}

export function showThinking() {
  stopTyping();
  bubble.hidden = true;
  thought.hidden = false;
}

export function showLine(text) {
  stopTyping();
  thought.hidden = true;
  bubbleName.textContent = emotName;
  bubble.className = 'bubble';
  bubble.hidden = false;
  if (reducedMotion.matches) {
    finishTyping(text);
    return;
  }
  typing = { text, shown: 0, timer: 0 };
  bubbleText.textContent = '';
  typeNext();
}

function typeNext() {
  const character = typing.text[typing.shown];
  typing.shown++;
  bubbleText.textContent = typing.text.slice(0, typing.shown);
  if (typing.shown >= typing.text.length) {
    finishTyping(typing.text);
    return;
  }
  const pause = /[.,?!…]/.test(character) ? TYPE_PAUSE_MS : 0;
  typing.timer = setTimeout(typeNext, TYPE_MS + pause);
}

function finishTyping(text) {
  stopTyping();
  bubbleText.textContent = text;
  bubble.classList.add('done');
}

function stopTyping() {
  if (typing) clearTimeout(typing.timer);
  typing = null;
}

export function hideBubble() {
  stopTyping();
  thought.hidden = true;
  bubble.hidden = true;
}

function advanceBubble() {
  if (typing) {
    finishTyping(typing.text);
    return;
  }
  hideBubble();
  onBubbleClosed();
}

bubble.addEventListener('click', advanceBubble);
bubble.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  advanceBubble();
});

// ---- toast ----

const toast = element('toast');
let toastTimer = 0;

export function showToast(text) {
  if (!text) return;
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

const signed = (value) => `${value > 0 ? '+' : ''}${Math.round(value)}`;

// Turns Game.change() results into "접촉 +4, 교감 +9, 호감도 +6".
export function describeChange({ social, bond, xp, levelChange }) {
  const parts = [];
  if (Math.round(social)) parts.push(`접촉 ${signed(social)}`);
  if (Math.round(bond)) parts.push(`교감 ${signed(bond)}`);
  if (Math.round(xp)) parts.push(`호감도 ${signed(xp)}`);
  if (levelChange > 0) parts.push('하트가 하나 늘었어요');
  if (levelChange < 0) parts.push('하트가 하나 줄었어요');
  return parts.join(', ');
}

// ---- dialogs: memory, naming a new Emot, and the "meet a new Emot" confirmation ----

const memoryDialog = element('memory-dialog');
const input = element('message');
const factSlots = [...document.querySelectorAll('[data-fact]')];
const episodeItems = [...document.querySelectorAll('#episode-list li')];
const storyItems = [...document.querySelectorAll('#story-list li')];
const itemItems = [...document.querySelectorAll('#item-list li')];
const historyItems = [...document.querySelectorAll('#history-list li')];
const rerollDialog = element('reroll-dialog');
const nameDialog = element('name-dialog');
const nameInput = element('name-input');

// Fills the fixed slots in index.html; empty slots hide themselves through CSS.
export function openMemory({ memory, history, story }) {
  const facts = story.facts.slice(-storyItems.length);
  storyItems.forEach((item, index) => { item.textContent = facts[index] ?? ''; });
  itemItems.forEach((item, index) => { item.textContent = story.items[index] ?? ''; });
  element('story-empty').hidden = facts.length > 0;
  element('item-empty').hidden = story.items.length > 0;
  for (const slot of factSlots) {
    const [group, key] = slot.dataset.fact.split('.');
    const value = memory[group][key];
    slot.textContent = Array.isArray(value) ? value.join(', ') : value;
  }
  episodeItems.forEach((item, index) => {
    const episode = memory.episodes[index];
    item.textContent = episode?.summary ?? '';
    item.dataset.day = episode?.day ?? '';
  });
  historyItems.forEach((item, index) => {
    const entry = history[index];
    item.textContent = entry ? `${entry.who === 'player' ? '나' : emotName}: ${entry.text}` : '';
    item.dataset.who = entry?.who ?? '';
  });
  element('episode-empty').hidden = memory.episodes.length > 0;
  element('history-empty').hidden = history.length > 0;
  memoryDialog.showModal();
}

// While an event waits for the player's answer, the chat line asks the scene's question.
export function showAsk(ask) {
  input.placeholder = ask ? ask.placeholder : '이모트에게 말 걸기';
  showStatus('cleared', ask ? ask.prompt : undefined);
}

// A new Emot asks for a name. Closing without one keeps the default.
export function askName(personalityLabel, onNamed) {
  element('name-personality').textContent = personalityLabel;
  nameInput.value = '';
  nameDialog.showModal();
  nameDialog.addEventListener('close', () => onNamed(nameInput.value), { once: true });
}

export function confirmReroll(onConfirm) {
  rerollDialog.returnValue = '';
  rerollDialog.showModal();
  rerollDialog.addEventListener('close', () => {
    if (rerollDialog.returnValue === 'confirm') onConfirm();
  }, { once: true });
}
