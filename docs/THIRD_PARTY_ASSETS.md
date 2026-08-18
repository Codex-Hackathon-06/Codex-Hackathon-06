# Third-party visual assets

이 저장소에는 데모 화면에 실제로 사용하는 파일만 선별해 포함한다. 모든 파일은 CC0 1.0이며, 각 디렉터리에 원본 라이선스 문서를 그대로 보존한다. Kenney 로고는 사용하지 않는다.

게임 화면이 렌더링하는 에셋은 전부 `apps/web/assets/third-party/pixel/`에 있고, 매핑은 `apps/web/asset-catalog.js` 한 곳에서 관리한다. 원본 팩의 SHA-256과 다운로드 URL은 `apps/web/assets/third-party/pixel/licenses/ASSET_MANIFEST.md`에 함께 보존했다.

## Kenney Isometric Miniature Library 1.0

- License: CC0 1.0
- Official source: https://kenney.nl/assets/isometric-miniature-library
- Source ZIP SHA-256: `e8ac573b289e04d06ae2feb174c526aeb6456c0655663cc4b3820942c8bd128f`
- Included files: 책장(`bookcaseBooks_E`), 진열장(`displayCase_E`, `displayCaseBooks_E`), 책상(`desk-table`), 열린 출입구(`wallDoorway_E`) PNG
- Modification: 원본 PNG를 변경하지 않고 방향 세트 중 `_E`만 추출한 뒤 역할 기준으로 파일명을 바꿨다.

## Kenney UI Pack - Pixel Adventure 1.0

- License: CC0 1.0
- Official source: https://kenney.nl/assets/ui-pack-pixel-adventure
- Source ZIP SHA-256: `0b0ed4802ebcfff5e44e370f394baa1d751862a5a4a7612ac4ce84e85faa0627`
- Included files: 기본/보조 버튼, 토글 스위치 PNG
- Modification: 원본 PNG를 변경하지 않고 필요한 파일만 추출했다.

## Kenney Game Icons 1.0

- License: CC0 1.0
- Official source: https://kenney.nl/assets/game-icons
- Source ZIP SHA-256: `7a86d8d58e0b851e22004b3c70bf90b003632bbf9ac633424daa3bb17d9e7e4e`
- Included files: 체크, 확대, 질문 아이콘 PNG
- Modification: 16px 픽셀 그리드에 맞춰 최근접 보간으로 축소했다.

## Mansion Demo (edomin)

- License: CC0 1.0
- Official source: https://opengameart.org/content/mansion-demo
- Included files: 닫힌 출구 문 PNG
- Modification: 640x64 문 스프라이트 시트에서 64x64 프레임 하나를 잘라냈다.

## Keys (SomebodyLarr) / RPG Pixel Art Pack (Delta12 Studio)

- License: CC0 1.0
- Official source: https://opengameart.org/content/keys-1 , https://opengameart.org/content/rpg-pixel-art-pack
- Source ZIP SHA-256: `61d582e0370f3da99331a5f28a734c12680e91a7b4e72814f43bb9d535fa130f` (keys)
- Included files: 서랍 열쇠, 금고 손잡이·기어, 출구 열쇠, 잠김/열림 자물쇠 PNG
- Modification: 원본 PNG를 변경하지 않고 필요한 파일만 추출했다.

## CC0 Book & Document Icons (AntumDeluge)

- License: CC0 1.0
- Official source: https://opengameart.org/content/cc0-document-icons , https://opengameart.org/content/cc0-book-icons
- Included files: 액세스 문서, 단서 문서, 봉투, 책 PNG
- Modification: 원본 PNG를 변경하지 않고 필요한 파일만 추출했다.

## USB compatible plug sprites (knekko)

- License: CC0 1.0
- Official source: https://opengameart.org/content/usb-compatible-plug-sprites
- Source PNG SHA-256: `d5ba19d724908c8865fb64e70e541cb6e04782c3f1311bbbb43be632d3f3db04`
- Included files: 전원 퓨즈, 금고 전원 코어 PNG
- Modification: 원본 스프라이트 시트에서 개별 프레임을 잘라냈다.

## 더 이상 렌더링에 사용하지 않는 파일

`apps/web/assets/third-party/kenney/`의 Furniture Kit·UI Pack 2.0 PNG는 픽셀 에셋으로 교체되기 전까지 쓰이던 3D 렌더 이미지다. 현재 `asset-catalog.js`는 이 파일들을 참조하지 않는다. 롤백 가능성을 위해 남겨 두었으므로, 되돌릴 계획이 없다면 디렉터리째 삭제해도 게임 동작과 테스트에 영향이 없다.

Kenney 공식 지원 문서와 OpenGameArt CC0 표기에 따르면 위 에셋은 상업적 사용과 수정이 가능하고 출처 표기는 의무가 아니다. 이 프로젝트는 검증 가능성을 위해 출처와 버전을 명시한다.
