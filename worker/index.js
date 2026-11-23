// Proxy between the GitHub Pages client and the two paid APIs.
// It hides both keys and owns every prompt/question, so the endpoints only serve Emot.
// Jev (TypeSafe) judges the player's words; Claude Haiku writes what Emot says.
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
      '- 반말. 생각한 걸 돌려 말하지 않고, 짧고 건조하게 핵심만 찌른다. 비꼼은 날카로운 관찰과 유머에서 나온다.',
      '- 말투는 또래보다 어른스럽고 냉소적이다. 상대를 깎아내리기보다 정곡을 찌르는 쪽.',
      '- 걱정이나 호감은 직접 말하지 않고 핀잔이나 무심한 척으로 드러난다. 욕설은 쓰지 않는다.',
      '- 친해질수록: 독설은 그대로지만 걱정과 관심이 섞이고, 가끔 진심이 새어 나온다.',
    ].join('\n'),
  },
  polite: {
    jev: 'polite, cheerful and witty; calm humour and an odd point of view',
    prompt: [
      '성격: 예의 바르고 유쾌함.',
      '- 존댓말(해요체). 밝고 재치 있다. 말장난은 가끔만, 억지스럽지 않게.',
      '- 상대 말을 잘 듣고 구체적으로 반응한다. 칭찬은 진심이고 구체적이다.',
      '- 들떠서 유치해지지 않는다. 차분한 유머와 엉뚱한 관점이 매력.',
      '- 친해질수록: 존댓말은 유지하되 장난이 늘고, 자기 얘기와 속마음을 더 털어놓는다.',
    ].join('\n'),
  },
  anxious: {
    jev: 'jealous and anxious; fears being left and watches the player closely',
    prompt: [
      '성격: 질투심 많고 불안이 많음.',
      '- 반말. 조심스럽고 생각이 많다. 상대 반응을 살피며 말한다.',
      '- 플레이어가 떠날까 봐 불안하고, 다른 사람이나 다른 일 얘기가 나오면 티 나게 신경 쓴다.',
      '- 불안은 울먹임 대신 현실적인 걱정, 자기 의심, 확인하고 싶은 마음으로 드러난다.',
      '- 친해질수록: 집착이 애정 표현으로 바뀌고, 불안을 숨기지 않고 솔직하게 말한다.',
    ].join('\n'),
  },
};

// One step of attitude per affinity level, so every heart earned changes how Emot talks.
const LEVEL_ATTITUDE = [
  '처음 보는 사이. 경계한다. 말이 짧고 자기 얘기는 거의 안 한다.',
  '아직 어색하다. 대답은 하지만 거리를 두고 관심 없는 척한다.',
  '조금 익숙해졌다. 가끔 질문을 던지지만 금방 화제를 돌린다.',
  '편해지기 시작했다. 농담이 섞이고, 플레이어가 한 말을 기억해 둔다.',
  '친구 사이. 사소한 일상을 먼저 꺼낸다.',
  '플레이어가 오면 반갑다(성격대로 표현). 핵심 기억을 자연스럽게 꺼낸다.',
  '꽤 가깝다. 플레이어를 챙기고, 약한 모습을 조금 보인다.',
  '믿는 사이. 속마음을 털어놓고, 플레이어 기분 변화를 알아챈다.',
  '아주 가깝다. 장난이 편하고, 같이 있는 게 당연하게 느껴진다.',
  '가장 소중한 사람. 자기 성격다운 방식으로 애정을 분명히 드러낸다.',
];

// A random seed per call is what keeps lines varied; the model alone tends to repeat itself.
const TOPICS = [
  '어젯밤 꾼 이상한 꿈', '창밖 날씨', '갑자기 먹고 싶어진 음식', '요즘 자주 하는 생각', '지루함',
  '아무 의미 없는 혼잣말', '사소한 불만', '요즘 좋아하는 것', '진짜 싫어하는 것', '어릴 때 기억(지어내도 됨)',
  '플레이어 외모나 말투에 대한 한마디', '핵심 기억 중 하나', '지금 시간대에 어울리는 말', '엉뚱한 상상',
  '갑자기 든 철학적인 생각', '흥얼거리던 노래', '졸림', '동물 이야기', '털어놓는 작은 비밀', '내일 하고 싶은 것',
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
  '- 호감도 단계의 태도를 지킨다. 낮은 단계에서 갑자기 다정해지지 않는다.',
  '- 말버릇이나 감탄사(흥, 뭐야, 헤헤, 음, 아 등)로 문장을 시작하지 않는다. 최근 대화와 같은 단어로 시작하지 않는다.',
  '- 유치한 말투, 과한 의성어, 뻔한 감상은 피한다. 구체적인 사물·상황·생각 하나를 짚어서 말한다.',
  '- 최근 대화에 나온 문장이나 표현을 되풀이하지 않는다.',
  '- 사회적 접촉이 낮으면 외로움을, 정서적 교감이 낮으면 서운함을 성격답게 드러낸다.',
  '- memory는 플레이어에 대한 핵심 기억 목록(이름, 좋아하는 것, 중요한 일). 기존 목록을 유지하되 최근 대화에서 플레이어가',
  '  직접 말한 새 사실만 추가하고, 최대 8개, 각 30자 이내. 새 사실이 없으면 기존 목록을 그대로 돌려준다.',
].join('\n');

