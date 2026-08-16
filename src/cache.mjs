import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { writeJsonAtomic } from "./transcript.mjs";

export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}

export function transcriptPaths(cacheRoot, sourceSha256) {
  const directory = join(resolve(cacheRoot), sourceSha256);
  return {
    directory,
    raw: join(directory, "transcript.raw.json"),
    chunks: join(directory, "transcript.chunks.json"),
    srt: join(directory, "transcript.srt"),
    manifest: join(directory, "manifest.json"),
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function hasCompleteCache(paths) {
  return (
    (await exists(paths.raw)) &&
    (await exists(paths.chunks)) &&
    (await exists(paths.srt)) &&
    (await exists(paths.manifest))
  );
}

export async function readCache(paths) {
  const [chunks, manifest] = await Promise.all([
    readFile(paths.chunks, "utf8").then(JSON.parse),
    readFile(paths.manifest, "utf8").then(JSON.parse),
  ]);
  return { chunks, manifest };
}

export async function writeCacheIndex(cacheRoot, sourceSha256, manifest) {
  await mkdir(cacheRoot, { recursive: true });
  const indexPath = join(resolve(cacheRoot), "index.json");
  let index = { version: 1, entries: {} };
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  index.version = 1;
  index.entries ??= {};
  index.entries[sourceSha256] = {
    sourceFileName: manifest.sourceFileName,
    transcriptDirectory: sourceSha256,
    createdAt: manifest.createdAt,
  };
  await writeJsonAtomic(indexPath, index);
}

export async function buildManifest(inputPath, audioPath, sourceSha256) {
  const info = await stat(inputPath);
  return {
    version: 1,
    sourceSha256,
    sourceFileName: basename(inputPath),
    sourceSizeBytes: info.size,
    audioFileName: basename(audioPath),
    model: "whisper-1",
    language: "ko",
    createdAt: new Date().toISOString(),
  };
}

