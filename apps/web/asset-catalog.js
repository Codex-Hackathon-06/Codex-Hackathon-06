const kenneyUrl = (pack, fileName) =>
  new URL(`./assets/third-party/kenney/${pack}/${fileName}`, import.meta.url).href;

export const ASSET_MODES = Object.freeze(["2d", "3d"]);
export const SUPPORTED_ASSET_MODES = ASSET_MODES;

const ASSET_MODE_MANIFEST_URLS = Object.freeze({
  "2d": new URL("./assets/2d/manifest.json", import.meta.url),
  "3d": new URL("./assets/3d/manifest.json", import.meta.url),
});

const EMPTY_ASSET_OVERRIDES = Object.freeze({
  objects: Object.freeze({}),
  items: Object.freeze({}),
  exit: Object.freeze({}),
});

let activeAssetMode = "2d";
let activeAssetOverrides = EMPTY_ASSET_OVERRIDES;
let latestAssetModeRequest = 0;

function normalizeAssetMode(mode) {
  const normalized = String(mode ?? "").trim().toLowerCase();
  return ASSET_MODES.includes(normalized) ? normalized : "2d";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOwnAsset(collection, key) {
  return Object.prototype.hasOwnProperty.call(collection, key)
    ? collection[key]
    : null;
}

function resolveManifestAssetUrl(path, manifestUrl) {
  if (typeof path !== "string" || !path.trim()) return null;

  const rawPath = path.trim();
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (
    rawPath.startsWith("/") ||
    rawPath.includes("\\") ||
    /^[a-z][a-z\d+.-]*:/i.test(rawPath) ||
    decodedPath.split(/[\\/]/).includes("..")
  ) {
    return null;
  }

  try {
    const manifestDirectory = new URL(".", manifestUrl);
    const resolved = new URL(rawPath, manifestUrl);
    if (
      resolved.protocol !== manifestDirectory.protocol ||
      resolved.host !== manifestDirectory.host ||
      !resolved.pathname.startsWith(manifestDirectory.pathname) ||
      resolved.pathname === manifestDirectory.pathname ||
      resolved.search ||
      resolved.hash
    ) {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

function parseManifestDescriptor(value, mode, manifestUrl) {
  if (!isRecord(value)) return null;

  const expectedKind = mode === "3d" ? "model" : "image";
  const alt = typeof value.alt === "string" ? value.alt.trim() : "";
  const src = resolveManifestAssetUrl(value.src, manifestUrl);
  if (value.kind !== expectedKind || !src || !alt) return null;

  if (mode === "3d" && value.poster !== undefined) {
    const poster = resolveManifestAssetUrl(value.poster, manifestUrl);
    if (!poster) return null;
    return Object.freeze({ kind: expectedKind, src, poster, alt });
  }

  return Object.freeze({ kind: expectedKind, src, alt });
}

function parseManifestSection(section, mode, manifestUrl) {
  if (!isRecord(section)) return Object.freeze({});

  return Object.freeze(
    Object.fromEntries(
      Object.entries(section).flatMap(([key, value]) => {
        const descriptor = parseManifestDescriptor(value, mode, manifestUrl);
        return descriptor && key.trim() ? [[key, descriptor]] : [];
      }),
    ),
  );
}

function parseAssetManifest(manifest, mode, manifestUrl) {
  if (!isRecord(manifest)) return EMPTY_ASSET_OVERRIDES;
  if (manifest.schemaVersion !== undefined && manifest.schemaVersion !== 1) {
    return EMPTY_ASSET_OVERRIDES;
  }
  if (manifest.mode !== undefined && String(manifest.mode).toLowerCase() !== mode) {
    return EMPTY_ASSET_OVERRIDES;
  }

  return Object.freeze({
    objects: parseManifestSection(manifest.objects, mode, manifestUrl),
    items: parseManifestSection(manifest.items, mode, manifestUrl),
    exit: parseManifestSection(manifest.exit, mode, manifestUrl),
  });
}

export function getAssetMode() {
  return activeAssetMode;
}

export async function setAssetMode(mode) {
  const nextMode = normalizeAssetMode(mode);
  const requestId = ++latestAssetModeRequest;
  const manifestUrl = ASSET_MODE_MANIFEST_URLS[nextMode];
  let overrides = EMPTY_ASSET_OVERRIDES;

  try {
    const response = await globalThis.fetch(manifestUrl.href, { cache: "no-store" });
    if (response.ok) {
      overrides = parseAssetManifest(await response.json(), nextMode, manifestUrl);
    }
  } catch {
    // Missing or malformed optional manifests intentionally retain Kenney fallbacks.
  }

  if (requestId === latestAssetModeRequest) {
    activeAssetMode = nextMode;
    activeAssetOverrides = overrides;
  }

  return nextMode;
}

export const ASSET_SOURCES = Object.freeze({
  furnitureKit: Object.freeze({
    name: "Kenney Furniture Kit",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://kenney.nl/assets/furniture-kit",
  }),
  uiPack: Object.freeze({
    name: "Kenney UI Pack",
    version: "2.0",
    license: "CC0-1.0",
    sourceUrl: "https://kenney.nl/assets/ui-pack",
  }),
  gameIcons: Object.freeze({
    name: "Kenney Game Icons",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://kenney.nl/assets/game-icons",
  }),
});

export const OVERVIEW_OBJECT_ASSETS = Object.freeze({
  bookshelf: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "bookcaseOpen_NE.png"),
    alt: "열린 책장",
    source: "furnitureKit",
  }),
  wall: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "cabinetTelevision_NE.png"),
    alt: "화면이 달린 기록 보드",
    source: "furnitureKit",
  }),
  drawer: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "sideTableDrawers_NE.png"),
    alt: "여러 칸 서랍장",
    source: "furnitureKit",
  }),
  desk: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "desk_NE.png"),
    alt: "연구용 책상",
    source: "furnitureKit",
  }),
});

