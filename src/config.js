// Every tuning number lives here so balancing never touches logic files.

export const CHARACTER_URL = 'assets/character.vrm';

export const WALK_SPEED = 1.2; // meters per second
export const TURN_SPEED = 8; // radians per second

// Needs run 0..100; higher means hungrier / more tired.
export const NEED_DRIFT = { hunger: 0.4, fatigue: 0.25 }; // per second, always on
export const START_NEEDS = { hunger: 20, fatigue: 20 };

// rates add to NEED_DRIFT while the action runs. An action also ends once every need it lowers hits 0.
export const ACTIONS = {
  eat: { label: '먹기', pose: 'eat', rates: { hunger: -12 }, maxSeconds: 10 },
  sleep: { label: '잠자기', pose: 'sleep', rates: { fatigue: -6 }, maxSeconds: 25 },
  work: { label: '업무', pose: 'work', rates: { hunger: 0.2, fatigue: 0.6 }, maxSeconds: 30, mines: true },
  rest: { label: '휴식', pose: 'sit', rates: { fatigue: -1.5 }, maxSeconds: 8 },
};

// Autonomous choice, checked in this order when idle.
export const CHOOSE_EAT_AT = 60;
export const CHOOSE_SLEEP_AT = 70;
export const CHOOSE_REST_AT = 40;
export const STOP_WORK_AT = 85;
export const IDLE_PAUSE_SECONDS = 1.5;

export const COINS_PER_SECOND = 1;
export const LEVEL_MONEY_UNIT = 50; // level = floor(sqrt(money / unit)) + 1
export const MINING_BONUS_PER_LEVEL = 0.2;

// Cloudflare Worker URL after deploying worker/ (see PLAN.md). Empty string = emotion judging is off.
// Local worker: 'http://localhost:8787'
export const PROXY_URL = '';
export const JUDGE_DEBOUNCE_MS = 600; // wait this long after the last keystroke before asking Jev

// Order matches the Jev question's criteria and the panel rows.
export const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fear', 'disgust', 'contempt'];

// VRM preset weights per emotion. Presets have no fear/disgust/contempt, so those blend existing ones.
export const EXPRESSION_MAP = {
  neutral: {},
  happy: { happy: 1 },
  sad: { sad: 1 },
  angry: { angry: 1 },
  surprised: { surprised: 1, aa: 0.3 },
  fear: { surprised: 0.6, sad: 0.6 },
  disgust: { angry: 0.6, sad: 0.4, ih: 0.4 },
  contempt: { relaxed: 0.5, angry: 0.35 },
};
export const INTENSITY_GAIN = 2; // expression strength = min(1, score/4 * gain); "clear" (2/4) already reads as full
export const EXPRESSION_SMOOTHING = 6; // higher = faster approach to the target face
export const BLINK_MIN_SECONDS = 2.5;
export const BLINK_MAX_SECONDS = 5.5;
export const BLINK_SECONDS = 0.15;

export const SAVE_KEY = 'emot.save.v1';
export const SAVE_INTERVAL_SECONDS = 5;
