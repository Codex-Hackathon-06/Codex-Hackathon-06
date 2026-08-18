import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  ASSET_SOURCES,
  getExitDoorAsset,
  getItemAsset,
  getOverviewObjectAsset,
  UI_ASSETS,
} from "../apps/web/asset-catalog.js";

async function assertLocalAssetExists(assetUrl) {
  const url = new URL(assetUrl);
  assert.equal(url.protocol, "file:");
  await access(url);
}

test("the catalog resolves distinct pixel furniture for every room object", async () => {
  const assets = ["bookshelf", "wall", "drawer", "desk"].map((viewId) =>
    getOverviewObjectAsset(viewId),
  );
  assert.equal(new Set(assets.map((asset) => asset.src)).size, 4);
  for (const asset of assets) await assertLocalAssetExists(asset.src);
});

test("closed and open exits are separate pixel assets", async () => {
  const locked = getExitDoorAsset(false);
  const unlocked = getExitDoorAsset(true);
  assert.notEqual(locked.src, unlocked.src);
  await assertLocalAssetExists(locked.src);
  await assertLocalAssetExists(unlocked.src);
});

test("concrete reward objects and UI controls resolve to checked-in CC0 files", async () => {
  for (const key of [
    "wall-access-card",
    "drawer-key",
    "desk-power-fuse",
    "safe-handle",
    "safe-gear",
    "safe-power-core",
    "exit-keycard",
  ]) {
    const asset = getItemAsset(key);
    assert.ok(asset, `${key} should resolve`);
    await assertLocalAssetExists(asset.src);
  }
  for (const assetUrl of Object.values(UI_ASSETS)) await assertLocalAssetExists(assetUrl);
});

test("every assetKey used by a shipped room pack resolves to a checked-in file", async () => {
  const packDirectory = new URL("../content/sample-lectures/", import.meta.url);
  const packNames = (await readdir(packDirectory)).filter((name) =>
    name.endsWith(".room.json"),
  );
  assert.ok(packNames.length > 0);

  for (const packName of packNames) {
    const pack = JSON.parse(await readFile(new URL(packName, packDirectory), "utf8"));
    for (const item of pack.items ?? []) {
      const asset = getItemAsset(item.assetKey);
      assert.ok(asset, `${packName}: ${item.assetKey} should resolve`);
      await assertLocalAssetExists(asset.src);
    }
  }
});

test("all vendored packs declare their official source and CC0 license", () => {
  for (const source of Object.values(ASSET_SOURCES)) {
    assert.equal(source.license, "CC0-1.0");
    assert.match(source.sourceUrl, /^https:\/\/(kenney\.nl|opengameart\.org)\//);
  }
  assert.equal(getItemAsset("unknown-key"), null);
});
