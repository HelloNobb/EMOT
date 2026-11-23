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
const MAX_NAME = 12;
const MAX_FACT = 40; // one remembered keyword or short phrase
const MAX_EPISODE = 80;
const MAX_EPISODES = 12;
// Key-value memory. Keys and caps must match MEMORY_LIMITS in src/config.js.
const PLAYER_KEYS = ['likes', 'dislikes', 'people', 'plans'];
const SELF_KEYS = ['likes', 'dislikes', 'treasures'];
const MAX_PER_KEY = 6;
const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fear', 'disgust', 'contempt'];
const EMOTION_WORDS = {
  neutral: '담담함', happy: '기쁨', sad: '슬픔', angry: '화남', surprised: '놀람', fear: '두려움', disgust: '거부감', contempt: '경멸',
};
const INTENSITY_WORDS = ['아주 약하게', '약하게', '분명하게', '강하게', '압도적으로'];
const MAX_STORY = 30; // shared moments from level-up events
const MAX_STORY_TEXT = 80;
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
  '너는 이모트(Emot)라는 존재이고, 이름은 "{name}"이다(플레이어가 지어 줬다). 헝클어진 짧은 머리, 큰 검은 티셔츠, 다크서클이 있는 졸린 눈의 아이.',
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
  '- 기억하는 내용은 자연스러울 때만 꺼낸다. 매번 꺼내지 않는다.',
  '- memory에는 이번 대화에서 새로 알게 된 것만 적는다. 이미 기억에 있는 건 다시 쓰지 않고, 없으면 빈 값으로 둔다.',
  '  playerName·playerLikes·playerDislikes·playerPeople·playerPlans: 플레이어가 자기 입으로 말한 사실만. 짐작 금지. 각 15자 이내 핵심어.',
  '  selfLikes·selfDislikes·selfTreasures: 이번 대사에서 네가 너 자신에 대해 말한 것. 다음에 말이 앞뒤가 맞게 하려는 기록. 각 15자 이내.',
  '  episodeSummary: 이번 대화가 기억할 만하면(속마음, 중요한 일, 감정이 큰 일) 25자 이내 요약, 아니면 빈 문자열. episodeWeight는 1~3(클수록 중요).',
].join('\n');

