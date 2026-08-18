const pixelUrl = (category, fileName) =>
  new URL(`./assets/third-party/pixel/${category}/${fileName}`, import.meta.url).href;

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
  isometricLibrary: Object.freeze({
    name: "Kenney Isometric Miniature Library",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://kenney.nl/assets/isometric-miniature-library",
  }),
  uiPackPixelAdventure: Object.freeze({
    name: "Kenney UI Pack - Pixel Adventure",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://kenney.nl/assets/ui-pack-pixel-adventure",
  }),
  gameIcons: Object.freeze({
    name: "Kenney Game Icons",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://kenney.nl/assets/game-icons",
  }),
  mansionDemo: Object.freeze({
    name: "Mansion Demo (edomin)",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://opengameart.org/content/mansion-demo",
  }),
  pixelKeys: Object.freeze({
    name: "Keys (SomebodyLarr) / RPG Pixel Art Pack (Delta12)",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://opengameart.org/content/keys-1",
  }),
  pixelDocuments: Object.freeze({
    name: "CC0 Book & Document Icons (AntumDeluge)",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://opengameart.org/content/cc0-document-icons",
  }),
  usbDevices: Object.freeze({
    name: "USB compatible plug sprites (knekko)",
    version: "1.0",
    license: "CC0-1.0",
    sourceUrl: "https://opengameart.org/content/usb-compatible-plug-sprites",
  }),
});

export const OVERVIEW_OBJECT_ASSETS = Object.freeze({
  bookshelf: Object.freeze({
    kind: "image",
    src: pixelUrl("objects", "bookcase-books.png"),
    alt: "책이 꽂힌 책장",
    source: "isometricLibrary",
  }),
  wall: Object.freeze({
    kind: "image",
    src: pixelUrl("objects", "display-case-books.png"),
    alt: "기록물이 전시된 진열장",
    source: "isometricLibrary",
  }),
  drawer: Object.freeze({
    kind: "image",
    src: pixelUrl("objects", "display-case.png"),
    alt: "잠긴 유리 보관장",
    source: "isometricLibrary",
  }),
  desk: Object.freeze({
    kind: "image",
    src: pixelUrl("objects", "desk-table.png"),
    alt: "분석용 책상",
    source: "isometricLibrary",
  }),
});

export const EXIT_DOOR_ASSETS = Object.freeze({
  locked: Object.freeze({
    kind: "image",
    src: pixelUrl("exit", "door-closed.png"),
    pixelArt: true,
    alt: "닫힌 출구 문",
    source: "mansionDemo",
  }),
  unlocked: Object.freeze({
    kind: "image",
    src: pixelUrl("exit", "doorway-open.png"),
    alt: "열린 출구 문",
    source: "isometricLibrary",
  }),
});

export const ITEM_ASSETS = Object.freeze({
  "wall-access-card": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "wall-access-card.png"),
    pixelArt: true,
    alt: "SWE 보드 액세스 카드",
    source: "pixelDocuments",
  }),
  "drawer-key": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "drawer-key.png"),
    pixelArt: true,
    alt: "황동 서랍 열쇠",
    source: "pixelKeys",
  }),
  "desk-power-fuse": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "desk-power-fuse.png"),
    pixelArt: true,
    alt: "분석 책상 전원 퓨즈",
    source: "usbDevices",
  }),
  "safe-handle": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "safe-handle.png"),
    pixelArt: true,
    alt: "금고 회전 손잡이",
    source: "pixelKeys",
  }),
  "safe-gear": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "safe-gear.png"),
    pixelArt: true,
    alt: "금고 잠금 기어",
    source: "pixelKeys",
  }),
  "safe-power-core": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "safe-power-core.png"),
    pixelArt: true,
    alt: "금고 전원 코어",
    source: "usbDevices",
  }),
  "exit-keycard": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "exit-keycard.png"),
    pixelArt: true,
    alt: "비상구 키카드",
    source: "pixelKeys",
  }),
  key: Object.freeze({
    kind: "image",
    src: pixelUrl("items", "key.png"),
    pixelArt: true,
    alt: "은빛 열쇠",
    source: "pixelKeys",
  }),
  "message-card": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "message-card.png"),
    pixelArt: true,
    alt: "봉인된 쪽지",
    source: "pixelDocuments",
  }),
  "story-card": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "story-card.png"),
    pixelArt: true,
    alt: "이야기 단서 카드",
    source: "pixelDocuments",
  }),
  book: Object.freeze({
    kind: "image",
    src: pixelUrl("items", "book.png"),
    pixelArt: true,
    alt: "책",
    source: "pixelDocuments",
  }),
  "concept-token": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "concept-token.png"),
    pixelArt: true,
    alt: "완료 배지",
    source: "gameIcons",
  }),
  "exit-key": Object.freeze({
    kind: "image",
    src: pixelUrl("items", "exit-key.png"),
    pixelArt: true,
    alt: "출구 열쇠",
    source: "pixelKeys",
  }),
});

export const UI_ASSETS = Object.freeze({
  buttonWide: pixelUrl("ui", "button-wide.png"),
  buttonSquare: pixelUrl("ui", "button-square.png"),
  toggleHandle: pixelUrl("ui", "toggle-handle.png"),
  check: pixelUrl("ui", "check.png"),
  locked: pixelUrl("ui", "locked.png"),
  unlocked: pixelUrl("ui", "unlocked.png"),
  zoom: pixelUrl("ui", "zoom.png"),
  question: pixelUrl("ui", "question.png"),
  exit: pixelUrl("ui", "exit.png"),
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
