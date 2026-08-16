# 오브젝트 퍼즐 생성기 인수인계

## 책임 경계

퍼즐 생성기는 영상 분석 결과와 방의 허용된 오브젝트 목록을 받아 `PuzzlePack`을 반환한다.
화면 좌표, 장면 이미지, 드래그 동작, 세션 저장은 생성기의 책임이 아니다.

```text
영상 분석 결과 ─┐
                ├─ 퍼즐 생성기 → PuzzlePack JSON → 게임 엔진
방 기능 목록 ───┘
```

### 영상 분석 팀이 제공할 데이터

- `video.id`, `video.durationSec`
- `segments[]`: `id`, `startSec`, `endSec`, `text`
- 선택 사항: 핵심 개념·사례·오개념

### 공간·게임 팀이 제공할 데이터

- 사용할 `viewId`
- 퍼즐별 `target.id`, `target.viewId`, `template`
- 아이템 배치 target의 고정 `slotIds[]`
- 키패드·다이얼·스위치 target의 고정 `controlIds[]`
- 아이템 표시용 `assetKey`
- 아이템을 놓을 수 있는 장면 슬롯

### 생성기가 반환할 데이터

- 영상 길이에 맞춘 퍼즐 3~5개의 학습목표와 문구(30분 데모는 5개)
- 템플릿에 맞는 후보 아이템 또는 제어 장치와 정답
- 오답 아이템·답안·스위치별 피드백
- 스키마 호환용 3개 힌트 레코드와 별도의 정답 해설
- 근거 `segmentId`
- 다음 확대 화면을 여는 카드·열쇠·퓨즈형 `REVEAL_ITEM` 보상과 `room.views[].unlock` 연결
- 요구된 선행 퍼즐이 공개한 조립 부품 2개 이상을 정확히 한 번씩 소모하는 `FINAL_SAFE` 후보·정답 매핑

### 힌트·정답 노출 계약

생성 데이터는 검증 규격에 맞춰 `OBSERVATION → CONCEPT → DIRECTION` 세 레코드를 유지한다. 다만 현재 데모의 플레이 노출 순서는 정확히 다음과 같다.

```text
힌트 1/2: OBSERVATION
→ 힌트 2/2: CONCEPT
→ 정답 공개: explanation의 정답·해설·영상 근거
```

- `DIRECTION`은 스키마와 생성 품질 검사용으로 보존하며 세 번째 힌트 버튼으로 노출하지 않는다.
- 정답 공개는 앞의 두 힌트를 모두 본 뒤에만 가능하다.
- 정답을 공개해도 퍼즐은 자동으로 해결되지 않으며 사용자가 장치를 직접 조작해야 한다.

## 인터랙션 계약

다음 확대 화면이 잠겨 있으면 `room.views[].unlock`을 사용한다.

```json
{
  "itemId": "drawer-key",
  "lockedMessage": "서랍이 잠겨 있다. 열쇠가 필요하다.",
  "unlockedMessage": "열쇠를 돌려 서랍을 열었다."
}
```

- `unlock.itemId`는 바로 이전 퍼즐이 `REVEAL_ITEM`으로 공개한 실제 `items[]` 항목이다.
- 해당 아이템은 `source.type: "PUZZLE_REWARD"`, `source.puzzleId: 바로 이전 퍼즐`, `consumedOnUse: true`를 가진다.
- 잠긴 화면을 누르면 이동하지 않고 `lockedMessage`를 표시한다.
- 인벤토리 아이템을 대상 화면에 드래그하면 아이템을 소모하고 `unlockedMessage`를 표시한 뒤 접근을 허용한다.

아이템 배치 퍼즐은 기존 배치 API를 사용한다.

```js
tryUseItem(pack, state, itemId, slotId)
```

- 드래그 후 드롭과 `아이템 클릭 → 슬롯 클릭`은 같은 함수를 호출한다.
- 오답은 상태를 변경하지 않고 아이템을 인벤토리에 유지한다.
- 정답 아이템만 슬롯에 고정한다.
- 여러 슬롯 퍼즐은 모든 슬롯이 맞아야 완료하며, 맞게 배치한 `consumedOnUse` 아이템은 인벤토리에서 소모한다.
- 퍼즐 완료 보상은 확대 화면에 나타나며 사용자가 직접 클릭해 획득한다.

제어 장치 퍼즐은 입력 변경과 제출을 분리한다.

```js
applyPuzzleInput(pack, state, puzzleId, action)
submitPuzzleAnswer(pack, state, puzzleId)
```

- `KEYPAD`: `PRESS`, `BACKSPACE`, `CLEAR`
- `DIAL_LOCK`: `CYCLE`과 `controlId`, `direction`
- `TOGGLE_PANEL`: `TOGGLE`과 `controlId`
- 오답 제출은 현재 입력을 유지하고 `feedback.byAnswer` 또는 `byControlId`를 우선 표시한다.
- 세 kind 모두 정답이면 아이템 배치와 같은 보상·해설·의존성 해금 흐름을 사용한다.

최종 금고와 실제 탈출은 별도 상태 전환이다.

```js
tryUseExitItem(pack, state, completion.exitItemId, completion.exitObjectId)
exitRoom(pack, state)
```

