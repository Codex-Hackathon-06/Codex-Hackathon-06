# Implementation Plan: 오브젝트 퍼즐 생성·플레이 프로토타입

## Overview

30분 강의 한 편을 학습 퍼즐 4개와 최종 금고 1개로 변환하고, 방 전체에서 가구를 확대해 아이템을 수집한 뒤 인벤토리에서 슬롯으로 사용하는 동작을 검증한다.

## Architecture Decisions

- 생성기와 실행기는 버전이 있는 `PuzzlePack` JSON으로 분리한다.
- 모든 퍼즐 판정은 `ITEM_PLACEMENT` 하나로 통일한다.
- 드래그와 클릭 선택은 동일한 `tryUseItem` 함수를 호출한다.
- 실제 타임스탬프는 영상 세그먼트에만 저장하고 퍼즐은 세그먼트 ID를 참조한다.
- 외부 라이브러리 없이 실행 가능한 정적 프로토타입을 먼저 만든다.

## Task List

### Phase 1: Contract

- [x] README와 팀 책임 범위 확인
- [x] 5개 퍼즐 데이터 계약 및 샘플 설계
- [x] 구조·참조·진행 가능성 검증기 구현

### Checkpoint: Contract

- [x] 샘플 PuzzlePack이 모든 검사를 통과한다.

### Phase 2: Working Slice

- [x] 방 전체와 네 확대 화면을 이동할 수 있다.
- [x] 아이템을 클릭해 인벤토리에 수집할 수 있다.
- [x] 드래그 또는 클릭으로 슬롯에 아이템을 사용할 수 있다.
- [x] 오답 피드백·힌트·근거 해설을 볼 수 있다.
- [x] 퍼즐 5개를 해결해 탈출할 수 있다.

### Checkpoint: Working Slice

- [x] 고정 샘플을 처음부터 끝까지 완주한다.

### Phase 3: Handoff

- [x] 실행·검증 명령을 README에 추가한다.
- [x] 자동 테스트와 브라우저 스모크 검사를 통과한다.
- [ ] 기능 브랜치에 커밋하고 원격에 push한다.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 모바일 drag 미지원 | 높음 | 클릭 선택 후 슬롯 클릭을 항상 제공 |
| 생성 JSON 참조 오류 | 높음 | 실행 전에 validator로 차단 |
| 퍼즐 의존 순환 | 높음 | 의존 그래프 검사와 고정 fallback 사용 |
| 팀 프레임워크 충돌 | 중간 | 의존성 없는 정적 프로토타입으로 격리 |