export const EXIT_DOOR_ASSETS = Object.freeze({
  locked: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "doorway_NE.png"),
    alt: "닫힌 출구 문",
    source: "furnitureKit",
  }),
  unlocked: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "doorwayOpen_NE.png"),
    alt: "열린 출구 문",
    source: "furnitureKit",
  }),
});

export const ITEM_ASSETS = Object.freeze({
  "console-keyboard": Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "computerKeyboard_NE.png"),
    alt: "실행 콘솔 키보드",
    source: "furnitureKit",
  }),
  "repository-books": Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "books_NE.png"),
    alt: "저장소 기록책 묶음",
    source: "furnitureKit",
  }),
  "terminal-monitor": Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "computerScreen_NE.png"),
    alt: "터미널 모니터",
    source: "furnitureKit",
  }),
  "evaluation-report": Object.freeze({
    kind: "image",
    src: kenneyUrl("ui-pack", "button_rectangle_depth_gradient.png"),
    alt: "평가 지표 리포트 카드",
    source: "uiPack",
  }),
  "exit-keycard": Object.freeze({
    kind: "image",
    src: kenneyUrl("game-icons", "exit.png"),
    alt: "비상구 키카드",
    source: "gameIcons",
  }),
  book: Object.freeze({
    kind: "image",
    src: kenneyUrl("furniture-kit", "books_NE.png"),
    alt: "책 묶음",
    source: "furnitureKit",
  }),
  "concept-token": Object.freeze({
    kind: "image",
    src: kenneyUrl("ui-pack", "check_round_color.png"),
    alt: "완료 배지",
    source: "uiPack",
  }),
  "exit-key": Object.freeze({
    kind: "image",
    src: kenneyUrl("game-icons", "exit.png"),
    alt: "출구 아이콘",
    source: "gameIcons",
  }),
});

export const UI_ASSETS = Object.freeze({
  buttonWide: kenneyUrl("ui-pack", "button_rectangle_depth_gradient.png"),
  buttonSquare: kenneyUrl("ui-pack", "button_square_depth_gradient.png"),
  toggleHandle: kenneyUrl("ui-pack", "slide_hangle.png"),
  check: kenneyUrl("game-icons", "checkmark.png"),
  locked: kenneyUrl("game-icons", "locked.png"),
  unlocked: kenneyUrl("game-icons", "unlocked.png"),
  zoom: kenneyUrl("game-icons", "zoomIn.png"),
  question: kenneyUrl("game-icons", "question.png"),
  exit: kenneyUrl("game-icons", "exit.png"),
});

export function getOverviewObjectAsset(viewId) {
  const normalized = String(viewId ?? "").toLowerCase();
  const key = Object.keys(OVERVIEW_OBJECT_ASSETS).find((candidate) =>
    normalized.includes(candidate),
  );
  return key
    ? getOwnAsset(activeAssetOverrides.objects, key) ?? OVERVIEW_OBJECT_ASSETS[key]
    : null;
}

export function getExitDoorAsset(unlocked = false) {
  const key = unlocked ? "unlocked" : "locked";
  return getOwnAsset(activeAssetOverrides.exit, key) ?? EXIT_DOOR_ASSETS[key];
}

export function getItemAsset(assetKey) {
  return (
    getOwnAsset(activeAssetOverrides.items, assetKey) ??
    getOwnAsset(ITEM_ASSETS, assetKey)
  );
}
