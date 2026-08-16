# LecScape 게임 파트 통합 계약

## 현재 완성된 흐름

```text
YouTube 시스템 오디오
→ 실시간 STT
→ 종료 및 전사 저장
→ 개념·사례·혼동 포인트 분석
→ GameGeneratorInput 생성
→ 게임 시작 버튼
→ /game
```

분석이 완료되면 웹소켓 `analysis_complete` 이벤트의 `analysis` 필드로 전체 `GameGeneratorInput`이 전달됩니다. `게임 시작` 버튼은 이 데이터를 `sessionStorage`에 저장하고 `/game`으로 이동합니다.

## 게임 팀이 교체할 파일

게임 팀은 다음 파일의 `mountGame` 구현만 교체합니다.

```text
live-ui/game-runtime.js
```

계약:

```js
export async function mountGame(root, gameInput, context) {
  // root: 게임을 렌더링할 HTMLElement
  // gameInput: game-generator.input.json 전체 객체
  // context.sessionId: 실시간 STT 세션 ID
  // context.outputPath: 원본 게임 입력 JSON 경로
  // context.onComplete(result): 게임 종료 결과 전달 함수
}
```

게임 구현은 별도 API 호출이나 로컬 파일 접근 없이 전달받은 `gameInput`만으로 시작할 수 있어야 합니다.

## 주요 입력 필드

- `lecture`: 강의 제목, 요약, 학습 목표
- `coreConcepts`: 핵심 개념과 영상 근거
- `examples`: 강의 속 적용 사례
- `confusions`: 혼동하기 쉬운 개념과 정확한 구분
- `roomBlueprint.room`: 단일 방의 제목, 스토리, 목표, 테마
- `roomBlueprint.room.stages`: 개념 발견, 사례 적용, 종합 판단의 세 단계
- 각 항목의 `evidence`: `chunkId`, `startMs`, `endMs`, 근거 문장

## 통합 시 유지할 파일

다음 파일은 STT와 게임 사이의 연결 코드이므로 그대로 유지합니다.

- `live-ui/game-handoff.js`
- `live-ui/game.js`
- `live-ui/game.html`
- `src/live-server.mjs`

React/Vite 결과물을 받는 경우에도 빌드 진입점에서 동일한 `mountGame(root, gameInput, context)` 함수를 export하는 얇은 어댑터를 두는 것을 권장합니다.

## 완료 이벤트

게임 종료 시 다음을 호출합니다.

```js
context.onComplete({
  escaped: true,
  wrongConceptIds: [],
  hintCount: 0,
  completedAt: new Date().toISOString(),
});
```

현재 `game.js`는 이를 `lecscape:game-complete` 브라우저 이벤트로 전달합니다. 이후 Notion·Calendar 학습 기록 연결은 이 이벤트를 구독하면 됩니다.

## 확인 절차

1. `bash scripts/live-macos.sh` 실행
2. 실시간 STT 시작 후 강의 재생
3. `종료하고 개념 생성` 클릭
4. 상태가 `Ready`가 되는지 확인
5. `게임 시작` 클릭
6. `/game` 화면에 전달된 방 제목과 세 단계가 표시되는지 확인
