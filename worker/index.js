// Proxy between the GitHub Pages client and the TypeSafe API.
// It hides the key and owns the questions, so this endpoint can only judge EMOT's character emotion.

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const ALLOWED_ORIGINS = ['https://hellonobb.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const MAX_TEXT_LENGTH = 200;

const ACTION_DESCRIPTIONS = {
  eat: 'eating at the fridge',
  sleep: 'sleeping in bed',
  work: 'working on the laptop to mine coins',
  rest: 'resting on the sofa',
};

// Criteria keys must match EMOTIONS in src/config.js; score levels map to 0..4.
const QUESTIONS = {
  emotion: {
    type: 'choice',
    instructions:
      "How does the character emotionally react to the player's message? Judge mainly from what the message says and its tone. " +
      'The background condition may only nudge the reaction slightly and never overrides the message: ' +
      'a kind message still gets a warm reaction from a tired character, and a short or unfinished message stays mostly neutral.',
    criteria: {
      neutral: 'calm, nothing in particular',
      happy: 'pleased, grateful, amused',
      sad: 'hurt, disappointed, lonely',
      angry: 'annoyed, offended, irritated',
      surprised: 'startled, caught off guard',
      fear: 'scared, anxious, threatened',
      disgust: 'grossed out, repulsed',
      contempt: 'scornful, looks down on the speaker',
    },
  },
  intensity: {
    type: 'score',
    instructions: "How strongly does the character react to the player's message?",
    criteria: ['barely any', 'weak', 'clear', 'strong', 'overwhelming'],
  },
};

// Words instead of numbers: raw 80/100 values made Jev read every message as angry.
const level3 = (value, low, mid, high) => (value < 40 ? low : value < 70 ? mid : high);

function describeState({ text, hunger, fatigue, action }) {
  const hungry = level3(hunger, 'not hungry', 'a bit hungry', 'quite hungry');
  const tired = level3(fatigue, 'well rested', 'a bit tired', 'quite tired');
  return [
    `Message the player just sent to the character (may be Korean, may be unfinished): ${JSON.stringify(text)}`,
    `Background, secondary: the character lives alone in a small room, is ${hungry} and ${tired}, ` +
      `and is currently ${ACTION_DESCRIPTIONS[action] ?? 'standing idle'}.`,
  ].join('\n');
}

const isNeed = (value) => Number.isFinite(value) && value >= 0 && value <= 100;

// Trust boundary: everything from the browser is checked before it reaches the paid API.
function readInput(body) {
  if (!body || typeof body.text !== 'string') return null;
  const text = body.text.trim();
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) return null;
  if (!isNeed(body.hunger) || !isNeed(body.fatigue)) return null;
  if (!Number.isInteger(body.level) || body.level < 1 || body.level > 1000) return null;
  if (body.action !== null && !(body.action in ACTION_DESCRIPTIONS)) return null;
  return { text, hunger: Math.round(body.hunger), fatigue: Math.round(body.fatigue), action: body.action, level: body.level };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ message: 'POST only' }, 405, cors);

    // Origin is spoofable outside browsers, so a per-IP limit is the real guard on spend.
    const { success } = await env.LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' });
    if (!success) return json({ message: 'Too many requests' }, 429, cors);

    const input = readInput(await request.json().catch(() => null));
    if (!input) return json({ message: 'Invalid request' }, 400, cors);

    const upstream = await fetch(TYPESAFE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, state: describeState(input), questions: QUESTIONS }),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  },
};
