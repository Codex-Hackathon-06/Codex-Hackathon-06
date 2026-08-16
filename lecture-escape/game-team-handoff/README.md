# LecScape 게임 팀 전달 패키지

이 패키지는 실시간 STT와 강의 분석이 끝난 뒤 생성되는 `GameGeneratorInput`을 게임 UI에 연결하기 위한 자료입니다.

## 게임 팀이 구현할 것

`integration/game-runtime.js`의 다음 함수만 실제 게임으로 교체해주세요.

```js
export async function mountGame(root, gameInput, context) {
  // root에 단일 방 게임 렌더링
  // 게임 종료 시 context.onComplete(result) 호출
}
```

STT·개념 분석·화면 이동·데이터 전달은 이미 구현되어 있습니다. 게임 코드에서 OpenAI API를 다시 호출하거나 JSON 파일을 직접 읽을 필요가 없습니다.

## 포함된 파일

- `game-generator.sample.json`: 실제 강의를 분석해 만든 샘플 입력
- `game-contract.d.ts`: TypeScript 입력 및 완료 결과 계약
- `integration/game-runtime.js`: 게임 팀이 교체할 단일 파일
- `integration/game.js`: 저장된 입력을 읽고 `mountGame`을 호출하는 진입점
- `integration/game-handoff.js`: 분석 화면에서 게임 화면으로 데이터를 전달하는 코드
- `integration/game.html`: `/game` 페이지 껍데기
- `integration/style.css`: 현재 LecScape 스타일 참고본
- `preview.html`, `preview.js`: 샘플 JSON으로 현재 runtime을 확인하는 독립 미리보기

## 입력 사용 방법

`gameInput.roomBlueprint.room.stages`에는 정확히 세 단계가 들어옵니다.

1. `concept_discovery`: 핵심 개념 발견
2. `case_application`: 사례 적용
3. `synthesis_judgment`: 종합 판단 및 개념 재등장

단계 안의 `conceptIds`, `exampleIds`, `confusionIds`는 각각 다음 배열의 `id`를 참조합니다.

```js
const concepts = new Map(gameInput.coreConcepts.map(item => [item.id, item]));
const examples = new Map(gameInput.examples.map(item => [item.id, item]));
const confusions = new Map(gameInput.confusions.map(item => [item.id, item]));

const stage = gameInput.roomBlueprint.room.stages[0];
const stageConcepts = stage.conceptIds.map(id => concepts.get(id));
```

영상 근거 버튼은 각 항목의 `evidence`를 사용합니다.

```js
const evidence = concept.evidence[0];
// evidence.chunkId
// evidence.startMs
// evidence.endMs
// evidence.text
```

## 완료 결과

탈출 완료 시 다음 형식으로 호출해주세요.

```js
context.onComplete({
  escaped: true,
  wrongConceptIds: ["concept-02"],
  hintCount: 1,
  answerRevealCount: 0,
  completedAt: new Date().toISOString(),
});
```

이 결과는 `lecscape:game-complete` 브라우저 이벤트로 전달되며, 추후 Notion·Calendar 기록 파이프라인이 구독할 수 있습니다.

## 로컬 미리보기

이 폴더에서 간단한 정적 서버를 실행합니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://127.0.0.1:8080/preview.html`을 열면 샘플 데이터가 현재 `mountGame`으로 전달됩니다.

## 본 프로젝트에 돌려줄 결과

가장 간단한 반환 방식은 완성한 `game-runtime.js` 한 파일입니다. React/Vite를 사용한다면 빌드된 모듈에서 동일한 `mountGame(root, gameInput, context)` 함수를 export하는 어댑터를 함께 제공해주세요.

완료 기준:

- 별도 API 호출 없이 `gameInput`만으로 시작
- 세 단계가 순서대로 플레이 가능
- ID 참조가 존재하지 않을 때 명확한 오류 표시
- 힌트와 오답 피드백 제공
- 완료 시 `context.onComplete()` 호출
- 새로고침이나 직접 `/game` 접근 시 앱이 깨지지 않음
