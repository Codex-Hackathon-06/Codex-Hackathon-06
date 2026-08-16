import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hasCompleteCache, sha256File, transcriptPaths } from "../src/cache.mjs";
import { writeJsonAtomic } from "../src/transcript.mjs";

test("content hash is stable and selects a deterministic cache directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lecscape-stt-"));
  const source = join(directory, "lecture.mp4");
  await writeFile(source, "same lecture bytes");
  const first = await sha256File(source);
  const second = await sha256File(source);
  assert.equal(first, second);
  assert.equal(transcriptPaths(directory, first).directory, join(directory, first));
});

test("cache is complete only when all four public artifacts exist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lecscape-cache-"));
  const paths = transcriptPaths(directory, "abc");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(paths.directory, { recursive: true }));
  assert.equal(await hasCompleteCache(paths), false);
  await Promise.all([
    writeJsonAtomic(paths.raw, { segments: [] }),
    writeJsonAtomic(paths.chunks, []),
    writeFile(paths.srt, "", "utf8"),
    writeJsonAtomic(paths.manifest, { version: 1 }),
  ]);
  assert.equal(await hasCompleteCache(paths), true);
  assert.deepEqual(JSON.parse(await readFile(paths.chunks, "utf8")), []);
});

