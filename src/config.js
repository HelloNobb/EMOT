// Every tuning number lives here so balancing never touches logic files.

// Cloudflare Worker (worker/). Routes: /judge /send /line /reply
export const PROXY_URL = 'https://emot-proxy.khj59105.workers.dev';
export const JUDGE_INTERVAL_MS = 400; // while typing, ask Jev at most this often

export const SAVE_KEY = 'emot.save.v2';
export const SAVE_INTERVAL_SECONDS = 5;

// Picked at random on first launch, then fixed for this Emot.
export const PERSONALITIES = {
  blunt: '직설적인 독설가',
  polite: '예의 바르고 유쾌함',
  anxious: '질투 많고 불안함',
};

// Needs run 0..100 and fall in real time, offline included.
export const START_NEEDS = { social: 60, bond: 40 };
export const DECAY_PER_HOUR = { social: 4, bond: 2.5 };

export const ENERGY_MAX = 3;
export const ENERGY_REGEN_MS = 2 * 60 * 1000;

// Total affinity XP needed to reach level (index + 1). Level 10 is the cap.
export const LEVEL_XP = [0, 60, 140, 240, 360, 500, 660, 840, 1040, 1260];

// XP gains scale with the needs: 0.5x when both are empty, 1.5x when both are full.
export const REWARDS = {
  line: { social: 8, xp: 5 }, // Emot opened a topic after a touch
  send: { social: 4, xp: 2, bondPerWarmth: 3, xpPerWarmth: 2 }, // warmth is Jev's 0..4 score
  hurt: { bond: -12, xp: -20 }, // Jev says the message was hurtful
};
export const HURT_THRESHOLD = 0.6;

export const HISTORY_SIZE = 6;

export const DEFAULT_NAME = '이모트';
export const MAX_NAME = 12;
// Key-value memory caps. Keys must match PLAYER_KEYS / SELF_KEYS in worker/index.js (Worker allows up to 6 per key).
export const MEMORY_LIMITS = {
  player: { likes: 6, dislikes: 6, people: 6, plans: 4 },
  self: { likes: 5, dislikes: 5, treasures: 5 },
  episodes: 12, // conversations worth keeping
};
export const FACE_HOLD_MS = 6000; // a reaction stays on the face this long, then eases back to neutral
export const AFTER_BUBBLE_HOLD_MS = 1500; // Emot keeps the line's face briefly after its bubble closes
export const TYPE_MS = 38; // visual-novel typing speed per character
export const TYPE_PAUSE_MS = 220; // extra beat after . , ? ! …

// Order matches the Jev criteria in worker/index.js and the panel rows.
export const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fear', 'disgust', 'contempt'];

// ---- 2D face rig ----

export const PAPER = '#ecede7'; // newsprint; must match --paper in style.css. The white drawing is multiplied onto it
export const INK = '#151515';

// Positions measured on assets/emot-base.webp (1086 x 1448, eyes closed in the drawing).
export const CHARACTER = {
  url: 'assets/emot-base.webp',
  width: 1086,
  height: 1448,
  centerX: 543,
  feetY: 1420, // breathing scales from here so the feet stay planted
  headTilt: -0.12, // the face leans; eyes and mouth rotate with it
  leftEye: { x: 501, y: 224 },
  rightEye: { x: 592, y: 210 },
  eye: { width: 30, height: 19.5, pupil: 5.8 }, // open-eye size; must still cover the drawing's closed lids
  mole: { x: -13, y: 27 }, // under the viewer's-left eye, redrawn because the larger eye covers the original
  mouth: { x: 553, y: 263 },
  cheeks: [{ x: 484, y: 248 }, { x: 612, y: 236 }],
  hit: { x0: 340, y0: 20, x1: 745, y1: 1440 },
  bubble: { x: 690, y: 980 }, // speech bubble's top-left corner: beside the legs, well clear of the face
  eventMark: { x: 630, y: 40 }, // the "!" shown above the head when a heart's event is ready
  screenHeight: 0.6, // share of the free vertical space the drawing fills
};

export const BREATH_SECONDS = 3.6;
export const BREATH_SCALE = 0.006;
export const BLINK_MIN_SECONDS = 2.5;
export const BLINK_MAX_SECONDS = 5.5;
export const BLINK_SECONDS = 0.16;
export const EXPRESSION_SMOOTHING = 10;
export const INTENSITY_GAIN = 2; // expression strength = min(1, score/4 * gain)

// Face parameters. Every emotion is an offset from the resting face, mixed by Jev's probabilities.
export const FACE_REST_LOW = { // level 1: wary, looks away, droopy lids
  eyeOpen: 0.85, pupilSize: 1, gazeX: 0.7, gazeY: 0, browHeight: 0, browTilt: 0.1,
  mouthCurve: -0.15, mouthOpen: 0, mouthWidth: 1, mouthSkew: 0,
  blush: 0, anger: 0, sweat: 0, gloom: 0, surprise: 0,
};
export const FACE_REST_HIGH = { // level 10: looks at you, softer
  ...FACE_REST_LOW, eyeOpen: 1, gazeX: 0, browTilt: 0, mouthCurve: 0.25, blush: 0.15,
};
export const PERSONALITY_FACE = {
  blunt: { eyeOpen: -0.1, mouthCurve: -0.1 },
  polite: { mouthCurve: 0.15 },
  anxious: { sweat: 0.2, browTilt: 0.2 },
};
export const EMOTION_FACE = {
  neutral: {},
  happy: { eyeOpen: -0.35, pupilSize: 0.2, gazeX: -0.5, mouthCurve: 1.1, mouthOpen: 0.35, browHeight: 0.3, blush: 1 },
  sad: { eyeOpen: -0.2, gazeY: 0.5, browTilt: 1, mouthCurve: -0.9, gloom: 0.7 },
  angry: { eyeOpen: -0.15, pupilSize: -0.2, gazeX: -0.5, browHeight: -0.6, browTilt: -1, mouthCurve: -0.6, mouthWidth: -0.2, anger: 1 },
  surprised: { eyeOpen: 0.35, pupilSize: -0.35, gazeX: -0.5, browHeight: 1, mouthOpen: 0.8, mouthWidth: -0.4, surprise: 1 },
  fear: { eyeOpen: 0.25, pupilSize: -0.4, browHeight: 0.5, browTilt: 0.8, mouthCurve: -0.5, mouthOpen: 0.3, sweat: 1, gloom: 0.5 },
  disgust: { eyeOpen: -0.4, browTilt: -0.6, mouthCurve: -0.7, mouthSkew: -0.6, gloom: 0.3 },
  contempt: { eyeOpen: -0.45, gazeX: 0.6, browHeight: -0.2, mouthCurve: 0.2, mouthSkew: 1 },
};
