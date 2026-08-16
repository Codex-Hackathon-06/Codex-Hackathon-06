import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

export function loadProjectEnv() {
  try {
    loadEnvFile(PROJECT_ENV_PATH);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function resolveOpenAIApiKey(explicitApiKey) {
  return explicitApiKey?.trim()
    || process.env.AI_API_KEY?.trim()
    || process.env.OPENAI_API_KEY?.trim();
}

export function missingOpenAIApiKeyError() {
  const error = new Error(
    "OpenAI API key is not set. Add AI_API_KEY to the project .env file or set OPENAI_API_KEY in the shell.",
  );
  error.code = "OPENAI_API_KEY_MISSING";
  return error;
}
