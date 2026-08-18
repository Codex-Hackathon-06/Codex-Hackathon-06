# Lecture Escape — Pixel UI source manifest

Original staging root: `/private/tmp/lecture-assets-ui`

네이티브 픽셀 선별본은 이 라이브러리의 `ui/`에 복사했습니다. 원본 프로젝트 저장소는 수정하지 않았습니다. 네이티브 픽셀아트가 아닌 50px 확대/축소 아이콘은 `_staging/reserves/non-native-pixel-ui/`에 참고용으로만 보존했습니다.

## Verified sources

### 1. Kenney Pixel UI Pack 1.0

- Source page: https://kenney.nl/assets/pixel-ui-pack
- Downloaded archive: `downloads/kenney_pixel-ui-pack.zip`
- Official archive URL: https://kenney.nl/media/pages/assets/pixel-ui-pack/821e760f21-1677661508/kenney_pixel-ui-pack.zip
- Extracted to: `extracted/kenney_pixel-ui-pack/`
- Format: PNG; 16 x 16 tile spritesheets, transparent spritesheet, and 9-slice PNG panels
- License: Creative Commons Zero (CC0 1.0). The bundled `License.txt` permits personal and commercial use and does not require credit.
- Bundled license copy: `selected/licenses/kenney-pixel-ui-pack-CC0.txt`
- Best use here: resizable dialog/panel backgrounds and the complete legacy pixel UI spritesheet

### 2. Kenney UI Pack - Pixel Adventure 1.0/2.0 archive

- Source page: https://kenney.nl/assets/ui-pack-pixel-adventure
- Downloaded archive: `downloads/kenney_ui-pack-pixel-adventure.zip`
- Official archive URL: https://kenney.nl/media/pages/assets/ui-pack-pixel-adventure/405ba5278a-1729196257/kenney_ui-pack-pixel-adventure.zip
- Extracted to: `extracted/kenney_ui-pack-pixel-adventure/`
- Format: PNG; individual 16 x 16 and larger UI tiles, plus packed/unpacked tilesheets
- License: Creative Commons Zero (CC0 1.0). The bundled `License.txt` permits personal, educational, and commercial use; credit is optional.
- Bundled license copy: `selected/licenses/kenney-ui-pack-pixel-adventure-CC0.txt`
- Best use here: buttons, inventory slots, keypad backgrounds, switches, alerts

### 3. Kenney 1-Bit Pack 1.2

- Source page: https://kenney.nl/assets/1-bit-pack
- Downloaded archive: `downloads/kenney_1-bit-pack.zip`
- Official archive URL: https://kenney.nl/media/pages/assets/1-bit-pack/aa867a1f37-1677578516/kenney_1-bit-pack.zip
- Extracted to: `extracted/kenney_1-bit-pack/`
- Format: PNG; 49 x 22 tilesheet of 1,078 individual 16 x 16 tiles, colored/monochrome and transparent variants
- License: Creative Commons Zero (CC0 1.0). The bundled `License.txt` permits personal, educational, and commercial use; credit is optional.
- Bundled license copy: `selected/licenses/kenney-1-bit-pack-CC0.txt`
- Best use here: future keypad numerals, key symbols, object/status glyphs from `selected/spritesheets/one-bit-pack-16px.png`

### 4. Kenney Game Icons (supplemental symbols)

- Official source page: https://kenney.nl/assets/game-icons
- Verified mirror page: https://opengameart.org/content/game-icons
- Downloaded archive: `downloads/kenney_game-icons.zip`
- Download mirror URL: https://opengameart.org/sites/default/files/Kenney_gameIcons.zip
- Extracted to: `extracted/kenney_game-icons/`
- Format: separate 50 x 50 and 100 x 100 PNG icons (black/white), spritesheets, and vector sources
- License: Creative Commons Zero (CC0 1.0). The bundled `license.txt` permits personal and commercial use; credit is optional.
- Bundled license copy: `selected/licenses/kenney-game-icons-CC0.txt`
- Conversion note: lock, plain zoom, hint, status, and navigation candidates with a `-16px` suffix were resized from the white 50 x 50 PNGs with nearest-neighbor sampling. Zoom-in and zoom-out are not part of the curated `ui/` set because 50→16 sampling removes their small `+`/`−` marks; untouched 50px originals are retained only under `_staging/reserves/non-native-pixel-ui/`.

