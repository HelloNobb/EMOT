import { PROXY_URL, JUDGE_DEBOUNCE_MS, EMOTIONS } from './config.js';

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

// Debounces typing, sends message + needs to the proxy, and drops answers that a newer message replaced.
export function createEmotionJudge({ getContext, onResult, onStatus, onStats }) {
  const stats = { requests: 0, failures: 0, latency: null };
  let latestId = 0;
  let timer = 0;

  async function judge(text) {
    const id = ++latestId;
    stats.requests++;
    onStatus('pending');
    onStats(stats);
    const started = performance.now();
    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...getContext() }), // needs read now, not when typing started
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? data.message ?? `HTTP ${response.status}`);
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
    queue(text) {
      clearTimeout(timer);
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!PROXY_URL) {
        onStatus('error', 'PROXY_URL 미설정 (src/config.js)');
        return;
      }
      timer = setTimeout(() => judge(trimmed), JUDGE_DEBOUNCE_MS);
    },
  };
}
