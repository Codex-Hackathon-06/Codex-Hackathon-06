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
- 퍼즐별 `target.id`, `target.viewId`, `slotIds[]`
- 아이템 표시용 `assetKey`
- 아이템을 놓을 수 있는 장면 슬롯

### 생성기가 반환할 데이터

- 영상 길이에 맞춘 퍼즐 3~5개의 학습목표와 문구(30분 데모는 5개)
- 후보 아이템·정답 배치
- 오답 후보별 피드백
- 3단계 힌트와 정답 해설
- 근거 `segmentId`
- 보상 아이템과 퍼즐 의존 관계

## 인터랙션 계약

모든 퍼즐은 동일한 판정 함수를 사용한다.

```js
tryUseItem(pack, state, itemId, slotId)
```

- 드래그 후 드롭과 `아이템 클릭 → 슬롯 클릭`은 같은 함수를 호출한다.
- 오답은 상태를 변경하지 않고 아이템을 인벤토리에 유지한다.
- 정답 아이템만 슬롯에 고정한다.
- 여러 슬롯 퍼즐은 모든 슬롯이 맞아야 완료한다.
- 퍼즐 완료 보상은 확대 화면에 나타나며 사용자가 직접 클릭해 획득한다.

## 장면 이동

```text
overview
├── bookshelf: 빠진 개념 책
├── wall: 사건·과정 순서판
├── drawer: 역할 열쇠 자물쇠
└── desk: 메시지 기록판 + 최종 금고
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
- 모든 정답 후보와 오답 피드백이 완전한가
- P1~P4 보상 토큰이 P5 정답과 정확히 일치하는가
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
`slotIds[]`를 요구한다. `validatePuzzlePack`은 `{ valid, errors }`를 반환하므로 API는
생성 결과를 게임 클라이언트에 전달하기 전에 반드시 검사해야 한다.