## Selected candidates and recommended names

### Buttons

- `selected/buttons/button-primary.png` — default action button
- `selected/buttons/button-primary-cross.png` — disabled/cancelled primary button
- `selected/buttons/button-danger.png` — destructive/error button
- `selected/buttons/button-danger-cross.png` — blocked/failed action
- `selected/buttons/button-neutral.png` — neutral keypad/dialog action
- `selected/buttons/button-neutral-cross.png` — neutral cancel state

### Panels

- `selected/panels/panel-9slice-blue.png` — main dialog/puzzle panel
- `selected/panels/panel-9slice-blue-pressed.png` — active/pressed panel
- `selected/panels/panel-9slice-grey.png` — inactive panel
- `selected/panels/panel-9slice-yellow.png` — clue/highlight panel
- `selected/panels/panel-list-9slice.png` — inventory/list container

### Inventory slots

- `selected/inventory/slot-empty-blue.png` — empty transparent slot
- `selected/inventory/slot-filled-blue.png` — occupied slot background
- `selected/inventory/slot-highlight-gold.png` — selected/rare item slot
- `selected/inventory/slot-ornate-gold.png` — ornate item frame
- `selected/inventory/slot-ornate-highlight.png` — ornate selected state

### Lock, unlock, and result status

- `selected/status/lock-closed-16px.png` — locked drawer/door
- `selected/status/lock-open-16px.png` — unlocked drawer/door
- `selected/status/checkmark-16px.png` — solved/accepted
- `selected/status/cross-16px.png` — incorrect/rejected
- `selected/status/status-alert-red.png` — compact red alert glyph
- `selected/status/status-plus-red.png` — red interaction/health-style glyph

### Hint and zoom

- `selected/hints/hint-exclamation-yellow.png` — strict native 16 px pixel alert
- `selected/hints/hint-plus-yellow.png` — strict native 16 px add/inspect marker
- `selected/hints/hint-question-16px.png` — question/hint action
- `selected/hints/hint-info-16px.png` — information/clue action
- `selected/hints/zoom-16px.png` — inspect/zoom
- 확대/축소 원본은 네이티브 픽셀아트가 아니므로 최종 `ui/`에서 제외했습니다.

### Keypad

- `selected/keypad/keypad-key-idle.png` — 16 px key background
- `selected/keypad/keypad-key-pressed.png` — pressed key background
- Recommendation: render digits as text or crop the digit row from `selected/spritesheets/one-bit-pack-16px.png`; the backgrounds remain reusable for every digit.

### Switches

- `selected/switches/switch-round-off.png` / `switch-round-on.png` — blue off/on pair
- `selected/switches/switch-round-off-gold.png` / `switch-round-on-gold.png` — gold off/on pair

### Navigation

- `selected/navigation/arrow-left-16px.png`
- `selected/navigation/arrow-right-16px.png`
- `selected/navigation/arrow-up-16px.png`
- `selected/navigation/arrow-down-16px.png`

### Full sheets retained

- `selected/spritesheets/pixel-ui-sheet-16px.png`
- `selected/spritesheets/pixel-adventure-small-thin.png`
- `selected/spritesheets/one-bit-pack-16px.png`

## Duplicate audit

- The erroneous `zoom-in-16px.png` / `zoom-out-16px.png` pair was identical because nearest-neighbor 50→16 downsampling discarded both small interior marks. They are excluded from the final library.
- `selected/inventory/slot-filled-blue.png` and `selected/keypad/keypad-key-idle.png` intentionally share the same source tile (`tile_0012.png`). They are semantic aliases in separate usage folders, not a conversion collision.

## Rendering note

Display native 16 px assets at integer scales (2x, 3x, 4x) with `image-rendering: pixelated` or the engine equivalent. Do not bilinearly scale them. If zoom-in/out controls are needed, redraw the reserved 50px references on a 16px grid before mixing them with the native pixel set. Use the thin-outline Pixel Adventure set consistently; mixing thick and thin outlines in one screen will look uneven.
