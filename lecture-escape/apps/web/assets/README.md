# 2D/3D asset manifest contract

The runtime keeps the checked-in Kenney images as its baseline. The optional
`2d/manifest.json` and `3d/manifest.json` files replace only the entries that
they define; a missing manifest, invalid descriptor, or missing key falls back
to the matching Kenney asset.

No replacement image or model files are included yet. Upload them beside the
manifest for their mode, then add only relative paths that stay inside that
directory.

## Manifest shape

Both manifests use the same top-level sections:

```json
{
  "schemaVersion": 1,
  "mode": "2d",
  "objects": {},
  "items": {},
  "exit": {}
}
```

- `objects` overrides overview furniture. Current keys are `bookshelf`,
  `wall`, `drawer`, and `desk`.
- `items` overrides an item's `assetKey`, such as `book` or
  `exit-keycard`.
- `exit` accepts `locked` and `unlocked`.
- `UI_ASSETS` is intentionally not mode-specific and continues to use Kenney.

Every 2D entry is an accessible image descriptor:

```json
{
  "kind": "image",
  "src": "./objects/bookshelf.png",
  "alt": "강의 자료가 꽂힌 책장"
}
```

Every 3D entry is a model descriptor. A poster is optional, but recommended so
the UI can show an accessible loading and fallback image:

```json
{
  "kind": "model",
  "src": "./objects/bookshelf.glb",
  "poster": "./objects/bookshelf-poster.png",
  "alt": "강의 자료가 꽂힌 3D 책장"
}
```

`kind`, `src`, and non-empty `alt` are required. A 3D `poster`, when present,
must also be valid. Paths must be relative, must not contain a parent `..`
segment, and must not be an absolute URL, query, or fragment. Invalid entries
are ignored independently so one bad upload does not disable other overrides.

## Runtime integration

Call and await `setAssetMode("2d" | "3d")`, then render again using
`getOverviewObjectAsset`, `getItemAsset`, and `getExitDoorAsset`. Inspect the
returned descriptor's `kind`: render `image` descriptors as images and `model`
descriptors with the chosen 3D viewer. `getAssetMode()` reports the active mode;
unsupported values normalize to `2d`.