- 최종 금고 해결만으로 `escaped`가 되지 않으며 출구 아이템이 장면에 나타난다.
- 출구 아이템을 획득해 문에 사용하면 인벤토리에서 소모되고 `exitUnlocked`가 된다.
- 잠금이 풀린 뒤 문을 열어야 `escaped: true`와 `ENDING` 해설이 표시된다.

## 실행 가능한 템플릿

| template | kind | 적합한 문제 |
| --- | --- | --- |
| `MISSING_TOKEN` | `ITEM_PLACEMENT` | 용어 빈칸 |
| `ORDER_ITEMS` | `ITEM_PLACEMENT` | 과정·시간 순서 |
| `KEY_TO_LOCK` | `ITEM_PLACEMENT` | 사례·원인 선택 |
| `MATCH_ITEM` | `ITEM_PLACEMENT` | 개념-사례 매칭 |
| `NUMERIC_KEYPAD` | `KEYPAD` | 수식 계산의 숫자 답 |
| `SYMBOL_KEYPAD` | `KEYPAD` | 공식·기호·짧은 문자 조합 |
| `MULTI_DIAL` | `DIAL_LOCK` | 여러 위치별 선택·순서 |
| `SWITCH_BANK` | `TOGGLE_PANEL` | 복수 진술 동시 선택 |
| `FINAL_SAFE` | `ITEM_PLACEMENT` | 요구된 선행 퍼즐에서 회수한 구체적인 조립 부품 2개 이상 |

생성기는 `recommendPuzzleTemplate`로 문제 의미와 방 capability에 맞는 템플릿을 추천받을 수 있다. 마지막 퍼즐은 항상 `FINAL_SAFE`다.

## 장면 이동

```text
overview
├── bookshelf: 첫 퍼즐 → 벽 액세스 카드
├── wall: 카드로 해금 → 두 번째 퍼즐 → 서랍 열쇠
├── drawer: 열쇠로 해금 → 세 번째 퍼즐 → 책상 전원 퓨즈
└── desk: 퓨즈로 해금 → 네 번째 퍼즐 → 금고 조립 부품 3개 → FINAL_SAFE
```

인벤토리는 모든 화면에서 하단에 고정한다. 확대 화면을 이동하면 선택 중인 아이템을 해제한다.

## 30분 영상 퍼즐 수

```js
Math.min(5, Math.max(3, Math.ceil(durationSec / 360)))
```

- 18분 이하: 3개
- 18분 초과~24분: 4개
- 24분 초과: 5개
- 30분 데모: 5개

현재 방 템플릿은 최대 5개를 지원한다. 더 긴 영상은 퍼즐을 무한히 늘리기보다 핵심 개념 5개를 선별한다.

## 게시 전 검사

- 선언한 퍼즐 수와 배열 길이가 같은가
- 모든 참조 ID가 존재하는가
- 각 target의 `slotIds` 또는 `controlIds`와 생성 결과가 정확히 일치하는가
- 아이템 distractor와 비정답 스위치의 전용 오답 피드백이 완전한가
- 키패드 정답을 허용 키와 `maxLength`만으로 입력할 수 있는가
- 모든 다이얼 정답이 해당 `options`에 존재하는가
- 다른 view로 넘어갈 때 `unlock.itemId`가 바로 이전 퍼즐의 실제 `REVEAL_ITEM`/`PUZZLE_REWARD`인가
- 해금 아이템에 구체적인 물건명·표시 형태·잠김/해금 문구·`consumedOnUse: true`가 있는가
- FINAL_SAFE 후보·정답이 요구된 선행 퍼즐의 실제 보상 조립 부품 2개 이상이며 두 itemId 집합이 정확히 같은가
- 카드·열쇠·퓨즈 같은 진행용 해금 아이템이 FINAL_SAFE 후보에서 제외되었는가
- 첫 퍼즐 정답 아이템을 처음부터 획득할 수 있는가
- 의존 관계에 순환이 없는가
- 모든 해설의 근거 세그먼트가 존재하는가

## 발표용 안전장치

- 고정 샘플 JSON은 항상 보존한다.
- 실시간 생성 결과가 검증을 통과하지 못하면 고정 샘플을 사용한다.
- 드래그가 지원되지 않는 터치 환경에서도 클릭 방식으로 완주할 수 있어야 한다.

## API 팀 연결 예시

```js
import {
  buildGenerationPrompt,
  validatePuzzlePack,
} from "../packages/content-schema/src/index.js";

const prompt = buildGenerationPrompt(
  lectureInput.video,
  lectureInput.roomCapabilities,
);

// 모델에는 prompt를 전달하고 JSON 문자열만 반환하도록 요청한다.
const generatedPack = JSON.parse(modelJsonText);
const validation = validatePuzzlePack(generatedPack);

if (!validation.valid) {
  // 한 번의 수정 요청 후에도 실패하면 고정 샘플로 폴백한다.
  throw new Error(JSON.stringify(validation.errors));
}
```

`buildGenerationPrompt`는 화면 ID를 새로 만들지 않도록 각 target의 `id`, `viewId`,
`template`과 kind에 맞는 `slotIds[]` 또는 `controlIds[]`를 요구한다.
`validatePuzzlePack`은 `{ valid, errors }`를 반환하므로 API는 생성 결과를 게임
클라이언트에 전달하기 전에 반드시 검사해야 한다.
