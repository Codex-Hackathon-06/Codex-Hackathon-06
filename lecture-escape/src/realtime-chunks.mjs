import { cleanTranscriptText } from "./transcript.mjs";

export const LIVE_SAMPLE_RATE = 24_000;
export const PCM_BYTES_PER_SAMPLE = 2;
export const PCM_FRAME_DURATION_MS = 100;
export const PCM_FRAME_BYTES = LIVE_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * PCM_FRAME_DURATION_MS / 1000;

export class PcmFrameBuffer {
  constructor(frameBytes = PCM_FRAME_BYTES) {
    if (!Number.isInteger(frameBytes) || frameBytes <= 0) {
      throw new Error("frameBytes must be a positive integer");
    }
    this.frameBytes = frameBytes;
    this.buffer = Buffer.alloc(0);
  }

  push(value) {
    const input = Buffer.from(value);
    if (input.length > 0) this.buffer = Buffer.concat([this.buffer, input]);
    const frames = [];
    while (this.buffer.length >= this.frameBytes) {
      frames.push(this.buffer.subarray(0, this.frameBytes));
      this.buffer = this.buffer.subarray(this.frameBytes);
    }
    return frames;
  }

  flush() {
    if (this.buffer.length === 0) return [];
    const remainder = this.buffer;
    this.buffer = Buffer.alloc(0);
    return [remainder];
  }
}

function chunkId(index) {
  return `seg-${String(index).padStart(4, "0")}`;
}

export class RealtimeTranscriptAssembler {
  constructor(options = {}) {
    this.now = options.now ?? (() => performance.now());
    this.startedAt = options.startedAt ?? this.now();
    this.turns = new Map();
    this.nextIndex = 1;
    this.lastKnownItemId = null;
  }

  elapsedMs() {
    return Math.max(0, Math.round(this.now() - this.startedAt));
  }

  ensureTurn(itemId) {
    const resolvedId = itemId || this.lastKnownItemId || `local-${this.nextIndex}`;
    let turn = this.turns.get(resolvedId);
    if (!turn) {
      const elapsed = this.elapsedMs();
      turn = {
        itemId: resolvedId,
        id: chunkId(this.nextIndex++),
        startMs: elapsed,
        endMs: elapsed,
        rawText: "",
        isFinal: false,
      };
      this.turns.set(resolvedId, turn);
    }
    this.lastKnownItemId = resolvedId;
    return turn;
  }

  processEvent(event) {
    if (!event || typeof event.type !== "string") return null;
    const itemId = typeof event.item_id === "string" ? event.item_id : null;

    if (event.type === "input_audio_buffer.speech_started") {
      const turn = this.ensureTurn(itemId);
      turn.startMs = this.elapsedMs();
      turn.endMs = turn.startMs;
      return null;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      const turn = this.ensureTurn(itemId);
      turn.endMs = Math.max(turn.startMs, this.elapsedMs());
      return null;
    }

    if (event.type === "conversation.item.input_audio_transcription.delta") {
      const turn = this.ensureTurn(itemId);
      turn.rawText += String(event.delta ?? "");
      turn.endMs = Math.max(turn.startMs, this.elapsedMs());
      return this.toChunk(turn);
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const turn = this.ensureTurn(itemId);
      turn.rawText = String(event.transcript ?? turn.rawText).trim();
      turn.endMs = Math.max(turn.startMs, turn.endMs, this.elapsedMs());
      turn.isFinal = true;
      return this.toChunk(turn);
    }

    return null;
  }

  toChunk(turn) {
    return {
      id: turn.id,
      startMs: turn.startMs,
      endMs: Math.max(turn.startMs, turn.endMs),
      rawText: turn.rawText,
      text: cleanTranscriptText(turn.rawText),
      language: "ko",
      isFinal: turn.isFinal,
      source: "realtime",
    };
  }

  hasPending() {
    return [...this.turns.values()].some((turn) => !turn.isFinal);
  }

  chunks() {
    return [...this.turns.values()]
      .map((turn) => this.toChunk(turn))
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
  }

  finalChunks() {
    const chunks = [...this.turns.values()]
      .filter((turn) => turn.isFinal && turn.rawText.trim())
      .map((turn) => this.toChunk(turn))
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));

    let previousStart = 0;
    return chunks.map((chunk) => {
      const startMs = Math.max(previousStart, chunk.startMs);
      const normalized = { ...chunk, startMs, endMs: Math.max(startMs, chunk.endMs) };
      previousStart = startMs;
      return normalized;
    });
  }
}

export function audioAppendEvent(pcm) {
  return {
    type: "input_audio_buffer.append",
    audio: Buffer.from(pcm).toString("base64"),
  };
}
