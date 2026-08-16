import assert from "node:assert/strict";
import test from "node:test";
import { resolveOpenAIApiKey } from "../src/env.mjs";

test("resolves AI_API_KEY while retaining OPENAI_API_KEY compatibility", () => {
  const previousAiKey = process.env.AI_API_KEY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  try {
    process.env.AI_API_KEY = "  ai-key  ";
    process.env.OPENAI_API_KEY = "openai-key";
    assert.equal(resolveOpenAIApiKey(), "ai-key");
    assert.equal(resolveOpenAIApiKey("  explicit-key  "), "explicit-key");

    delete process.env.AI_API_KEY;
    assert.equal(resolveOpenAIApiKey(), "openai-key");
  } finally {
    if (previousAiKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = previousAiKey;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  }
});
