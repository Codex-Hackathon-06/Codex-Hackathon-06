import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { missingOpenAIApiKeyError, resolveOpenAIApiKey } from "./env.mjs";

function contentTypeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".wav") return "audio/wav";
  return "application/octet-stream";
}

export async function createWhisperTranscription(options) {
  const apiKey = resolveOpenAIApiKey(options.apiKey);
  if (!apiKey) {
    throw missingOpenAIApiKeyError();
  }

  const audio = await readFile(options.audioPath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([audio], { type: contentTypeFor(options.audioPath) }),
    basename(options.audioPath),
  );
  form.append("model", "whisper-1");
  form.append("language", "ko");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (options.prompt?.trim()) form.append("prompt", options.prompt.trim());

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: options.signal ?? AbortSignal.timeout(20 * 60 * 1000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${body}`);
  }
  const raw = await response.json();
  if (!Array.isArray(raw.segments)) {
    throw new Error("OpenAI transcription response did not include timestamped segments");
  }
  return raw;
}
