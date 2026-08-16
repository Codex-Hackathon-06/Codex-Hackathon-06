# 오픈소스 디자인 적용 현황·상호작용 후보

현재 프로토타입은 외부 런타임 의존성 없이 HTML/CSS/JavaScript로 실행하되, 자체 제작 임시 그림 대신 Kenney의 공개 CC0 원본 에셋을 실제 화면에 적용한다. 공식 ZIP에서 필요한 PNG만 선별하고 각 팩의 원본 라이선스를 함께 보존했으며, 정확한 파일 목록과 버전·해시는 [`THIRD_PARTY_ASSETS.md`](THIRD_PARTY_ASSETS.md)에서 확인할 수 있다.

## 현재 적용한 공개 에셋

| 프로젝트 | 실제 용도 | 라이선스 | 상태 |
| --- | --- | --- | --- |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | 출구 문, 책장, 서랍장, 책상, 키보드, 책, 모니터 | CC0 1.0 | 적용 완료 |
| [Kenney UI Pack](https://kenney.nl/assets/ui-pack) | 버튼, 패널, 완료 표시, 평가 리포트 카드 | CC0 1.0 | 적용 완료 |
| [Kenney Game Icons](https://kenney.nl/assets/game-icons) | 잠김·열림, 출구, 확대, 질문, 체크 아이콘 | CC0 1.0 | 적용 완료 |

## 2D/3D 비교용 업로드 구조

추가 에셋은 `apps/web/assets/2d`와 `apps/web/assets/3d`에 분리하고, 각 폴더의 `manifest.json`에서 같은 논리 키를 사용한다. 게임 진행 상태와 퍼즐 데이터는 공통이므로 상단 선택기에서 모드만 바꾸면 같은 장면을 두 시각 방향으로 비교할 수 있다.

- 2D 항목: `kind: "image"`와 PNG·WebP·SVG 상대 경로
- 3D 항목: `kind: "model"`과 GLB 상대 경로, 로딩·폴백용 `poster` 권장
- 누락·잘못된 항목: 현재 Kenney 이미지로 개별 폴백
- 실제 모델 카메라·조명·회전 범위: GLB 업로드 뒤 모델별로 조정

정확한 키와 descriptor 예시는 [`../apps/web/assets/README.md`](../apps/web/assets/README.md)에 둔다.

## 프레임워크 확정 후 선택 후보

| 프로젝트 | 용도 | 라이선스 | 적용 시점 |
| --- | --- | --- | --- |
| [Lucide](https://github.com/lucide-icons/lucide) | 열쇠, 자물쇠, 확대, 뒤로가기 아이콘 | ISC·일부 MIT | 프레임워크 확정 후 |
| [dnd-kit](https://github.com/clauderic/dnd-kit) | 포인터·터치·키보드 드래그앤드롭 | MIT | React 등 지원 어댑터 확정 후 |

## 선택 기준

- 데모 직전에는 라이브러리 교체보다 현재 판정 로직의 안정성을 우선한다.
- 에셋을 저장소에 복사할 때는 해당 라이선스 파일과 출처를 함께 둔다.
- 외부 CDN에 의존하지 않고 발표 환경에서 오프라인 실행이 가능해야 한다.
- 장식 이미지가 퍼즐의 클릭 영역과 접근성 텍스트를 대체하지 않게 한다.
