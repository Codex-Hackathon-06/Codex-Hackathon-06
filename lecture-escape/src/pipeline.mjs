import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { preprocessAudio } from "./audio.mjs";
import {
  buildManifest,
  hasCompleteCache,
  readCache,
  sha256File,
  transcriptPaths,
  writeCacheIndex,
} from "./cache.mjs";
import { createWhisperTranscription } from "./openai.mjs";
import { chunksToSrt, normalizeTranscription, writeJsonAtomic } from "./transcript.mjs";

const LABELS = {
  hashing: "영상 확인",
  cache_hit: "사전 분석 결과 불러오기",
  extracting_audio: "음성 추출",
  transcribing: "자막 분석",
  normalizing: "자막 정리",
  ready_for_concepts: "개념 추출 준비",
  complete: "완료",
};

function notify(callback, stage, detail) {
  callback?.({ stage, label: LABELS[stage], ...(detail ? { detail } : {}) });
}

export async function runBatchStt(options) {
  const inputPath = resolve(options.inputPath);
  const cacheRoot = resolve(options.cacheRoot ?? "data/transcripts");
  await access(inputPath);

  notify(options.onProgress, "hashing", basename(inputPath));
  const sourceSha256 = await sha256File(inputPath);
  const paths = transcriptPaths(cacheRoot, sourceSha256);

  if (!options.force && (await hasCompleteCache(paths))) {
    notify(options.onProgress, "cache_hit", sourceSha256);
    const cached = await readCache(paths);
    notify(options.onProgress, "ready_for_concepts", `${cached.chunks.length}개 청크`);
    notify(options.onProgress, "complete", paths.directory);
    return {
      status: "cache-hit",
      sourceSha256,
      paths,
      chunkCount: cached.chunks.length,
      manifest: cached.manifest,
    };
  }

  await mkdir(paths.directory, { recursive: true });
  notify(options.onProgress, "extracting_audio");
  const audio = await preprocessAudio(inputPath, paths.directory);

  if (options.prepareOnly) {
    return {
      status: "prepared",
      sourceSha256,
      paths,
      audioPath: audio.outputPath,
      converter: audio.converter,
    };
  }

  let raw;
  if (options.rawResponsePath) {
    raw = JSON.parse(await readFile(resolve(options.rawResponsePath), "utf8"));
  } else {
    notify(options.onProgress, "transcribing", `whisper-1 · ${audio.converter}`);
    try {
      raw = await createWhisperTranscription({
        audioPath: audio.outputPath,
        prompt: options.prompt,
        apiKey: options.apiKey,
        fetchImpl: options.fetchImpl,
        signal: options.signal,
      });
    } catch (error) {
      if (await hasCompleteCache(paths)) {
        notify(options.onProgress, "cache_hit", "API 오류로 기존 결과 사용");
        const cached = await readCache(paths);
        return {
          status: "fallback-cache",
          sourceSha256,
          paths,
          chunkCount: cached.chunks.length,
          manifest: cached.manifest,
          warning: error.message,
        };
      }
      throw error;
    }
  }

  notify(options.onProgress, "normalizing");
  const chunks = normalizeTranscription(raw, { language: "ko" });
  const manifest = await buildManifest(inputPath, audio.outputPath, sourceSha256);
  await Promise.all([
    writeJsonAtomic(paths.raw, raw),
    writeJsonAtomic(paths.chunks, chunks),
    writeFile(paths.srt, chunksToSrt(chunks), "utf8"),
    writeJsonAtomic(paths.manifest, manifest),
  ]);
  await writeCacheIndex(cacheRoot, sourceSha256, manifest);

  notify(options.onProgress, "ready_for_concepts", `${chunks.length}개 청크`);
  notify(options.onProgress, "complete", paths.directory);
  return {
    status: "transcribed",
    sourceSha256,
    paths,
    chunkCount: chunks.length,
    manifest,
  };
}

