import { PERSONALITIES, ENERGY_MAX, WORRIES_PER_DAY } from './config.js';

// Only writes into elements that index.html already declares.
const element = (id) => document.getElementById(id);

const stats = {
  personality: element('personality'),
  level: element('level'),
  levelBar: element('level-bar'),
  xp: element('xp'),
  social: element('social'),
  socialBar: element('social-bar'),
  bond: element('bond'),
  bondBar: element('bond-bar'),
  energy: element('energy'),
  energyTimer: element('energy-timer'),
  worryButton: element('worry-button'),
};

const formatTimer = (ms) => {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function showStats(game, now) {
  const { personality, social, bond, energy, worry } = game.state;
  const { level, xp, from, to } = game.levelProgress();
  stats.personality.textContent = PERSONALITIES[personality];
  stats.level.textContent = `Lv ${level}`;
  stats.levelBar.style.width = to === null ? '100%' : `${((xp - from) / (to - from)) * 100}%`;
  stats.xp.textContent = to === null ? 'MAX' : `${Math.floor(xp)} / ${to}`;
  stats.social.textContent = Math.round(social);
  stats.socialBar.style.width = `${social}%`;
  stats.bond.textContent = Math.round(bond);
  stats.bondBar.style.width = `${bond}%`;
  stats.energy.textContent = '●'.repeat(energy) + '○'.repeat(ENERGY_MAX - energy);
  const timer = game.energyTimer(now);
  stats.energyTimer.textContent = timer === null ? '가득' : `다음 충전 ${formatTimer(timer)}`;
  stats.worryButton.disabled = !game.canAskWorry;
  stats.worryButton.textContent = worry
    ? '고민에 대답해 주세요'
    : `오늘의 고민 듣기 (${game.worriesLeft}/${WORRIES_PER_DAY})`;
}

// ---- emotion panel ----

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
  value.textContent = probability.toFixed(3);
}

const formatConfidence = (value) => (Number.isFinite(value) ? value.toFixed(3) : '-');

// source: what produced this reading ("입력 중", "보낸 말", "이모트 대사"...).
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
  judge.intensity.textContent = `${INTENSITY_LABELS[topLevel]} · score ${result.score.toFixed(2)}`;
  judge.source.textContent = source;
  judge.confidence.textContent =
    `${formatConfidence(result.confidence.emotion)} / ${formatConfidence(result.confidence.intensity)}`;
  judge.raw.textContent = JSON.stringify(result.raw, null, 2);
}

export function showJudgeStats({ requests, failures, latency }) {
  judge.requests.textContent = requests;
  judge.failures.textContent = failures;
  judge.latency.textContent = latency === null ? '-' : `${latency} ms`;
}

const STATUS_TEXT = {
  pending: '이모트가 듣는 중…',
  idle: '이모트가 반응했어요',
  cleared: '입력하면 이모트가 바로 반응해요',
};

export function showStatus(state, message) {
  judge.status.className = `status ${state}`;
  judge.status.textContent = state === 'error' ? `실패: ${message}` : (message ?? STATUS_TEXT[state]);
}

// ---- bubble, toast, worry card ----

const bubble = element('bubble');
const toast = element('toast');
const worryCard = element('worry');
const input = element('message');
let bubbleTimer = 0;
let toastTimer = 0;

export function placeBubble({ x, y }) {
  bubble.style.left = `${x}px`;
  bubble.style.top = `${y}px`;
}

// ms = 0 keeps it up until replaced (used for the "…" while a line is loading).
export function showBubble(text, ms, loading = false) {
  clearTimeout(bubbleTimer);
  bubble.textContent = text;
  bubble.classList.toggle('loading', loading);
  bubble.hidden = false;
  if (ms > 0) bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

export function hideBubble() {
  clearTimeout(bubbleTimer);
  bubble.hidden = true;
}

export function showToast(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

const signed = (value) => `${value > 0 ? '+' : ''}${Math.round(value)}`;

// Turns Game.change() results into "접촉 +4 · 교감 +9 · 호감도 +6".
export function describeChange({ social, bond, xp, levelChange }) {
  const parts = [];
  if (Math.round(social)) parts.push(`접촉 ${signed(social)}`);
  if (Math.round(bond)) parts.push(`교감 ${signed(bond)}`);
  if (Math.round(xp)) parts.push(`호감도 ${signed(xp)}`);
  if (levelChange > 0) parts.push('레벨 업!');
  if (levelChange < 0) parts.push('레벨 다운…');
  return parts.join(' · ');
}

export function showWorry(text) {
  worryCard.hidden = !text;
  worryCard.textContent = text ? `오늘의 고민: ${text}` : '';
  input.placeholder = text ? '고민에 대답해 주기…' : '이모트에게 말 걸기…';
}