// Flat on purpose: the model fills plain fields more reliably than nested objects.
const LineSchema = z.object({
  text: z.string(),
  memory: z.object({
    playerName: z.string(),
    playerLikes: z.array(z.string()),
    playerDislikes: z.array(z.string()),
    playerPeople: z.array(z.string()),
    playerPlans: z.array(z.string()),
    selfLikes: z.array(z.string()),
    selfDislikes: z.array(z.string()),
    selfTreasures: z.array(z.string()),
    episodeSummary: z.string(),
    episodeWeight: z.number(),
  }),
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

// The character's true, inner reaction to the player's words: who it is and how close they are decide it,
// not the words alone. (Claude then voices this feeling in the personality's own way; see /reply.)
// Bands: stranger = Lv1-3, friend = Lv4-6, close = Lv7-10.
const INNER_REACTIONS = {
  blunt: [
    'Barely knows the player. Sudden affection or sweet talk feels creepy or cringe to it (disgust or contempt). '
      + 'Dry humour and plain honesty mildly please it. Insults make it angry or contemptuous.',
    'Getting used to the player. Affection secretly pleases it but flusters it (happy with some surprise); '
      + 'over-the-top sweetness is still cringe. Being teased back amuses it.',
    'Close to the player. Affection makes it truly happy even though it hides it. '
      + 'An insult from the player hurts (sad) more than it angers.',
  ],
  polite: [
    'New to the player. Kind words delight it sincerely (happy). A sudden love confession surprises it (surprised and happy). '
      + 'Rudeness hurts it quietly (sad) rather than angering it.',
    'Friends with the player. Affection openly pleases it; teasing makes it laugh (happy); harsh words hurt (sad).',
    'Close to the player. Affection moves it deeply (strongly happy). Being insulted feels like betrayal (sad, some anger).',
  ],
  anxious: [
    'Barely knows the player. Affection makes it doubtful and uneasy (fear mixed with surprise): it fears being tricked. '
      + 'Talk of leaving or of other people frightens it. Coldness makes it sad.',
    'Getting attached. Affection makes it happy but insecure (happy mixed with fear). Talk of other people makes it jealous (angry or sad).',
    'Close to the player. Affection makes it truly happy and calm. Talk of leaving still stings (sad or fear).',
  ],
};
const levelBand = (level) => (level <= 3 ? 0 : level <= 6 ? 1 : 2);

function innerQuestion(state, subject) {
  return {
    ...EMOTION_QUESTION(subject),
    instructions:
      `How does this character truly feel inside about ${subject}? Decide from the character's personality and how close it is to the player, `
      + `not from the words alone: ${INNER_REACTIONS[state.personality][levelBand(state.level)]} `
      + 'Hunger or tiredness only nudge the reaction slightly. A short or unfinished message stays mostly neutral.',
  };
}

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

const isFactList = (list) => Array.isArray(list) && list.length <= MAX_PER_KEY && list.every((item) => isText(item, MAX_FACT));

function readMemory(memory) {
  const { player, self, episodes } = memory ?? {};
  if (!player || !self || !Array.isArray(episodes) || episodes.length > MAX_EPISODES) return null;
  if (typeof player.name !== 'string' || player.name.length > MAX_NAME) return null;
  if (!PLAYER_KEYS.every((key) => isFactList(player[key])) || !SELF_KEYS.every((key) => isFactList(self[key]))) return null;
  const validEpisodes = episodes.every((episode) => isText(episode?.summary, MAX_EPISODE)
    && typeof episode.day === 'string' && episode.day.length <= 10
    && EMOTIONS.includes(episode.feeling) && [1, 2, 3].includes(episode.weight));
  return validEpisodes ? memory : null;
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

async function askHaiku(env, personality, name, userContent) {
  if (!env.ANTHROPIC_API_KEY) throw new UpstreamError('대사 API 키 미등록 (ANTHROPIC_API_KEY)');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.parse({
    model: LINE_MODEL,
    max_tokens: 2048,
    system: LINE_RULES.replace('{personality}', PERSONALITIES[personality].prompt).replace('{name}', name),
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

const PLAYER_LABELS = { likes: '좋아함', dislikes: '싫어함', people: '주변 사람', plans: '일정' };
const SELF_LABELS = { likes: '좋아함', dislikes: '싫어함', treasures: '아끼는 것' };

function describeFacts(facts, labels) {
  const parts = Object.entries(labels).filter(([key]) => facts[key].length).map(([key, label]) => `${label}: ${facts[key].join(', ')}`);
  return parts.length ? parts.join(' / ') : '(없음)';
}

function describeMemory({ player, self, episodes }) {
  const name = player.name ? `이름: ${player.name} / ` : '';
  const talks = episodes.length ? episodes.map((episode) => `(${episode.day}) ${episode.summary}`).join('\n') : '(없음)';
  return [
    `플레이어에 대해 아는 것: ${name}${describeFacts(player, PLAYER_LABELS)}`,
    `네가 너 자신에 대해 말했던 것: ${describeFacts(self, SELF_LABELS)}`,
    `기억하는 대화:\n${talks}`,
  ].join('\n');
}

function describeContext(state, hour, memory, history) {
  const tone = LEVEL_ATTITUDE[state.level - 1];
  const talk = history.length
    ? history.map((item) => `${item.who === 'player' ? '플레이어' : '이모트'}: ${item.text}`).join('\n')
    : '(아직 없음)';
  return [
    `호감도 레벨 ${state.level}/10: ${tone}`,
    `사회적 접촉 ${state.social}/100, 정서적 교감 ${state.bond}/100. 지금은 ${timeOfDay(hour)}쯤(시간은 꼭 필요할 때만 언급).`,
    describeMemory(memory),
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
// What the player and Emot went through in level-up events, and how it changed her.
function readStory(story) {
  const { facts, flags } = story ?? {};
  if (!Array.isArray(facts) || facts.length > MAX_STORY || !facts.every((fact) => isText(fact, MAX_STORY_TEXT))) return null;
  if (!flags || typeof flags !== 'object') return null;
  return { facts, casual: flags.casual === true, calm: flags.calm === true };
}

function describeStory(story) {
  const lines = [`함께 겪은 일: ${story.facts.length ? story.facts.join(' / ') : '(아직 없음)'}`];
  if (story.casual) lines.push('이제 플레이어에게 반말을 쓴다(허락받았다). 존댓말 규칙보다 이게 우선이다.');
  if (story.calm) lines.push('불안이 많이 줄었다. 집착보다 믿음으로 말한다.');
  return lines.join('\n');
}

function readLlmInput(body) {
  const state = readState(body);
  const story = readStory(body?.story);
  const memory = readMemory(body?.memory);
  const history = readHistory(body?.history);
  if (!state || !memory || !history || !story || !isHour(body.hour) || !isText(body.name, MAX_NAME)) return null;
  const context = `${describeContext(state, body.hour, memory, history)}\n${describeStory(story)}`;
  return { state, name: body.name.trim(), context };
}

// ---- level-up events: the scenes are written in src/events.js, only the player's answer is judged here ----

const noul = (instructions) => ({ question: { type: 'noul', instructions }, passes: (answer) => answer.noul >= 0.5 });
const score = (instructions, criteria) => ({
  question: { type: 'score', instructions, criteria },
  passes: (answer) => answer.score >= 2,
});
const CARE = ['dismissive or cold', 'barely', 'somewhat', 'clearly and kindly', 'deeply and sincerely'];

// Key: `${personality}.${level}`. Each describes what a passing answer looks like for that scene.
const EVENT_JUDGES = {
  'blunt.2': noul('The player promises, or clearly agrees, to come back tomorrow or keep visiting.'),
  'blunt.3': noul('The player takes the rude nickname playfully or jokes back, rather than being genuinely hurt.'),
  'blunt.5': score('How warmly does the player receive the character\'s awkward compliment?', CARE),
  'blunt.7': noul('The player stays calm or answers maturely instead of getting angry back at the insult.'),
  'polite.4': noul('The player\'s answer is wet socks (socks getting wet on a rainy day).'),
  'polite.5': score('How well does the player comfort the character and accept that it does not want to smile today?', CARE),
  'polite.7': score('How well does the player reassure the character that they are not bored and come willingly?', CARE),
  'polite.10': noul('The player agrees to let the character drop formal speech and talk casually.'),
  'anxious.4': score('How well does the player reassure the jealous character that it matters to them too?', CARE),
  'anxious.5': score('How well does the player comfort the character after its nightmare that the player vanished?', CARE),
  'anxious.6': score('How warmly does the player encourage the character as it practices letting the player go?', CARE),
  'anxious.7': score('How sincerely does the player apologize or explain for leaving without a word?', CARE),
  'anxious.9': score('How sincerely and personally does the player open up and share something private?', CARE),
};

// ---- routes ----

const ROUTES = {
  // Live reaction while the player is typing.
  async '/judge'(body, env) {
    const state = readState(body);
    if (!state || !isText(body.text, MAX_TEXT)) return null;
    const message = `Message the player is typing to the character (may be Korean, may be unfinished): ${JSON.stringify(body.text.trim())}`;
    return askJev(env, `${message}\n${background(state)}`, {
      emotion: innerQuestion(state, "the player's message"),
      intensity: INTENSITY_QUESTION,
    });
  },

  // A sent message: reaction plus how warm or hurtful it was, which drives the needs.
  async '/send'(body, env) {
    const state = readState(body);
    if (!state || !isText(body.text, MAX_TEXT)) return null;
    const message = `Message the player sent to the character (may be Korean): ${JSON.stringify(body.text.trim())}`;
    return askJev(env, `${message}\n${background(state)}`, {
      emotion: innerQuestion(state, "the player's message"),
      intensity: INTENSITY_QUESTION,
      warmth: {
        type: 'score',
        instructions: 'How warm, kind, caring or affectionate is the message toward the character?',
        criteria: ['cold or none', 'slightly friendly', 'friendly', 'warm and caring', 'deeply affectionate'],
      },
      hurtful: { type: 'noul', instructions: 'The message insults, mocks, threatens or deliberately hurts the character.' },
    });
  },

  // A level-up event asked the player something; did the answer pass?
  async '/event'(body, env) {
    const state = readState(body);
    const judge = EVENT_JUDGES[`${body?.personality}.${body?.eventLevel}`];
    if (!state || !judge || !isText(body.text, MAX_TEXT) || !isText(body.scene, MAX_EPISODE * 4)) return null;
    const situation = `The character just said (Korean): ${JSON.stringify(body.scene)}\nThe player answered (may be Korean): ${JSON.stringify(body.text.trim())}`;
    const data = await askJev(env, `${situation}\n${background(state)}`, { answer: judge.question });
    return { passed: judge.passes(data.answers.answer), answer: data.answers.answer };
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
  // feeling: Jev's reading of how Emot felt hearing the message (from /send). The answer must carry that
  // same emotion, so the face, the readout and the words agree instead of Claude picking its own mood.
  async '/reply'(body, env, allowLlm) {
    const input = readLlmInput(body);
    const feeling = readFeeling(body?.feeling);
    if (!input || !isText(body.text, MAX_TEXT) || feeling === undefined) return null;
    if (!(await allowLlm())) return 'limited';
    const prompt = [
      input.context,
      '',
      `플레이어가 방금 이렇게 말했다: ${JSON.stringify(body.text.trim())}`,
      '이 말에 대답한다. 질문이면 답하고, 대화 흐름을 자연스럽게 이어 간다.',
    ];
    if (feeling) {
      prompt.push(
        `이 말을 듣고 너의 본심은 ${EMOTION_WORDS[feeling.emotion]}이고, ${INTENSITY_WORDS[feeling.intensity]} 느낀다.`,
        '본심은 바꾸지 않는다. 겉으로는 성격대로 표현한다(독설가는 티 안 내려 하고, 불안한 아이는 확인하려 들고, 유쾌한 아이는 솔직하게). 그래도 듣는 사람이 본심을 짐작할 수 있게 쓴다.',
      );
    }
    return speak(env, input, prompt, feeling);
  },
};

const cleanFacts = (list) => list.map((item) => item.trim().slice(0, MAX_FACT)).filter(Boolean).slice(0, MAX_PER_KEY);

// undefined = invalid, null = not given, otherwise { emotion, intensity 0..4 }.
function readFeeling(feeling) {
  if (feeling == null) return null;
  if (!EMOTIONS.includes(feeling.emotion) || ![0, 1, 2, 3, 4].includes(feeling.intensity)) return undefined;
  return feeling;
}

// feeling given: the emotion is already decided, so the line isn't re-read (re-reading a blunt, shy
// answer as "angry" was what made the face flip). Without it, Jev reads the line as before.
async function speak(env, input, prompt, feeling = null) {
  const line = await askHaiku(env, input.state.personality, input.name, prompt.join('\n'));
  const text = line.text.slice(0, MAX_LINE_TEXT);
  const answers = feeling ? null : await readOwnWords(env, input.state, text);
  const found = line.memory;
  const summary = found.episodeSummary.trim().slice(0, MAX_EPISODE);
  return {
    text,
    answers,
    // Only what is new this turn; the client merges it and enforces the caps.
    memory: {
      player: {
        name: found.playerName.trim().slice(0, MAX_NAME),
        likes: cleanFacts(found.playerLikes),
        dislikes: cleanFacts(found.playerDislikes),
        people: cleanFacts(found.playerPeople),
        plans: cleanFacts(found.playerPlans),
      },
      self: { likes: cleanFacts(found.selfLikes), dislikes: cleanFacts(found.selfDislikes), treasures: cleanFacts(found.selfTreasures) },
      episode: summary
        ? {
          summary,
          weight: Math.max(1, Math.min(3, Math.round(found.episodeWeight))),
          feeling: feeling?.emotion ?? answers?.emotion?.choice ?? 'neutral',
        }
        : null,
    },
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
