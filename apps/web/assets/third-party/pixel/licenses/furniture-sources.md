# Lecture Escape — CC0 pixel-art furniture staging

Use only the contents of `packs/`. Every adopted pack below is explicitly marked CC0 on its original OpenGameArt submission; the primary Cool School archive also ships its own CC0 license file. `SOURCE.md` in each pack records the source/download URL, author, license, format check, and useful contents.

## Recommended adoption order

1. `packs/cool-school/` — primary coherent 48px classroom set. Includes wall/floor autotiles, bookcases, cabinets/drawers, student and teacher desks, chairs, two blackboards, windows, computers, books and papers. The author's `0_license_CC0.txt` is preserved.
2. `packs/isometric-furniture-walls/` — best perspective match for the current isometric scene. Includes bookshelf, tables/desks, cabinets/wardrobes/dressers, chairs, rugs, floor tiles and walls.
3. `packs/mansion-demo/` — best individually named sprites. Includes `bookshelf.png`, `cabinet.png`, `door.png` with ten door/state frames, three table files, armchairs, books, chest and wall/floor `tileset.png`.
4. `packs/furniture-for-nobles/` — detailed top-down bookcases, desks, chairs, shelving and drawer/cupboard furniture.
5. `packs/modern-houses/` — modern door, wall, floor, window, stair and cabinet/appliance construction pieces.
6. `packs/wall-door-16x16/` and `packs/indoors-tileset/` — small fallback sheets only.

## Verification summary

| Pack | Actual payload | Integrity/format | License evidence |
|---|---|---|---|
| Cool School | ZIP + RGBA PNGs | ZIP test passed; 384x576 main sheet; 768px RPG Maker sheets | embedded `0_license_CC0.txt` + source page CC0 |
| Isometric Furniture and Walls | 320x960 RGBA PNG | PNG signature verified | source page CC0 |
| Mansion Demo | ZIP with 20 RGBA PNGs | ZIP test passed; all entries verified | source page CC0 |
| Furniture for Nobles | 768x768 RGBA PNG | PNG signature verified | source page CC0 and page text "Licensed via CC0" |
| Modern Houses | 768x512 RGBA PNG | PNG signature verified | source page and copyright notice explicitly CC0 |
| Wall & Door | 48x64 RGBA PNG | PNG signature verified | source page CC0 |
| Indoors Tileset | 256x256 RGBA PNG | PNG signature verified | source page CC0 |

## SHA-256 checksums

```text
fc01a936f8794b1a43a830c4f28309941f52a336456aed577f7f93c5211368dc  cool-school/source-coolschool_tileset_48px.zip
97a4c3f7064df9e4b80f8c392dce4788492dd8b8a06cd5d5f8f50b9047df487f  isometric-furniture-walls/furnitureandwalls.png
690600dfff3852d31d0ad51f1bba8090fbe4a0ece7e0f2cd1ec47ed406a78243  mansion-demo/source-mansion_demo.zip
a65bb23374804dd02fe126e09b67573f864cb07f5ee36345180fbf4588594ed0  furniture-for-nobles/furniturefornobles_mv_mz.png
45cba22b6c3caff4e70fe3b5570b862fa8b132ce2cc2fc3ae14468b7fc4af7ee  modern-houses/tiletest.png
3645635f635e27ecfeb158cbfcdb8e2bc524640e45ceea996905cf5a777017d0  wall-door-16x16/Tileset1.png
b031e80ac981727c0faa2bb7481eadb326a0cfa89c5aa6881026187c9fa50eab  indoors-tileset/tileset.png
```

## Excluded material

`_excluded_non_pixel/` contains downloaded CC0 classroom/blackboard references that were rejected because they are raster illustrations or textures rather than pixel art. Do not copy that directory into the project. `_downloads/` is raw download scratch space; the curated payload is `packs/`.

