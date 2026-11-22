import { JUDGE_INTERVAL_MS, EMOTIONS } from './config.js';
import { post } from './api.js';

const INTENSITY_LEVELS = [0, 1, 2, 3, 4];

// Jev answers -> numbers the face and panel use. Throws on a shape we can't read.
export function parseAnswers(data) {
  const emotion = data?.answers?.emotion;
  const intensity = data?.answers?.intensity;
  if (!emotion?.probabilities || !intensity?.probabilities) throw new Error('응답 형식 오류');

  const probabilities = Object.fromEntries(EMOTIONS.map((name) => [name, Number(emotion.probabilities[name]) || 0]));
  const intensityProbabilities = INTENSITY_LEVELS.map((level) => Number(intensity.probabilities[level]) || 0);
  // score = expected level; use Jev's own interpolated score when it sends one
  const score = Number.isFinite(intensity.score)
    ? intensity.score
    : intensityProbabilities.reduce((sum, probability, level) => sum + probability * level, 0);
  const top = EMOTIONS.reduce((best, name) => (probabilities[name] > probabilities[best] ? name : best));

  return {
    emotion: emotion.choice in probabilities ? emotion.choice : top,
    probabilities,
    intensityProbabilities,
    score,
    intensity: score / (INTENSITY_LEVELS.length - 1),
    confidence: { emotion: emotion.confidence, intensity: intensity.confidence },
    raw: data,
  };
}

// Throttles typing, sends the text + Emot's state to /judge, and drops answers that a newer message replaced.
export function createEmotionJudge({ getContext, onResult, onClear, onStatus, onStats }) {
  const stats = { requests: 0, failures: 0, latency: null };
  let latestId = 0;
  let timer = 0;
  let pendingText = '';
  let lastSentAt = -Infinity;

  async function judge(text) {
    const id = ++latestId;
    stats.requests++;
    onStatus('pending');
    onStats(stats);
    const started = performance.now();
    try {
      const data = await post('/judge', { text, ...getContext() }); // state read now, not when typing started
      if (id !== latestId) return; // stale: the face must show the newest message, not the slowest answer
      stats.latency = Math.round(performance.now() - started);
      onResult(parseAnswers(data));
      onStatus('idle');
    } catch (error) {
      stats.failures++;
      if (id === latestId) onStatus('error', error.message); // keep the last good face
    } finally {
      onStats(stats);
    }
  }

  return {
    // Throttle, not debounce: the face reacts while the player is still typing.
    // The first keystroke sends at once; later ones send at most every JUDGE_INTERVAL_MS, always with the newest text.
    queue(text) {
      pendingText = text.trim();
      if (!pendingText) {
        clearTimeout(timer);
        timer = 0;
        latestId++; // answers still in flight are for text that no longer exists
        onClear();
        return;
      }
      if (timer) return; // a send is already scheduled and will pick up the newest text
      const wait = Math.max(0, lastSentAt + JUDGE_INTERVAL_MS - performance.now());
      timer = setTimeout(() => {
        timer = 0;
        lastSentAt = performance.now();
        judge(pendingText);
      }, wait);
    },
  };
}
