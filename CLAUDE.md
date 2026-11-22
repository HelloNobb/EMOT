# EMOT — Claude용 프로젝트 규칙

전역 규칙(`~/.claude/CLAUDE.md`)을 따른다. 아래는 three.js 웹 프로젝트라서 바뀌는 부분과 이 프로젝트의 구조다.

## 스택
- three.js `0.187.0` + `@pixiv/three-vrm` `3.5.5`. `index.html`의 importmap에서 jsDelivr로 버전 고정 로드. 빌드 도구 없음
- 배포: GitHub Pages(저장소 루트). 프록시: Cloudflare Worker(`worker/`)
- 감정 판단: TypeSafe 공식 API `POST https://api.typesafe.ai/v1/systemone`, 모델 `jev-latest`

## 역할 분담 (three.js에 맞춘 버전)
| 항목 | 담당 |
|---|---|
| `.js` 작성 (`src/`, `worker/`) | Claude |
| 캐릭터 모델(`assets/*.vrm`), 가구 모델 교체, `config.js` 수치 밸런스 | 개발자 |
| Worker 배포·시크릿 등록, GitHub Pages 설정, TypeSafe API 키 | 개발자 |
- three.js는 씬을 코드로 만든다. Unity 규칙의 "런타임 오브젝트 생성 금지"는 적용하지 않는다. 대신 배치 좌표·크기는 `room.js` 한 곳, 수치는 `config.js` 한 곳에만 둔다

## 구조
| 파일 | 책임 |
|---|---|
| `src/main.js` | 렌더러·카메라·루프, 모듈 연결, 클릭 레이캐스트, 저장 타이머 |
| `src/config.js` | 튜닝 수치 전부 (욕구 속도, 행동 효과, 레벨, 표정 매핑, 프록시 URL) |
| `src/room.js` | 방·가구 생성, 행동별 사용 위치(spot) |
| `src/character.js` | VRM 로드, 이동, 절차적 포즈(뼈 회전) |
| `src/sim.js` | 욕구·돈·레벨 상태, 행동 상태머신(idle→moving→using), 자율 선택, 저장 |
| `src/face.js` | 감정 확률 → VRM 표정 가중치, 보간, 깜빡임 |
| `src/emotion.js` | 스로틀, 프록시 호출, 오래된 응답 폐기, 응답 파싱, 통계 |
| `src/ui.js` | DOM 갱신만. UI 구조는 `index.html`에 있다 |
| `worker/index.js` | CORS·레이트리밋·입력 검증, 프롬프트(질문) 소유, TypeSafe 호출 |

## 규칙
- 프롬프트(질문 정의)는 Worker만 가진다. 클라이언트는 텍스트와 욕구 숫자만 보낸다 (프록시를 범용 LLM 중계기로 못 쓰게)
- 키는 Worker 시크릿에만. 저장소·클라이언트 코드에 키 금지
- 매 프레임 순서: `sim.update` → `character.update`(포즈) → `face.update`(표정) → `vrm.update` → 렌더. 순서를 바꾸지 않는다
- 포즈는 매 프레임 `resetNormalizedPose()` 후 다시 적용한다 (이전 포즈 잔여 회전 방지)