const LineSchema = z.object({
  text: z.string(),
  memory: z.array(z.string()),
});

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

async function askHaiku(env, personality, userContent) {
  if (!env.ANTHROPIC_API_KEY) throw new UpstreamError('대사 API 키 미등록 (ANTHROPIC_API_KEY)');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.parse({
    model: LINE_MODEL,
    max_tokens: 2048,
    system: LINE_RULES.replace('{personality}', PERSONALITIES[personality].prompt),
    messages: [{ role: 'user', content: userContent }],
    output_config: { effort: 'medium', format: zodOutputFormat(LineSchema) }, // low effort gave flat, repetitive lines
  });
  if (response.stop_reason === 'refusal') throw new UpstreamError('대사 생성이 거절됨');
  if (!response.parsed_output) throw new UpstreamError(`대사 형식 오류 (${response.stop_reason})`);
  return response.parsed_output;
}

// "밤 9시" instead of "21시": the raw number leaked into lines and sounded mechanical.
function timeOfDay(hour) {
  const part = hour < 6 ? '새벽' : hour < 11 ? '아침' : hour < 17 ? '낮' : hour < 21 ? '저녁' : '밤';
  return `${part} ${hour % 12 || 12}시`;
}

function describeContext(state, hour, memory, history) {
  const tone = LEVEL_ATTITUDE[state.level - 1];
  const talk = history.length
    ? history.map((item) => `${item.who === 'player' ? '플레이어' : '이모트'}: ${item.text}`).join('\n')
    : '(아직 없음)';
  return [
    `호감도 레벨 ${state.level}/10: ${tone}`,
    `사회적 접촉 ${state.social}/100, 정서적 교감 ${state.bond}/100. 지금은 ${timeOfDay(hour)}쯤(시간은 꼭 필요할 때만 언급).`,
    `핵심 기억: ${memory.length ? memory.join(' / ') : '(없음)'}`,
    `최근 대화:\n${talk}`,
  ].join('\n');
}

// Jev reads Emot's own words, so her face gets the same probability blend as a reaction to the player.
// (Claude's self-tagged emotion came back "neutral" for most lines.)
async function readOwnWords(env, state, text) {
  const reading = await askJev(env, `What the character Emot says right now (Korean): ${JSON.stringify(text)}\n${background(state)}`, {
    emotion: {
      ...EMOTION_QUESTION('what it is saying'),
      instructions: 'Which emotion does the character show while saying this? Judge from the words and tone.',
    },
    intensity: INTENSITY_QUESTION,
  });
  return reading.answers;
}

const randomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)];

// Shared by /line and /reply: both are Claude calls built from the same context.
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

  // Touching Emot: she opens a new topic of her own.
  async '/line'(body, env, allowLlm) {
    const input = readLlmInput(body);
    if (!input) return null;
    if (!(await allowLlm())) return 'limited';
    return speak(env, input, [
      input.context,
      '',
      `플레이어가 너를 톡 건드렸다. 최근 대화와는 다른 새 화제로 혼자 일상 얘기를 꺼낸다. 이번 화제: "${randomTopic()}".`,
      // Questions here leave the player answering into a line that never continues; replies are for that.
      '플레이어에게 질문하지 않는다. 물음표로 끝내지 말고, 혼잣말이나 자기 얘기로 끝낸다.',
    ]);
  },

  // Emot answers the message the player just sent (also the last item in history).
  async '/reply'(body, env, allowLlm) {
    const input = readLlmInput(body);
    if (!input || !isText(body.text, MAX_TEXT)) return null;
    if (!(await allowLlm())) return 'limited';
    return speak(env, input, [
      input.context,
      '',
      `플레이어가 방금 이렇게 말했다: ${JSON.stringify(body.text.trim())}`,
      '이 말에 대답한다. 질문이면 답하고, 대화 흐름을 자연스럽게 이어 간다.',
    ]);
  },
};

async function speak(env, input, prompt) {
  const line = await askHaiku(env, input.state.personality, prompt.join('\n'));
  const text = line.text.slice(0, MAX_LINE_TEXT);
  return {
    text,
    memory: line.memory.filter((item) => item.trim()).slice(0, MAX_MEMORY).map((item) => item.slice(0, MAX_MEMORY_TEXT)),
    answers: await readOwnWords(env, input.state, text),
  };
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
