# Lecture Escape Pixel Item Assets

선별본은 이 라이브러리의 `items/`와 `devices/`에 복사했습니다. 원본 프로젝트 저장소는 수정하지 않았습니다.

All recommended files below are from sources that explicitly publish the work under Creative Commons Zero (CC0 1.0 / public domain dedication). Attribution is optional, but preserving this manifest is recommended.

## Recommended selections

| Category | Staged files | Format / size | Source and license |
|---|---|---|---|
| Physical keys, 8 colors | `items/keys/key-*-32.png` | PNG, 32x32, transparent | SomebodyLarr, [Keys](https://opengameart.org/content/keys-1), CC0. Original: `https://opengameart.org/sites/default/files/keys.zip` |
| Physical keys, 3 colors | `items/keys/key-gold-16.png`, `key-silver-16.png`, `key-bronze-16.png` | PNG, 16x16, transparent | Delta12 Studio, [Rpg Pixel Art Pack](https://opengameart.org/content/rpg-pixel-art-pack), CC0. Direct originals: `key_7.png`, `key1_3.png`, `key2_5.png` under `https://opengameart.org/sites/default/files/` |
| Books | `items/books/*.png` | 8 PNGs, 32x32, transparent | AntumDeluge, [CC0 Book Icons](https://opengameart.org/content/cc0-book-icons), CC0. Selected pack: `book-7soul1_20201212.zip` |
| Papers, clue notes, envelopes, map, scrolls | `items/documents/*.png` | 9 PNGs, 32x32, transparent | AntumDeluge, [CC0 Document Icons](https://opengameart.org/content/cc0-document-icons), CC0. Selected pack: `document-7soul1_20201222.zip` |
| Blank clue/story cards | `items/cards/card-*-blank.png` and source sheet | 5 cropped PNGs, 100x132; source PNG 720x613 | storiesstrauss, [Pixel Card Assets](https://opengameart.org/content/pixel-card-assets), CC0. Direct original: `pixelcardassest_v02.png` |
| Boxes and chest states | `items/storage/box.png`, `chest.png`, `chest_open.png` | PNG, 32x32, transparent | AntumDeluge, [CC0 Storage Icons](https://opengameart.org/content/cc0-storage-icons), CC0. Selected pack: `storage-7soul1_20201223.zip` |
| Animated chest opening | `items/storage/chest-opening-spritesheet.png`, `chest-open-frame-01.png` through `-07.png` | Source PNG 198x198; seven cropped 66x66 PNG frames | overactiongamestudio, [Animated 2D Chest Spritesheet](https://opengameart.org/content/animated-2d-chest-spritesheet), CC0. Direct original: `Chest-spritesheet.png` |
| Pixel padlock states | `items/locks/padlock-locked-gold-16.png`, `padlock-unlocked-iron-16.png` | PNG, 16x16, transparent | twiswist, [Inventory filter icons](https://opengameart.org/content/inventory-filter-icons), CC0. Direct original: `inventory_icons.zip` |
| Generic locked/unlocked indicators | `items/locks/padlock-*-black.png`, `padlock-*-white.png` | PNG, 50x50, transparent | Kenney, [Game Icons](https://opengameart.org/content/game-icons), CC0. Embedded `license.txt` retained in `_sources/extracted/kenney-game-icons/`; reserve UI silhouettes, not the preferred pixel padlocks |
| Toolboxes | `items/tools/toolbox-red-flat.png`, `toolbox-red-open.png` | PNG, 32x32, transparent | AntumDeluge/OpenClipart, [CC0 Tool Icons](https://opengameart.org/content/cc0-tool-icons), CC0. Selected pack: `tool-ocal_20230225.zip`; per-file OpenClipart URLs retained in `_sources/extracted/tools/tool-OCAL.txt` |
| USB / data-device candidates | `items/devices/usb-compatible-spritesheet.png`, `usb-device-01.png` through `-06.png` | Source PNG 95x64; six cropped transparent PNGs | knekko, [USB compatible plug sprites](https://opengameart.org/content/usb-compatible-plug-sprites), CC0, commercial use and no attribution explicitly allowed. Direct original: `usb-compatible-sprites_0.png` |

## Suggested in-project names

- `key-red.png`, `key-blue.png`, `key-gold.png`: recolor or select three of the 32x32 key set.
- `exit-key.png`: `key-yellow-long-32.png` or `key-gold-dark-32.png`.
- `keycard.png`: one of `card-blue-blank.png`, `card-red-blank.png`, or `card-yellow-blank.png` scaled with nearest-neighbor filtering.
- `story-card.png`: `card-gray-blank.png` or `document_02.png`.
- `message-card.png`: `envelope_02.png` or `scroll_open_02.png`.
- `safe-closed.png` / `safe-open.png`: use `chest.png` / `chest_open.png` as the closest same-style lockbox candidate.
- `agent-toolbox.png`: `toolbox-red-open.png`.
- `usb-key.png`: `usb-device-01.png` through `usb-device-06.png`; keep the sheet available if a different plug orientation is needed.

## Derived-file notes

- The five blank card files are lossless crops from the CC0 card sheet at x positions 14, 133, 252, 366, and 482; each crop is 100x132.
- Chest animation frames are lossless 66x66 row-major crops from the CC0 198x198 sheet. Frame 01 through 07 follow the source layout.
- USB candidates are lossless crops of the top row of the CC0 source sheet.
- All other recommended files are unmodified individual PNGs, only copied and given clearer filenames where needed.

## Reserves / not recommended

- `_sources/kenney_roguelike-rpg-pack.zip` is verified CC0 but contains a monolithic tilesheet; it is retained as a reserve and no tiles from it are in the recommended selection.
- `_sources/geralds-keys.zip` is CC0 but contains keyboard-button prompts, not physical door keys, so it should not be used for the escape-room key object.
- No CC-BY, CC-BY-SA, GPL, OGA-BY, or license-unclear files were admitted to the recommended folders.
