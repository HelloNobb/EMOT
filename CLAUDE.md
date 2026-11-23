# EMOT — Claude용 프로젝트 규칙

전역 규칙(`~/.claude/CLAUDE.md`)을 따른다. 아래는 웹(Canvas 2D) 프로젝트라서 바뀌는 부분과 이 프로젝트의 구조다.

## 스택
- 클라이언트: 순수 ES 모듈 + Canvas 2D. 빌드 도구·외부 라이브러리 없음. GitHub Pages(저장소 루트)에 그대로 배포
- 프록시: Cloudflare Worker(`worker/`). 의존성 `@anthropic-ai/sdk`, `zod`(버전 고정, wrangler가 번들)
- 감정 판단: TypeSafe API `POST https://api.typesafe.ai/v1/systemone`, 모델 `jev-latest`
- 대사·대답 생성: Claude Haiku 5.5 `claude-haiku-5-5` (SDK `messages.parse` + `zodOutputFormat`)

## 역할 분담 (웹 버전)
| 항목 | 담당 |
|---|---|
| `.js` 작성 (`src/`, `worker/`, `tests/`) | Claude |
| 캐릭터 그림(`assets/`), `config.js` 수치 밸런스, 얼굴 좌표 미세 조정 | 개발자 |
| Worker 배포·시크릿 등록(`TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`), GitHub Pages 설정 | 개발자 (요청 시 Claude가 배포 명령 실행) |
- UI 구조는 `index.html`에만. JS는 DOM을 만들지 않고 값만 채운다
- 그림 좌표는 `config.js`의 `CHARACTER` 한 곳, 수치는 `config.js` 한 곳에만 둔다

## 구조
| 파일 | 책임 |
|---|---|
| `src/main.js` | 프레임 루프, 모듈 연결, 터치(대사)·전송(판정+대답)·재배정 흐름, 반응 유지 시간 |
| `src/config.js` | 튜닝 수치 전부 (욕구·에너지·레벨·보상, 얼굴 파라미터 프리셋, 그림 좌표) |
| `src/character.js` | Canvas 2D: 기본 그림(곱하기 합성) + 숨쉬기 + 코드로 그린 눈·눈썹·입·만화 기호 |
| `src/face.js` | 얼굴 파라미터: 휴식 얼굴(레벨·성격) + 감정 오프셋 × 확률, 보간, 깜빡임, 시선 |
| `src/game.js` | 저장되는 상태 전부: 이름, 성격, 욕구, 호감도(관문), 에너지, 최근 대화, 키-값 기억, 이벤트 진행·함께 겪은 일·받은 것, 방문 기록. 시간 경과는 타임스탬프로 계산 |
| `src/events.js` | 레벨업 이벤트 대본(성격 × 레벨 2~10, 사람이 씀)과 템플릿 채우기·조사 처리 |
| `src/emotion.js` | 입력 중 실시간 판정(스로틀, 오래된 응답 폐기), Jev 응답 파싱 |
| `src/api.js` | Worker POST 한 곳 |
| `src/ui.js` | DOM 갱신만 (상태, 감정 수치, 말풍선 타이핑, 토스트, 기억·재배정 다이얼로그). 목록은 index.html의 고정 슬롯을 채움 |
| `worker/index.js` | `/judge` `/send` `/event`(Jev), `/line` `/reply`(Haiku + Jev로 대사 감정). 검증·레이트리밋, 페르소나·레벨 태도·질문(이벤트 판정 포함) 소유 |
| `tests/check.mjs` | `node tests/check.mjs`: 파싱·게임 상태·얼굴·스로틀 점검 |

## 규칙
- 프롬프트와 Jev 질문은 Worker만 가진다. 클라이언트는 텍스트와 상태 숫자만 보낸다
- 키는 Worker 시크릿에만. 에너지는 클라이언트 값이라 믿지 않는다 → LLM 경로는 Worker에서 IP당 제한
- Worker의 모든 응답(오류 포함)은 CORS 헤더를 단다. 아니면 브라우저가 이유를 숨긴다
- 얼굴은 그림 좌표계에서 그린다. 그리는 순서: 그림 → 우울선 → 눈(종이색으로 원본 감은 눈 덮기 → 뜬 눈) → 눈썹 → 입 → 기호
- 새 감정 표현은 `config.js`의 `EMOTION_FACE` 오프셋으로 추가한다. 그리기 코드에 감정 이름을 쓰지 않는다
- 이벤트 대사는 `src/events.js`(데이터), 판정 질문은 Worker `EVENT_JUDGES`(키 `성격.레벨`). judge 이벤트를 추가하면 둘 다 고친다
- 기억 키는 `config.js` `MEMORY_LIMITS`와 Worker `PLAYER_KEYS`/`SELF_KEYS`가 같아야 한다. 모델은 "새로 알게 된 것"만 주고, 병합·상한은 클라이언트가 결정적으로 처리한다
