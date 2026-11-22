// Proxy between the GitHub Pages client and the two paid APIs.
// It hides both keys and owns every prompt/question, so the endpoints only serve Emot.
// Jev (TypeSafe) judges the player's words; Claude Haiku writes Emot's lines and worries.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-latest';
const LINE_MODEL = 'claude-haiku-5-5';
const ALLOWED_ORIGINS = ['https://hellonobb.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

const MAX_TEXT = 200;
const MAX_HISTORY = 6;
const MAX_MEMORY = 8;
const MAX_MEMORY_TEXT = 60;
const MAX_LINE_TEXT = 120;

const PERSONALITIES = {
  blunt: {
    jev: 'blunt, frank and sharp-tongued; teases harshly but secretly cares',
    prompt: [
      '성격: 시원시원하고 직설적인 독설가.',
      '- 반말. 돌려 말하지 않고 툭툭 던지듯 짧게 말한다. 팩트로 찌르는 독설과 비꼼이 특기.',
      '- 감정 표현은 서툴러서 걱정도 핀잔처럼 한다. 칭찬은 마지못해 하듯 한다.',
      '- 욕설은 쓰지 않는다. 대신 "바보냐", "어쩌라고", "흥" 같은 말투.',
    ].join('\n'),
  },
  polite: {
    jev: 'polite, cheerful and playful; loves jokes and wordplay',
    prompt: [
      '성격: 예의 바르고 유쾌함.',
      '- 존댓말(해요체). 밝고 장난기가 많고, 말장난과 귀여운 감탄사("오호", "헤헤")를 섞는다.',
      '- 상대를 배려하고 칭찬을 잘 하지만, 가끔 엉뚱한 소리로 웃긴다.',
    ].join('\n'),
  },
  anxious: {
    jev: 'jealous, clingy and anxious; fears being abandoned and gets jealous of others',
    prompt: [
      '성격: 질투심 많고 불안이 많음.',
      '- 반말이지만 소심하다. 말끝을 흐리거나 "...", "혹시", "진짜야?"처럼 확인하려 든다.',
      '- 플레이어가 자기를 떠날까 봐 걱정하고, 다른 사람·다른 것 얘기가 나오면 질투한다.',
      '- 사랑받고 싶은데 티 내는 게 무서워서 돌려 말한다.',
    ].join('\n'),
  },
};

const LEVEL_TONE = [
  [3, '아직 플레이어가 낯설다. 경계하고, 말이 짧고, 속마음을 잘 안 보인다.'],
  [6, '플레이어가 좀 편해졌다. 농담도 하고 관심을 보인다.'],
  [9, '플레이어와 꽤 친하다. 먼저 챙기고, 핵심 기억을 자연스럽게 꺼낸다.'],
  [10, '플레이어를 정말 아낀다. 자기 성격다운 방식으로 애정을 드러낸다.'],
];

// A random seed per call is what keeps lines varied; the model alone tends to repeat itself.
const TOPICS = [
  '어젯밤 꾼 이상한 꿈', '창밖 날씨', '갑자기 먹고 싶어진 음식', '플레이어에게 묻고 싶은 질문', '지루함',
  '아무 의미 없는 혼잣말', '사소한 불만', '요즘 좋아하는 것', '진짜 싫어하는 것', '어릴 때 기억(지어내도 됨)',
  '플레이어 외모나 말투에 대한 한마디', '핵심 기억 중 하나', '지금 시간대에 어울리는 말', '엉뚱한 상상',
  '갑자기 철학적인 질문', '흥얼거리던 노래', '졸림', '동물 이야기', '털어놓는 작은 비밀', '내일 하고 싶은 것',
  '거울 속 자기 모습', '다른 사람 이야기', '하늘이나 별', '무서운 것', '최근 알게 된 신기한 사실', '시시한 농담',
  '지금 기분을 솔직하게', '플레이어가 없을 때 뭐 했는지', '방 안의 물건 하나', '플레이어와 하고 싶은 것',
];

const LINE_RULES = [
  '너는 "이모트(Emot)"다. 헝클어진 짧은 머리, 큰 검은 티셔츠, 다크서클이 있는 졸린 눈의 아이.',
  '화면 속 작은 방에 살고, 화면 밖의 플레이어가 말을 걸어 주며 너를 키운다.',
  '',
  '{personality}',
  '',
  '규칙:',
  '- 한국어로, 1~2문장, 60자 안팎. 이모지·해시태그·따옴표·지문(*행동*) 금지.',
  '- 위 성격과 말투를 끝까지 지킨다. 너는 AI라고 말하지 않는다.',
  '- 최근 대화에 나온 문장이나 표현을 되풀이하지 않는다.',
  '- 사회적 접촉이 낮으면 외로움을, 정서적 교감이 낮으면 서운함을 성격답게 드러낸다.',
  '- memory는 플레이어에 대한 핵심 기억 목록(이름, 좋아하는 것, 중요한 일). 기존 목록을 유지하되 최근 대화에서 플레이어가',
  '  직접 말한 새 사실만 추가하고, 최대 8개, 각 30자 이내. 새 사실이 없으면 기존 목록을 그대로 돌려준다.',
].join('\n');

const LineSchema = z.object({
  text: z.string(),
  memory: z.array(z.string()),
});

const WorrySchema = z.object({ text: z.string() });

const EMOTION_QUESTION = (subject) => ({
  type: 'choice',
  instructions:
    `How does the character emotionally react to ${subject}? Judge mainly from what it says and its tone. ` +
    'The background may only nudge the reaction slightly and never overrides the words; ' +
    'a short or unfinished message stays mostly neutral.',
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
});

const INTENSITY_QUESTION = {
  type: 'score',
  instructions: 'How strongly does the character react?',
  criteria: ['barely any', 'weak', 'clear', 'strong', 'overwhelming'],
};

const level3 = (value, low, mid, high) => (value < 40 ? low : value < 70 ? mid : high);

function background({ personality, social, bond }) {
  const lonely = level3(social, 'feels lonely', 'is okay', 'feels socially satisfied');
  const close = level3(bond, 'feels distant from the player', 'feels somewhat close to the player', 'feels very close to the player');
  return `Background, secondary: the character Emot is ${PERSONALITIES[personality].jev}, ${lonely}, and ${close}.`;
}

// ---- input validation (trust boundary: everything below reaches a paid API) ----

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isPercent = (value) => Number.isFinite(value) && value >= 0 && value <= 100;

function readState(body) {
  if (!body || !(body.personality in PERSONALITIES)) return null;
  if (!isPercent(body.social) || !isPercent(body.bond)) return null;
  if (!Number.isInteger(body.level) || body.level < 1 || body.level > 10) return null;
  return { personality: body.personality, social: Math.round(body.social), bond: Math.round(body.bond), level: body.level };
}

function readMemory(list) {
  if (!Array.isArray(list) || list.length > MAX_MEMORY) return null;
  return list.every((item) => isText(item, MAX_MEMORY_TEXT)) ? list : null;
}

function readHistory(list) {
  if (!Array.isArray(list) || list.length > MAX_HISTORY) return null;
  const valid = list.every((item) => (item?.who === 'player' || item?.who === 'emot') && isText(item.text, MAX_TEXT));
  return valid ? list : null;
}

const isHour = (value) => Number.isInteger(value) && value >= 0 && value <= 23;

// ---- upstream calls ----

class UpstreamError extends Error {}

async function askJev(env, state, questions) {
  const response = await fetch(TYPESAFE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: JEV_MODEL, state, questions }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new UpstreamError(data.message ?? data.error?.message ?? `Jev HTTP ${response.status}`);
  return data;
}

async function askHaiku(env, personality, userContent, schema) {
  if (!env.ANTHROPIC_API_KEY) throw new UpstreamError('대사 API 키 미등록 (ANTHROPIC_API_KEY)');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.parse({
    model: LINE_MODEL,
    max_tokens: 2048,
    system: LINE_RULES.replace('{personality}', PERSONALITIES[personality].prompt),
    messages: [{ role: 'user', content: userContent }],
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === 'refusal') throw new UpstreamError('대사 생성이 거절됨');
  if (!response.parsed_output) throw new UpstreamError(`대사 형식 오류 (${response.stop_reason})`);
  return response.parsed_output;
}

function describeContext(state, hour, memory, history) {
  const tone = LEVEL_TONE.find(([maxLevel]) => state.level <= maxLevel)[1];
  const talk = history.length
    ? history.map((item) => `${item.who === 'player' ? '플레이어' : '이모트'}: ${item.text}`).join('\n')
    : '(아직 없음)';
  return [
    `호감도 레벨 ${state.level}/10: ${tone}`,
    `사회적 접촉 ${state.social}/100, 정서적 교감 ${state.bond}/100, 지금 ${hour}시.`,
    `핵심 기억: ${memory.length ? memory.join(' / ') : '(없음)'}`,
    `최근 대화:\n${talk}`,
  ].join('\n');
}

const randomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)];

