# Implementation Plan: 자막 기반 멀티 퍼즐 템플릿

## Overview

Whisper 산출물(`manifest.json`, `transcript.chunks.json`, `transcript.raw.json`, `transcript.srt`)을 근거로 약 26분 41초짜리 코딩 에이전트 강의를 5개 퍼즐 방으로 만든다. 기존 아이템 배치는 유지하고 숫자 번호키, 문자·기호 패드, 다중 다이얼, 선택 스위치를 실행 가능한 템플릿으로 추가한다.

## Architecture Decisions

- 퍼즐 `kind`는 `ITEM_PLACEMENT`, `KEYPAD`, `DIAL_LOCK`, `TOGGLE_PANEL` 네 종류다.
- 구체 템플릿은 기존 5종에 `NUMERIC_KEYPAD`, `SYMBOL_KEYPAD`, `MULTI_DIAL`, `SWITCH_BANK`를 더해 총 9종으로 관리한다.
- 모든 상호작용은 공통 런타임 상태와 `submitPuzzleAnswer`를 통해 정답·오답·힌트·해설을 동일하게 처리한다.
- 생성기는 학습 과제의 형태에 따라 템플릿을 선택하고, 마지막 퍼즐은 계속 `FINAL_SAFE` 아이템 배치로 고정한다.
- 새 코딩 에이전트 샘플은 제공 자막의 실제 `seg-*` ID와 타임스탬프만 인용한다.
- 다음 구역은 퍼즐 해결만으로 자동 개방하지 않는다. 보상 아이템을 수집해 잠긴 가구에 드롭하면 아이템이 소모되고 해당 뷰가 해금된다.
- 최종 금고는 직전 퍼즐에서 얻은 구체적인 조립 부품을 슬롯에 배치해 해결하고, 출구 키카드도 문에 직접 드롭한 뒤 문을 눌러야 탈출한다.
- 스토리 문구와 탈출 아트는 다른 팀원이 교체할 수 있는 UI 훅으로 유지한다.
- 2D와 3D 에셋은 동일한 논리 키를 쓰는 별도 manifest로 로드해 게임 상태를 바꾸지 않고 비교한다.

## Task List

### Phase 1: Contract

#### Task 1: 템플릿 카탈로그와 추천 규칙

**Acceptance criteria:**
- [x] 9개 템플릿의 kind, 용도, 필수 필드가 코드로 정의된다.
- [x] 숫자 사실·수식, 기호식, 순서, 복수 판단이 각각 적합한 템플릿으로 추천된다.

**Verification:** `node --test tests/template-catalog.test.js`

**Dependencies:** 없음
**Files:** `packages/content-schema/src/template-catalog.js`, `tests/template-catalog.test.js`
**Estimated scope:** Small

#### Task 2: 멀티 kind 스키마와 검증기

**Acceptance criteria:**
- [x] kind별 필수 입력·정답 구조를 검증한다.
- [x] 모든 퍼즐에 오답 피드백, 힌트 2회 후 정답 공개, 실제 segment 근거가 필요하다.
- [x] ITEM_PLACEMENT 계열 팩(tests/fixtures/item-placement-room.json)도 계속 유효하다.

**Verification:** `node --test tests/content-schema.test.js`

**Dependencies:** Task 1
**Files:** `puzzle-pack.schema.json`, `validate-puzzle-pack.js`, `content-schema.test.js`
**Estimated scope:** Medium

### Checkpoint: Contract

- [x] 기존·신규 샘플의 계약 테스트가 모두 통과한다.

### Phase 2: Executable Templates

#### Task 3: 번호키·다이얼·스위치 런타임

**Acceptance criteria:**
- [x] 키 입력·삭제, 다이얼 순환, 스위치 토글 상태가 불변 상태로 관리된다.
- [x] 오답은 진행을 보존하고, 정답은 보상·해설·의존성 해금을 기존과 동일하게 처리한다.

**Verification:** `node --test tests/game-engine.test.js`

**Dependencies:** Task 2
**Files:** `packages/game-engine/src/runtime.js`, `tests/game-engine.test.js`
**Estimated scope:** Medium

#### Task 4: 장면 내 멀티 템플릿 UI

**Acceptance criteria:**
- [x] 숫자/기호 패드, 다이얼, 스위치가 실제 가구 위에서 클릭 가능하다.
- [x] 오른쪽 패널에 입력 진행, 힌트, 오답, 해설과 영상 근거가 표시된다.
- [x] 기존 드래그·클릭 아이템 퍼즐이 회귀하지 않는다.

**Verification:** 브라우저에서 네 kind를 각각 한 번 이상 해결한다.

**Dependencies:** Task 3
**Files:** `apps/web/index.html`, `apps/web/app.js`, `apps/web/styles.css`
**Estimated scope:** Medium

### Phase 3: Transcript-backed Room

#### Task 5: 코딩 에이전트 5퍼즐 팩

