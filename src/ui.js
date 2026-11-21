import { ACTIONS } from './config.js';
import { moneyForLevel } from './sim.js';

// Only writes into elements that index.html already declares.
const element = (id) => document.getElementById(id);

const stats = {
  money: element('money'),
  level: element('level'),
  levelBar: element('level-bar'),
  hunger: element('hunger'),
  hungerBar: element('hunger-bar'),
  fatigue: element('fatigue'),
  fatigueBar: element('fatigue-bar'),
  action: element('action'),
};

const PHASE_LABEL = { moving: '(이동 중)', using: '' };

export function showStats(sim) {
  const { hunger, fatigue, money } = sim.state;
  const level = sim.level;
  const from = moneyForLevel(level);
  const to = moneyForLevel(level + 1);
  stats.money.textContent = Math.floor(money).toLocaleString();
  stats.level.textContent = `${level}  (${Math.floor(money)}/${to})`;
  stats.levelBar.style.width = `${((money - from) / (to - from)) * 100}%`;
  stats.hunger.textContent = Math.round(hunger);
  stats.hungerBar.style.width = `${hunger}%`;
  stats.fatigue.textContent = Math.round(fatigue);
  stats.fatigueBar.style.width = `${fatigue}%`;
  stats.action.textContent = sim.action ? `${ACTIONS[sim.action].label} ${PHASE_LABEL[sim.phase]}` : '대기';
}

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

export function showEmotion(result) {
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
  judge.confidence.textContent =
    `${formatConfidence(result.confidence.emotion)} / ${formatConfidence(result.confidence.intensity)}`;
  judge.raw.textContent = JSON.stringify(result.raw, null, 2);
}

export function showJudgeStats({ requests, failures, latency }) {
  judge.requests.textContent = requests;
  judge.failures.textContent = failures;
  judge.latency.textContent = latency === null ? '-' : `${latency} ms`;
}

const STATUS_TEXT = { pending: 'Jev가 판단하는 중…', idle: '판단 완료' };

export function showJudgeStatus(state, message) {
  judge.status.className = `status ${state}`;
  judge.status.textContent = state === 'error' ? `실패: ${message}` : STATUS_TEXT[state];
}