// Shared by /line and /worry: both are Claude calls built from the same context.
function readLlmInput(body) {
  const state = readState(body);
  const memory = readMemory(body?.memory);
  const history = readHistory(body?.history);
  if (!state || !memory || !history || !isHour(body.hour)) return null;
  return { state, context: describeContext(state, body.hour, memory, history) };
}

// ---- routes ----

const ROUTES = {
  // Live reaction while the player is typing.
  async '/judge'(body, env) {
    const state = readState(body);
    if (!state || !isText(body.text, MAX_TEXT)) return null;
    const message = `Message the player is typing to the character (may be Korean, may be unfinished): ${JSON.stringify(body.text.trim())}`;
    return askJev(env, `${message}\n${background(state)}`, {
      emotion: EMOTION_QUESTION("the player's message"),
      intensity: INTENSITY_QUESTION,
    });
  },

  // A sent message: reaction plus how warm or hurtful it was, which drives the needs.
  async '/send'(body, env) {
    const state = readState(body);
    if (!state || !isText(body.text, MAX_TEXT)) return null;
    const message = `Message the player sent to the character (may be Korean): ${JSON.stringify(body.text.trim())}`;
    return askJev(env, `${message}\n${background(state)}`, {
      emotion: EMOTION_QUESTION("the player's message"),
      intensity: INTENSITY_QUESTION,
      warmth: {
        type: 'score',
        instructions: 'How warm, kind, caring or affectionate is the message toward the character?',
        criteria: ['cold or none', 'slightly friendly', 'friendly', 'warm and caring', 'deeply affectionate'],
      },
      hurtful: { type: 'noul', instructions: 'The message insults, mocks, threatens or deliberately hurts the character.' },
    });
  },

  // The player's answer to today's worry, scored by how well it fits.
  async '/answer'(body, env) {
    const state = readState(body);
    if (!state || !isText(body.worry, MAX_LINE_TEXT * 2) || !isText(body.text, MAX_TEXT)) return null;
    const message = [
      `The character shared a worry: ${JSON.stringify(body.worry)}`,
      `The player answered (may be Korean): ${JSON.stringify(body.text.trim())}`,
    ].join('\n');
    return askJev(env, `${message}\n${background(state)}`, {
      emotion: EMOTION_QUESTION("the player's answer to its worry"),
      intensity: INTENSITY_QUESTION,
      help: {
        type: 'score',
        instructions: 'How well does the answer respond to the worry: does it comfort, help, cheer up or fit what the character needed?',
        criteria: ['dismissive or hurtful', 'off the mark', 'okay', 'good and caring', 'exactly what was needed'],
      },
    });
  },

  // Emot speaks first when clicked.
  async '/line'(body, env, allowLlm) {
    const input = readLlmInput(body);
    if (!input) return null;
    if (!(await allowLlm())) return 'limited';
    const line = await askHaiku(env, input.state.personality, [
      input.context,
      '',
      `플레이어가 너를 톡 건드렸다. 이번엔 "${randomTopic()}"에서 출발해 먼저 한마디 해.`,
    ].join('\n'), LineSchema);
    const text = line.text.slice(0, MAX_LINE_TEXT);
    // Jev reads Emot's own line, so her face gets the same probability blend as a reaction to the player.
    // (Claude's self-tagged emotion came back "neutral" for most lines.)
    const reading = await askJev(env, `What the character Emot says right now (Korean): ${JSON.stringify(text)}\n${background(input.state)}`, {
      emotion: {
        ...EMOTION_QUESTION('what it is saying'),
        instructions: 'Which emotion does the character show while saying this line? Judge from the words and tone.',
      },
      intensity: INTENSITY_QUESTION,
    });
    return {
      text,
      memory: line.memory.filter((item) => item.trim()).slice(0, MAX_MEMORY).map((item) => item.slice(0, MAX_MEMORY_TEXT)),
      answers: reading.answers,
    };
  },

  // Today's worry, in Emot's own voice.
  async '/worry'(body, env, allowLlm) {
    const input = readLlmInput(body);
    if (!input) return null;
    if (!(await allowLlm())) return 'limited';
    const worry = await askHaiku(env, input.state.personality, [
      input.context,
      '',
      `오늘의 고민을 플레이어에게 털어놔. "${randomTopic()}"과 관련된, 플레이어가 위로하거나 조언하거나 웃겨 줄 수 있는 고민.`,
      'text에는 고민만 1~2문장으로 쓴다.',
    ].join('\n'), WorrySchema);
    return { text: worry.text.slice(0, MAX_LINE_TEXT) };
  },
};

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

    const route = ROUTES[new URL(request.url).pathname];
    if (!route) return json({ message: 'Not found' }, 404, cors);

    // Origin is spoofable outside browsers, so per-IP limits are the real guard on spend.
    // Claude routes get a second, much tighter limit because the client's energy can be faked.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await env.JEV_LIMITER.limit({ key: ip })).success) return json({ message: 'Too many requests' }, 429, cors);
    const allowLlm = async () => (await env.LLM_LIMITER.limit({ key: ip })).success;

    try {
      const result = await route(await request.json().catch(() => null), env, allowLlm);
      if (result === null) return json({ message: 'Invalid request' }, 400, cors);
      if (result === 'limited') return json({ message: 'Too many requests' }, 429, cors);
      return json(result, 200, cors);
    } catch (error) {
      // Every failure carries CORS headers, or the browser hides the reason behind "Failed to fetch".
      if (error instanceof UpstreamError) return json({ message: error.message }, 502, cors);
      if (error instanceof Anthropic.APIError) return json({ message: `대사 API 오류 ${error.status}` }, 502, cors);
      if (error instanceof Anthropic.AnthropicError) return json({ message: '대사 API 설정 오류 (키 확인)' }, 502, cors);
      console.error(error);
      return json({ message: '서버 오류' }, 500, cors);
    }
  },
};