**Acceptance criteria:**
- [x] 제공 파일의 SHA, 영상 길이, 실제 chunk ID가 provenance와 evidence에 남는다.
- [x] SWITCH_BANK → NUMERIC_KEYPAD → MULTI_DIAL → SYMBOL_KEYPAD → FINAL_SAFE를 완주할 수 있다.
- [x] 각 오답·힌트·해설이 해당 자막 구간 내용만 사용한다.

**Verification:** validator 통과 및 런타임 5/5 완주 테스트

**Dependencies:** Task 2, Task 3
**Files:** `content/sample-lectures/coding-agents.input.json`, `coding-agents.room.json`, tests
**Estimated scope:** Medium

#### Task 6: 생성 프롬프트·샘플 선택·문서

**Acceptance criteria:**
- [x] 생성 프롬프트가 문제 성격별 템플릿 선택 규칙을 포함한다.
- [x] 웹에서 코딩 에이전트 샘플과 기존 문학 샘플을 전환할 수 있다.
- [x] README와 인수인계 문서에 새 계약과 실행법이 기록된다.

**Verification:** `npm test`, `npm run validate:sample`, 브라우저 스모크

**Dependencies:** Task 1~5
**Files:** generation prompt, `apps/web`, README, docs
**Estimated scope:** Medium

### Checkpoint: Complete

- [x] 자동 테스트와 JSON 검증이 통과한다.
- [x] `npm start`에서 새 강의 팩을 0/5부터 탈출까지 완주한다.
- [x] 기능 브랜치와 기존 PR에 push한다.

### Phase 4: 물리적 진행 체인과 교체형 에셋

#### Task 7: 보상 아이템 기반 뷰 해금

**Acceptance criteria:**
- [x] 잠긴 가구는 클릭만으로 진입할 수 없고 데이터의 잠김 문구를 표시한다.
- [x] 앞 퍼즐의 정확한 보상 아이템을 가구에 드롭하거나 선택 후 클릭하면 아이템이 소모되고 해당 뷰만 열린다.
- [x] 초기화하면 소비·해금 상태가 함께 초기화된다.

**Verification:** 런타임 회귀 테스트와 브라우저에서 `책장 → 벽 → 서랍 → 책상` 순차 완주

**Dependencies:** Task 3, Task 5
**Files:** runtime, schema, coding sample, web UI, tests
**Estimated scope:** Medium

#### Task 8: 최종 부품 조립과 실제 출구 사용

**Acceptance criteria:**
- [x] 직전 퍼즐 보상 부품 3개를 최종 금고 슬롯에 배치하면 인벤토리에서 사라진다.
- [x] 최종 퍼즐 완료만으로 탈출하지 않고, 키카드를 출구에 드롭한 뒤 열린 문을 눌러야 탈출한다.
- [x] 인벤토리 아이콘은 슬롯 경계를 넘지 않는다.

**Verification:** 5/5 완료, 키카드 사용 전·후·문 클릭 후 상태를 각각 브라우저에서 단언

**Dependencies:** Task 7
**Files:** coding sample, runtime, web UI, browser smoke
**Estimated scope:** Medium

#### Task 9: 2D/3D 에셋 모드 계약

**Acceptance criteria:**
- [x] `assets/2d`와 `assets/3d`가 같은 오브젝트·아이템 키 계약을 사용한다.
- [x] 모드 전환 시 현재 퍼즐 진행을 잃지 않고 해당 manifest의 에셋으로 다시 렌더링한다.
- [x] 파일이 아직 없거나 잘못된 엔트리는 기존 폴백으로 안전하게 표시한다.

**Verification:** manifest 계약 테스트와 두 모드 전환 브라우저 스모크

**Dependencies:** 없음
**Files:** asset catalog, manifests, selector, web UI, tests
**Estimated scope:** Small

### Checkpoint: Physical progression

- [x] 전체 자동 테스트와 두 샘플 검증이 통과한다.
- [x] 데스크톱·모바일에서 오브젝트 충돌이 없고 5퍼즐을 끝까지 완주한다.
- [ ] 실제 2D/3D 파일 적용은 업로드 이후 별도 시각 검수로 남긴다.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| OCR/Whisper 고유명사 오류 | 중간 | 제공 chunk ID는 보존하고 게임 문구만 문맥에 맞게 정규화 |
| kind별 스키마 복잡도 | 높음 | 공통 필드와 kind별 검증을 분리하고 기존 팩 회귀 테스트 유지 |
| 작은 화면에서 제어판 과밀 | 중간 | target 영역 안 반응형 그리드와 오른쪽 설명 패널 분리 |
| 정답이 데이터에 노출 | 낮음 | 데모 클라이언트 팩의 한계로 문서화, 실제 서비스는 서버 판정 가능 |

## Open Questions

- 현재 데모에서는 제공 자막 청크를 근거 원본으로 사용하고, 전체 원본 파일 복사는 하지 않는다.
