import { readFile, rename, writeFile } from "node:fs/promises";

export function cleanTranscriptText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function normalizeTranscription(raw, options = {}) {
  const language = options.language ?? "ko";
  if (language !== "ko") {
    throw new Error(`This LecScape adapter currently requires language=ko, received ${language}`);
  }
  if (!raw || !Array.isArray(raw.segments)) {
    throw new Error("Transcription response must contain a segments array");
  }

  return raw.segments.map((segment, index) => {
    const start = Number(segment.start);
    const end = Number(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new Error(`Invalid timestamps in transcription segment ${index}`);
    }
    const rawText = String(segment.text ?? "").trim();
    return {
      id: `seg-${String(index + 1).padStart(4, "0")}`,
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      rawText,
      text: cleanTranscriptText(rawText),
      language: "ko",
      isFinal: true,
      source: "batch",
    };
  });
}

export function formatSrtTimestamp(milliseconds) {
  const safe = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function chunksToSrt(chunks) {
  return chunks
    .map(
      (chunk, index) =>
        `${index + 1}\n${formatSrtTimestamp(chunk.startMs)} --> ${formatSrtTimestamp(chunk.endMs)}\n${chunk.text}\n`,
    )
    .join("\n");
}

export async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function readTranscriptChunks(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(value)) {
    throw new Error(`Expected a transcript chunk array in ${path}`);
  }
  return value;
}

export async function* streamBatchTranscript(chunksOrPath, options = {}) {
  const chunks = Array.isArray(chunksOrPath)
    ? chunksOrPath
    : await readTranscriptChunks(chunksOrPath);
  const delayMs = Number(options.delayMs ?? 0);
  for (const chunk of chunks) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    yield chunk;
  }
}

