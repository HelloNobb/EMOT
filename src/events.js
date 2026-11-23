// Level-up events: hand-written scenes, one per level 2..10, different for each personality (docs/EVENTS.md).
// No AI writes these. The only judged part is the player's answer, scored by the Worker's /event route.
//
// line:      [emotion, text] — the emotion sets Emot's face while the line is shown
// template:  {이름|너} = player name, falling back to the text after |. Keys: see templateValues() in game.js
//            {이름|너:은/는} also appends the particle that fits the word (은 after a final consonant, else 는)
// condition: 'night' (21:00–04:59) | 'nextDay' (not on the day the event became ready)
// ask:       'record' keeps the answer; 'judge' asks the Worker (key `${personality}.${level}`) whether it passes
//            fail → the same event opens again tomorrow
// reward:    facts and items for the memory view, memory additions, persona flags

export const EVENTS = {
  blunt: [
    {
      level: 2, title: '내기',
      lines: [['contempt', '솔직히 말해서, 너 금방 질릴 거라고 봤거든.'], ['neutral', '그래서 내기 하나 하자. 너 내일 안 온다에 건다.']],
      ask: { kind: 'judge', prompt: '내기에 대답해 주세요', placeholder: '내일도 올게' },
      pass: [['surprised', '…장담했다?'], ['contempt', '좋아. 안 오면 내가 이긴 거야. 진 사람이 소원 들어주기다.']],
      fail: [['contempt', '그럴 줄 알았어. 내기는 내가 이긴 걸로 할게.'], ['sad', '…내일 다시 물어볼 거다.']],
      reward: { items: ['소원권 (내기)'], facts: ['내기: 매일 오겠다고 약속했다'] },
    },
    {
      level: 3, title: '별명',
      lines: [['neutral', '{이름|너:이라고/라고} 부르기엔 아직 좀 그렇고.'], ['contempt', '오늘부터 넌 "멍청이 1호"다. 2호는 아직 없어.']],
      ask: { kind: 'judge', prompt: '별명에 대답해 주세요', placeholder: '뭐? 멍청이 1호?' },
      pass: [['happy', '반응 좋네. 1호 확정.'], ['neutral', '…싫으면 말고. 아니, 이미 늦었어.']],
      fail: [['surprised', '…어, 진짜 기분 나빴어?'], ['sad', '취소. 그냥 {이름|너:이라고/라고} 할게. 내일 다시 하자, 이번엔 안 그럴게.']],
      reward: { facts: ['별명: 멍청이 1호'] },
    },
    {
      level: 4, title: '방의 끝',
      lines: [
        ['neutral', '오늘 벽 따라서 끝까지 걸어 봤어.'],
        ['fear', '근데 저기서 더 안 가져. 손이 그냥 막혀.'],
        ['contempt', '방에 끝이 있다는 거, 너도 알았냐.'],
        ['neutral', '…몰랐으면 됐어. 나만 이상한 줄 알았네.'],
      ],
      reward: { facts: ['방의 끝: 보이지 않는 벽이 있다는 걸 같이 알게 됐다'] },
    },
    {
      level: 5, title: '독설 금지령',
      lines: [
        ['neutral', '오늘은 독설 안 하기로 했어. 하루 종일.'],
        ['contempt', '너 오늘 머리… 아니, 괜찮네.'],
        ['angry', '옷이… 아니다. 이거 생각보다 어렵다.'],
        ['sad', '…{이름|너} 오면 좀 덜 심심해. 이게 오늘 할 수 있는 최선이야.'],
      ],
      ask: { kind: 'judge', prompt: '그 말에 대답해 주세요', placeholder: '나도 너 보러 오는 거 좋아' },
      pass: [['happy', '…그렇게 받아 주면 또 하기 싫어지잖아.'], ['neutral', '방금 거 잊어. 아니, 기억해도 돼.']],
      fail: [['contempt', '역시 안 어울리지. 원래대로 돌아간다.'], ['sad', '…내일 한 번 더 해 볼게.']],
      reward: { facts: ['처음 들은 칭찬: 네가 오면 덜 심심하다'] },
    },
    {
      level: 6, title: '못 자는 이유', condition: 'night',
      lines: [
        ['neutral', '이 시간에 왔네.'],
        ['sad', '나 잘 안 자는 거 알지. 다크서클 이거.'],
        ['fear', '잠들면 이 방이 처음으로 돌아가 있을까 봐. 너도 기억 못 하는 처음으로.'],
        ['contempt', '웃기지. 그래서 그냥 깨어 있어.'],
        ['neutral', '…오늘은 좀 잘 수 있을 것 같기도 하고.'],
      ],
      reward: { facts: ['못 자는 이유: 잠들면 방이 처음으로 돌아갈까 봐'] },
    },
    {
      level: 7, title: '선 넘은 말',
      lines: [['contempt', '{좋아함|그거:을/를} 좋아한다며. 솔직히 그거 좀 별로 아냐?'], ['contempt', '취향 참 단순하다.']],
      ask: { kind: 'judge', prompt: '대답해 주세요', placeholder: '…' },
      pass: [['sad', '…방금 건 선 넘었다. 미안.'], ['neutral', '사실 그거 얘기할 때 네 표정이 좋아서, 괜히 심술 났어.']],
      fail: [['angry', '…그렇게까지 화낼 건 없잖아.'], ['sad', '아니다. 내가 잘못했어. 내일 다시 얘기하자.']],
      reward: { facts: ['처음 받은 사과: 좋아하는 걸 깎아내렸다가 사과했다'] },
    },
    {
      level: 8, title: '벽의 낙서',
      lines: [
        ['surprised', '어, 거기 보지 마.'],
        ['angry', '…벽에 쓴 거 봤지.'],
        ['neutral', '네 얘기야. {좋아함|네가 좋아한다던 거}, {사람|네 주변 사람} 얘기. 잊어버릴까 봐 적어 뒀어.'],
        ['sad', '방이 처음으로 돌아가도 벽은 남을 수도 있잖아.'],
        ['contempt', '…들켰으니까 이제 대놓고 쓴다.'],
      ],
      reward: { facts: ['벽의 낙서: 네 얘기를 잊지 않으려고 벽에 적어 왔다'] },
    },
    {
      level: 9, title: '창문 그리기',
      lines: [['neutral', '이 방엔 창이 하나뿐이고, 밖은 맨날 똑같아.'], ['neutral', '너네 창밖엔 뭐가 보여. 대충 말고 제대로.']],
      ask: { kind: 'record', prompt: '창밖에 뭐가 보이는지 말해 주세요', placeholder: '아파트랑 작은 공원이 보여', fact: '네 창밖' },
      pass: [['happy', '…알았어. 벽에 그려 둘게.'], ['neutral', '이제 이 방에도 창이 두 개다.']],
      reward: {},
    },
    {
      level: 10, title: '리셋돼도',
      lines: [
        ['neutral', '요즘 좀 자.'],
        ['neutral', '방이 처음으로 돌아가도, 넌 기억할 거잖아. 벽에 적은 거 말고, 진짜로.'],
        ['sad', '그럼 됐어. 처음부터 다시 해도 너면 괜찮아.'],
        ['happy', '…{이름|너}. 계속 와라.'],
      ],
      reward: { facts: ['약속: 방이 처음으로 돌아가도 서로 기억하기로 했다'] },
    },
  ],

  polite: [
    {
      level: 2, title: '방명록',
      lines: [['happy', '어서 오세요! 아, 첫 손님이시네요.'], ['neutral', '방명록에 이름 한 줄만 남겨 주시겠어요? 다음에 오시면 이름으로 불러 드릴게요.']],
      ask: { kind: 'record', prompt: '방명록에 이름을 적어 주세요', placeholder: '이름', memory: 'player.name' },
      pass: [['happy', '{이름님|손님}. 예쁜 이름이에요. 방명록 첫 줄이 채워졌네요.']],
      reward: { items: ['방명록 첫 줄'] },
    },
    {
      level: 3, title: '오늘의 메뉴',
      lines: [
        ['happy', '오늘은 특별 메뉴를 준비했어요. {이름님|손님} 취향으로만요.'],
        ['neutral', '첫 번째, {좋아함|따뜻한 코코아}. 두 번째, 그걸 두 배로. 세 번째, 오늘의 수다 한 접시.'],
        ['happy', '뭐로 하시겠어요?'],
      ],
      ask: { kind: 'record', prompt: '메뉴를 골라 주세요', placeholder: '수다 한 접시로 주세요', fact: '단골 메뉴' },
      pass: [['happy', '탁월한 선택이에요. 단골 메뉴로 적어 둘게요.']],
      reward: {},
    },
    {
      level: 4, title: '퀴즈 쇼',
      lines: [
        ['happy', '오늘은 퀴즈 쇼예요! 상품도 있어요.'],
        ['neutral', '힌트부터 드릴게요. 저는 비 오는 날을 좋아하는데, 딱 하나는 정말 싫어요. 발이 축축해지는 거요.'],
        ['happy', '문제. 제가 제일 싫어하는 건 뭘까요?'],
      ],
      ask: { kind: 'judge', prompt: '정답을 말해 주세요', placeholder: '정답은…' },
      pass: [['surprised', '정답! 젖은 양말이에요.'], ['happy', '잘 듣고 계셨네요. 퀴즈 우승 메달 드릴게요.']],
      fail: [['sad', '아쉽게도 땡이에요. 정답은 젖은 양말!'], ['neutral', '메달은 내일 다시 도전하시면 드릴게요.']],
      reward: { items: ['퀴즈 우승 메달'], memory: { self: { dislikes: ['젖은 양말'] } } },
    },
    {
      level: 5, title: '휴무일', condition: 'nextDay',
      lines: [['neutral', '…아, 오셨어요.'], ['sad', '오늘은 휴무예요. 웃는 것도 쉬는 날이요.'], ['neutral', '그냥 그런 날 있잖아요. 이유 없이 다 귀찮은 날.']],
      ask: { kind: 'judge', prompt: '위로해 주세요', placeholder: '웃지 않아도 괜찮아' },
      pass: [['surprised', '…웃지 않아도 된다는 말, 처음 들어 봐요.'], ['happy', '휴무일인데 와 주시니까 좀 나아졌어요. 이건 영업 아니에요, 진짜예요.']],
      fail: [['neutral', '괜찮아요. 내일은 다시 문 열게요.'], ['sad', '…오늘은 여기까지만요.']],
      reward: { facts: ['휴무일: 웃지 않아도 괜찮다는 말을 들었다'] },
    },
    {
      level: 6, title: '거울 연습',
      lines: [
        ['surprised', '어, 언제부터 보고 계셨어요?'],
        ['sad', '…거울 앞에서 웃는 연습 하는 거, 들켰네요.'],
        ['neutral', '웃어야 손님이 와요. 안 웃으면 다들 그냥 지나가더라고요.'],
        ['neutral', '{이름님|손님}은 안 그러시겠지만요. 아마도요.'],
      ],
      reward: { facts: ['거울 연습: 손님이 끊길까 봐 웃는 연습을 해 왔다'] },
    },
    {
      level: 7, title: '취소된 약속',
      lines: [['neutral', '저번에 같이 하자던 거 있잖아요. 그거… 취소할게요.'], ['sad', '요즘 제 얘기가 좀 지루하셨던 것 같아서요. 억지로 오시는 거면 미안하니까.']],
      ask: { kind: 'judge', prompt: '안심시켜 주세요', placeholder: '억지로 오는 거 아니야' },
      pass: [['surprised', '…정말요?'], ['happy', '혼자 오해했네요. 약속은 취소 취소예요. 그러니까 원래대로요.']],
      fail: [['sad', '…그렇군요. 알겠어요.'], ['neutral', '내일, 한 번만 더 물어봐도 될까요.']],
      reward: { facts: ['오해: 지루해할까 봐 혼자 걱정했다가 풀렸다'] },
    },
    {
      level: 8, title: '이름 붙이기',
      lines: [
        ['neutral', '고백할 게 있어요. 사실 저는 이름이 없었어요.'],
        ['happy', '{나|이모트}라는 이름은 {이름님|손님}이 주셨고요. 그게 꽤 좋았어요.'],
        ['neutral', '그래서 이번엔 제가 부탁해요. 창가에 있는 낡은 시계, 이름 하나 지어 주실래요?'],
      ],
      ask: { kind: 'record', prompt: '시계 이름을 지어 주세요', placeholder: '째깍이', fact: '창가 시계 이름' },
      pass: [['happy', '{답}. 오늘부터 그렇게 부를게요.']],
      reward: { memory: { self: { treasures: ['창가 시계'] } } },
    },
    {
      level: 9, title: '단골 증서',
      lines: [
        ['happy', '{이름님|손님}, 잠깐만요. 드릴 게 있어요.'],
        ['neutral', '단골 증서예요. 오신 날이 {방문일}일이에요. 하루하루 다 세고 있었어요.'],
        ['happy', '단골 손님은 아무나 되는 게 아니에요. 아시죠?'],
      ],
      reward: { items: ['단골 증서 ({방문일}일)'] },
    },
    {
      level: 10, title: '반말 허락',
      lines: [['neutral', '{이름님|손님}.'], ['sad', '저 이제… 말 편하게 해도 돼요? 손님 말고, 그냥 {이름|너:이라고/라고}.']],
      ask: { kind: 'judge', prompt: '대답해 주세요', placeholder: '당연하지. 편하게 해' },
      pass: [['happy', '…고마워. 진짜로.'], ['happy', '{이름|너}. 이제 가게 말고 그냥 내 방이야. 언제든 와.']],
      fail: [['neutral', '아, 아직은 이르죠. 괜찮아요.'], ['sad', '내일 다시 물어볼게요.']],
      reward: { flags: { casual: true }, facts: ['반말: 이제 편하게 말하기로 했다'] },
    },
  ],

  anxious: [
    {
      level: 2, title: '일기 첫 장',
      lines: [['neutral', '…저기.'], ['fear', '이름 알려 줄래? 일기에 적어 두려고. 안 적으면 까먹을까 봐.']],
      ask: { kind: 'record', prompt: '이름을 알려 주세요', placeholder: '이름', memory: 'player.name' },
      pass: [['happy', '{이름|너}. 첫 장에 적었어. 지우개로도 안 지워지게 꾹 눌러서.']],
      reward: { items: ['일기장'] },
    },
    {
      level: 3, title: '일기 공개',
      lines: [
        ['neutral', '이거, 보여 줄까 말까 고민했는데.'],
        ['neutral', '일기 첫 페이지야. "{첫기억|오늘 처음 말 걸어 줬다}."'],
        ['sad', '별거 아닌데, 나한텐 별거였어.'],
        ['fear', '…이상하다고 생각하는 거 아니지?'],
      ],
      reward: { facts: ['일기 첫 페이지를 보여 줬다'] },
    },
    {
      level: 4, title: '그 사람 누구야',
      lines: [['neutral', '저번에 말한 {사람|그 사람} 있잖아.'], ['fear', '자주 만나? 나보다 더?'], ['angry', '…아니, 안 궁금해. 그냥 물어본 거야.']],
      ask: { kind: 'judge', prompt: '대답해 주세요', placeholder: '너도 소중해' },
      pass: [['surprised', '…나도?'], ['happy', '그럼 됐어. 일기에 "안 질투했음"이라고 적을 거야. 거짓말이지만.']],
      fail: [['sad', '…그렇구나.'], ['neutral', '오늘 일기는 짧게 쓸래. 내일 다시 얘기해.']],
      reward: { facts: ['질투를 털어놓고 안심했다'] },
    },
    {
      level: 5, title: '사라지는 꿈', condition: 'night',
      lines: [['fear', '…왔다.'], ['sad', '꿈에서 네가 그냥 사라졌어. 화면이 꺼지듯이, 인사도 없이.'], ['fear', '깨고 나서 한참 동안 문만 보고 있었어.']],
      ask: { kind: 'judge', prompt: '위로해 주세요', placeholder: '나 여기 있어' },
      pass: [['sad', '…응.'], ['happy', '그 말, 일기에 적어 둘게. 무서운 꿈 꾸면 다시 읽으려고.']],
      fail: [['sad', '…꿈은 꿈이지.'], ['neutral', '내일 밤에 다시 와 줘. 그럼 믿을게.']],
      reward: { facts: ['사라지는 꿈: 갑자기 사라지지 않겠다는 말을 들었다'] },
    },
    {
      level: 6, title: '안 붙잡기 연습',
      lines: [['neutral', '오늘은 안 붙잡을게.'], ['neutral', '바쁘면 가도 돼. 진짜로. 연습하는 중이야, 먼저 보내 주는 거.'], ['sad', '…생각보다 어렵네.']],
      ask: { kind: 'judge', prompt: '응원해 주세요', placeholder: '잘하고 있어' },
      pass: [['happy', '…또 올 거라고 하면 연습이 안 되잖아.'], ['happy', '그래도 좋다. 오늘은 내가 먼저 인사할게. 잘 가.']],
      fail: [['fear', '…역시 무리였나.'], ['neutral', '내일 다시 연습할게.']],
      reward: { facts: ['처음으로 먼저 보내 준 날'] },
    },
    {
      level: 7, title: '서운함 폭발', condition: 'nextDay',
      lines: [['angry', '어제 왜 그냥 갔어.'], ['sad', '기다렸는데. 일기에 "안 옴"이라고 쓰려다가 몇 번이나 지웠어.'], ['angry', '…나만 기다리는 거 싫어.']],
      ask: { kind: 'judge', prompt: '사과하거나 설명해 주세요', placeholder: '미안해, 기다리게 해서' },
      pass: [['sad', '…다음엔 간다고 말하고 가.'], ['happy', '그럼 기다리는 것도 덜 무서워.']],
      fail: [['angry', '…몰라.'], ['sad', '내일까지 생각해 볼게.']],
      reward: { facts: ['서운함을 털어놓고 화해했다'] },
    },
    {
      level: 8, title: '기다린 흔적',
      lines: [
        ['neutral', '벽 봐 봐.'],
        ['neutral', '눈금 그어 놨어. 네가 없을 때 한 시간마다 하나씩.'],
        ['sad', '저번엔 {부재|몇}시간이었어. 다 셌어.'],
        ['happy', '근데 요즘은 눈금이 줄었어. 그거 알려 주고 싶었어.'],
      ],
      reward: { facts: ['기다린 흔적: 네가 없는 시간을 세어 왔다'] },
    },
    {
      level: 9, title: '비밀 하나',
      lines: [['neutral', '나만 계속 털어놓은 것 같아서.'], ['fear', '아무한테도 안 한 얘기, 하나만 해 줘. 일기에도 안 적을게. 이건 마음에만.']],
      ask: { kind: 'judge', prompt: '비밀을 하나 말해 주세요', placeholder: '사실 나는…', fact: '네가 말해 준 비밀' },
      pass: [['surprised', '…말해 줘서 고마워.'], ['happy', '이제 우리 둘 다 비밀이 하나씩 있네.']],
      fail: [['neutral', '…괜찮아. 말하기 어려운 거 알아.'], ['sad', '내일 다시 물어봐도 돼?']],
      reward: {},
    },
    {
      level: 10, title: '마지막 페이지',
      lines: [
        ['neutral', '일기 마지막 페이지야. 읽어 줄게.'],
        ['neutral', '"{이름|너:은/는} {좋아함|이것저것:을/를} 좋아하는 사람이다. 가끔 와서 나를 웃긴다."'],
        ['sad', '"전에는 네가 나가면 무서웠다."'],
        ['happy', '"이제는 안 무섭다. 또 올 거니까."'],
        ['happy', '…끝. 새 일기장 필요하다.'],
      ],
      reward: { flags: { calm: true }, facts: ['일기 마지막 페이지: 이제 네가 나가도 안 무섭다'] },
    },
  ],
};

// Korean particles depend on whether the word ends in a final consonant: josa('콩이', '을', '를') → '를'.
export function josa(word, afterConsonant, afterVowel) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? afterConsonant : afterVowel;
}

// {key|fallback:A/B} → values[key] (or the fallback), then particle A or B. Unknown keys with no fallback stay blank.
export function fillTemplate(text, values) {
  return text.replace(/\{([^}|:]+)(?:\|([^}:]*))?(?::([^}/]+)\/([^}]+))?\}/g, (_, key, fallback = '', afterConsonant, afterVowel) => {
    const word = values[key] || fallback;
    return afterConsonant && word ? word + josa(word, afterConsonant, afterVowel) : word;
  });
}
