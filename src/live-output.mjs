import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chunksToSrt, writeJsonAtomic } from "./transcript.mjs";
import { LIVE_SAMPLE_RATE } from "./realtime-chunks.mjs";

export function liveSessionId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function writeLiveSession(options) {
  const createdAt = options.createdAt ?? new Date();
  const sessionId = options.sessionId ?? liveSessionId(createdAt);
  const directory = resolve(options.outputsRoot ?? "outputs/live", sessionId);
  const chunksPath = join(directory, "transcript.chunks.json");
  const srtPath = join(directory, "transcript.srt");
  const sessionPath = join(directory, "session.json");
  const chunks = options.chunks.filter((chunk) => chunk.isFinal);

  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeJsonAtomic(chunksPath, chunks),
    writeFile(srtPath, chunksToSrt(chunks), "utf8"),
    writeJsonAtomic(sessionPath, {
      version: 1,
      sessionId,
      source: "realtime",
      timelineOrigin: "listening_start",
      model: options.model ?? "gpt-live-transcribe",
      sessionType: "transcription",
      connectionIntent: "transcription",
      turnSegmentation: "client_interval",
      commitIntervalMs: options.commitIntervalMs ?? 5_000,
      language: "ko",
      sampleRate: options.sampleRate ?? LIVE_SAMPLE_RATE,
      startedAt: (options.startedAt ?? createdAt).toISOString(),
      stoppedAt: (options.stoppedAt ?? new Date()).toISOString(),
      chunkCount: chunks.length,
    }),
  ]);

  return { sessionId, directory, chunksPath, srtPath, sessionPath };
}
