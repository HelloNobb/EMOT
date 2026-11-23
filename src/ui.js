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

export function showStats(game, now) {
  const { personality, social, bond, energy } = game.state;
  const { level, xp, to } = game.levelProgress();
  stats.personality.textContent = PERSONALITIES[personality];
  // One heart per level: earned levels solid, the one being filled in screentone.
  stats.hearts.forEach((heart, index) => {
    heart.className = index < level - 1 ? 'full' : index === level - 1 ? 'now' : '';
  });
  stats.level.textContent = `Lv ${level}`;
  stats.xp.textContent = to === null ? '마음을 다 열었어요' : `다음 하트까지 ${Math.ceil(to - xp)}`;
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

// corner: where the bubble wants its top-left (beside the chest). chinY: it never rises above this,
// so the face stays visible. mouth: where the tail on its top edge points.
export function placeBubble(corner, chinY, mouth) {
  const width = Math.min(330, window.innerWidth - 32); // matches the CSS width
  const left = Math.max(16, Math.min(corner.x, window.innerWidth - width - 16));
  bubble.style.left = `${left}px`;
  bubble.style.top = `${Math.max(corner.y, chinY + 18)}px`;
  bubble.style.setProperty('--tail-x', `${Math.max(18, Math.min(mouth.x - left - 8, width - 34))}px`);
}

export function setBubbleClosedHandler(handler) {
  onBubbleClosed = handler;
}

export function showThinking() {
  stopTyping();
  bubbleName.textContent = '이모트';
  bubbleText.textContent = '';
  bubble.className = 'bubble thinking';
  bubble.hidden = false;
}

export function showLine(text, name = '이모트') {
  stopTyping();
  bubbleName.textContent = name;
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
  bubble.hidden = true;
}

function advanceBubble() {
  if (bubble.classList.contains('thinking')) return; // nothing to skip while waiting
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

// ---- dialogs: memory list and the "meet a new Emot" confirmation ----

const memoryDialog = element('memory-dialog');
const memoryItems = [...document.querySelectorAll('#memory-list li')];
const historyItems = [...document.querySelectorAll('#history-list li')];
const rerollDialog = element('reroll-dialog');

// Fills the fixed list slots in index.html; empty slots hide themselves through CSS.
export function openMemory({ memory, history }) {
  memoryItems.forEach((item, index) => { item.textContent = memory[index] ?? ''; });
  historyItems.forEach((item, index) => {
    const entry = history[index];
    item.textContent = entry ? `${entry.who === 'player' ? '나' : '이모트'}: ${entry.text}` : '';
    item.dataset.who = entry?.who ?? '';
  });
  element('memory-empty').hidden = memory.length > 0;
  element('history-empty').hidden = history.length > 0;
  memoryDialog.showModal();
}

export function confirmReroll(onConfirm) {
  rerollDialog.returnValue = '';
  rerollDialog.showModal();
  rerollDialog.addEventListener('close', () => {
    if (rerollDialog.returnValue === 'confirm') onConfirm();
  }, { once: true });
}
