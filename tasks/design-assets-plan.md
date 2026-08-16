# Implementation Plan: CC0 디자인 에셋 통합

## Overview

현재 HTML/CSS/JavaScript 방탈출 프로토타입을 유지하면서, 공개 저장소에 원본을 포함해도 안전한 CC0 에셋으로 CSS 가구와 문자 글리프를 교체한다. 1차 범위는 Kenney Furniture Kit, Kenney UI Pack, Kenney Game Icons이며, Unity Asset Store 에셋은 원본 재배포와 계정 획득 절차 때문에 포함하지 않는다.

## Architecture Decisions

- 런타임은 계속 오프라인에서 동작하고 외부 CDN에 의존하지 않는다.
- `backgroundAssetKey`와 `assetKey`를 실제 웹 에셋 URL에 연결하는 단일 카탈로그를 둔다.
- 3D 가구는 브라우저 런타임에 무거운 렌더러를 추가하기보다, 우선 고정 카메라의 투명 WebP 장면/소품으로 변환해 사용한다.
- 클릭 판정은 기존 JSON `rect`와 접근성 텍스트를 유지해 장식 이미지와 분리한다.
- 외부 에셋마다 원본 URL, 버전, 다운로드 날짜, SHA-256, 라이선스, 수정 내용을 기록한다.
- Unity 이관은 별도 작업이다. 선택될 경우 `apps/unity`에 Unity 6.3 LTS + URP 프로젝트를 만들고 기존 JSON 계약을 포팅하는 새 계획을 작성한다.

## Task List

### Phase 1: Asset Provenance

#### Task 1: CC0 원본 고정과 라이선스 기록

**Description:** 공식 배포처에서 필요한 팩만 내려받고 파일 무결성 및 재배포 조건을 기록한다.

**Acceptance criteria:**
- [ ] Kenney Furniture Kit, UI Pack, Game Icons의 공식 원본과 라이선스가 기록된다.
- [ ] 각 압축 파일의 SHA-256과 다운로드 날짜가 고정된다.
- [ ] 저장소에 포함한 모든 제3자 파일이 추적 가능하다.

**Verification:** `find apps/web/assets/third-party -type f | sort`와 라이선스 문서 수동 대조

**Dependencies:** None

**Files likely touched:**
- `apps/web/assets/third-party/`
- `docs/THIRD_PARTY_ASSETS.md`

**Estimated scope:** Small

#### Task 2: 웹용 에셋 카탈로그

**Description:** 기존 JSON의 방·아이템 키를 실제 파일 경로와 대체 텍스트에 매핑한다.

**Acceptance criteria:**
- [ ] overview/bookshelf/wall/drawer/desk와 book/card/key/token 키가 카탈로그에 정의된다.
- [ ] 알 수 없는 키에는 현재 글리프 또는 CSS fallback이 표시된다.
- [ ] 데이터 파일을 바꾸지 않고 다른 강의 팩에서도 같은 키를 재사용한다.

**Verification:** `node --test tests/web-asset-catalog.test.js`

**Dependencies:** Task 1

**Files likely touched:**
- `apps/web/asset-catalog.js`
- `tests/web-asset-catalog.test.js`

**Estimated scope:** Small

### Checkpoint: Provenance

- [ ] 모든 외부 파일의 라이선스와 출처가 확인된다.
- [ ] 공개 Git 저장소에 Unity Asset Store 원본 파일이 없다.

### Phase 2: Working Visual Slice

#### Task 3: 방 전체와 확대 장면 교체

**Description:** 선택한 CC0 가구를 현재 어두운 기록보관실 팔레트에 맞춘 WebP로 배치한다.

**Acceptance criteria:**
- [ ] 방 전체에서 책장, 게시판, 서랍장, 책상이 실제 에셋으로 보인다.
- [ ] 네 확대 화면이 같은 카메라·색감·조명 규칙을 사용한다.
- [ ] 기존 hotspot 좌표와 키보드 접근성이 유지된다.

**Verification:** 1440×1100 및 390×844 브라우저 스크린샷 비교

**Dependencies:** Task 2

**Files likely touched:**
- `apps/web/app.js`
- `apps/web/styles.css`
- `apps/web/assets/scenes/`

**Estimated scope:** Medium

#### Task 4: 퍼즐 소품과 UI 교체

**Description:** 문자 글리프와 주요 HUD 요소를 CC0 아이콘·패널로 교체한다.

**Acceptance criteria:**
- [ ] 책, 카드, 열쇠, 토큰, 자물쇠, 확대, 뒤로가기 아이콘이 일관된 스타일로 표시된다.
- [ ] 수집/선택/잠김/해결 상태가 색상만이 아니라 모양과 텍스트로도 구분된다.
- [ ] 모바일에서 인벤토리와 모달이 잘리거나 겹치지 않는다.

**Verification:** 샘플 게임에서 수집 → 배치 → 오답 → 힌트 → 해결 상태를 모두 수동 확인

**Dependencies:** Task 2, Task 3

**Files likely touched:**
- `apps/web/index.html`
- `apps/web/app.js`
- `apps/web/styles.css`
- `apps/web/assets/ui/`

**Estimated scope:** Medium

### Checkpoint: Working Slice

- [ ] 새 디자인으로 기존 5퍼즐을 처음부터 끝까지 완주한다.
- [ ] 에셋 로딩 실패 시에도 게임 진행이 가능하다.

### Phase 3: Verification and Handoff

#### Task 5: 회귀·성능·문서 검증

**Description:** 게임 로직 회귀, 오프라인 동작, 이미지 크기와 라이선스 문서를 검증한다.

**Acceptance criteria:**
- [ ] 기존 자동 테스트와 샘플 검증이 모두 통과한다.
- [ ] 초기 화면의 웹 에셋 전송량과 이미지 크기가 문서화된 한도를 넘지 않는다.
- [ ] 새 클론에서도 CDN이나 개인 계정 없이 동일한 화면이 열린다.

**Verification:** `npm test`, `npm run validate:sample`, 로컬 서버 브라우저 스모크

**Dependencies:** Task 1~4

**Files likely touched:**
- `README.md`
- `docs/THIRD_PARTY_ASSETS.md`
- `tests/`

**Estimated scope:** Small

### Checkpoint: Complete

- [ ] 자동 검증과 데스크톱·모바일 스모크가 통과한다.
- [ ] 모든 외부 에셋이 공개 저장소 재배포 가능한 라이선스다.
- [ ] 기존 미커밋 멀티 퍼즐 작업이 보존된다.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 3D 원본을 그대로 사용하면 런타임과 용량이 커짐 | High | 선택 모델만 고정 시점 WebP로 변환하고 원본/파생 관계 기록 |
| 서로 다른 팩의 미감이 섞임 | Medium | Kenney 계열을 기본 세트로 제한하고 공통 색보정 적용 |
| 이미지가 클릭 좌표와 어긋남 | High | JSON `rect` 기반 hotspot을 유지하고 스크린샷 회귀 확인 |
| Asset Store 무료 파일을 공개 커밋 | High | CC0만 벤더링하고 Asset Store 경로는 문서·ignore로만 관리 |
| 기존 미커밋 기능 변경과 충돌 | High | 에셋 전용 파일을 먼저 추가하고 `app.js`/`styles.css` 변경 전 diff 재확인 |

## Open Question

- 현재 웹 데모를 CC0 에셋으로 개선할지, 별도 Unity 6.3 LTS + URP 프로젝트로 이관할지 사용자 결정이 필요하다. 추천은 해커톤 데모를 빠르게 개선하는 웹 + CC0 경로다.
