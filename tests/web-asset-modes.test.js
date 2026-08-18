import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ASSET_MODES,
  getAssetMode,
  getExitDoorAsset,
  getItemAsset,
  getOverviewObjectAsset,
  setAssetMode,
  SUPPORTED_ASSET_MODES,
  UI_ASSETS,
} from "../apps/web/asset-catalog.js";

const assetUrl = (path) => new URL(`../apps/web/assets/${path}`, import.meta.url).href;

const jsonResponse = (value, ok = true) => ({
  ok,
  async json() {
    return value;
  },
});

test("checked-in mode manifests are empty, parseable contracts", async () => {
  for (const mode of ["2d", "3d"]) {
    const path = new URL(`../apps/web/assets/${mode}/manifest.json`, import.meta.url);
    const manifest = JSON.parse(await readFile(path, "utf8"));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.mode, mode);
    assert.deepEqual(manifest.objects, {});
    assert.deepEqual(manifest.items, {});
    assert.deepEqual(manifest.exit, {});
  }
});

test("mode API resolves valid descriptors and falls back per invalid or absent entry", async () => {
  const originalFetch = globalThis.fetch;
  const originalUiAssets = { ...UI_ASSETS };

  globalThis.fetch = async (url) => {
    if (String(url).includes("/assets/3d/")) {
      return jsonResponse({
        mode: "3d",
        objects: {
          bookshelf: {
            kind: "model",
            src: "./objects/bookshelf.glb",
            poster: "./objects/bookshelf-poster.png",
            alt: "3D 책장",
          },
          wall: { kind: "image", src: "./objects/wall.png", alt: "잘못된 종류" },
        },
        items: {},
        exit: {
          unlocked: {
            kind: "model",
            src: "./exit/open.glb",
            alt: "열린 3D 출구",
          },
        },
      });
    }

    return jsonResponse({
      mode: "2d",
      objects: {
        bookshelf: {
          kind: "image",
          src: "./objects/bookshelf.png",
          alt: "2D 책장",
        },
        desk: {
          kind: "image",
          src: "../outside.png",
          alt: "디렉터리를 벗어나는 잘못된 경로",
        },
      },
      items: {
        book: { kind: "image", src: "./items/book.png", alt: "2D 책" },
      },
      exit: {},
    });
  };

  try {
    assert.deepEqual(ASSET_MODES, ["2d", "3d"]);
    assert.equal(SUPPORTED_ASSET_MODES, ASSET_MODES);

    assert.equal(await setAssetMode("3D"), "3d");
    assert.equal(getAssetMode(), "3d");
    assert.deepEqual(getOverviewObjectAsset("bookshelf"), {
      kind: "model",
      src: assetUrl("3d/objects/bookshelf.glb"),
      poster: assetUrl("3d/objects/bookshelf-poster.png"),
      alt: "3D 책장",
    });
    assert.equal(getOverviewObjectAsset("wall").kind, "image");
    assert.equal(getOverviewObjectAsset("wall").source, "isometricLibrary");
    assert.deepEqual(getExitDoorAsset(true), {
      kind: "model",
      src: assetUrl("3d/exit/open.glb"),
      alt: "열린 3D 출구",
    });
    assert.equal(getExitDoorAsset(false).source, "mansionDemo");

    assert.equal(await setAssetMode("not-a-mode"), "2d");
    assert.equal(getAssetMode(), "2d");
    assert.deepEqual(getOverviewObjectAsset("bookshelf"), {
      kind: "image",
      src: assetUrl("2d/objects/bookshelf.png"),
      alt: "2D 책장",
    });
    assert.deepEqual(getItemAsset("book"), {
      kind: "image",
      src: assetUrl("2d/items/book.png"),
      alt: "2D 책",
    });
    assert.equal(getOverviewObjectAsset("desk").source, "isometricLibrary");
    assert.equal(getItemAsset("__proto__"), null);
    assert.deepEqual(UI_ASSETS, originalUiAssets);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a missing manifest keeps the selected mode and every vendored fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(null, false);

  try {
    await setAssetMode("3d");
    assert.equal(getAssetMode(), "3d");
    assert.equal(getOverviewObjectAsset("bookshelf").source, "isometricLibrary");
    assert.equal(getItemAsset("book").source, "pixelDocuments");
    assert.equal(getExitDoorAsset(true).source, "isometricLibrary");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
