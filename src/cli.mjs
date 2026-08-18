#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { runBatchStt } from "./pipeline.mjs";
import { loadProjectEnv } from "./env.mjs";

function usage() {
  return `LecScape batch STT\n\nUsage:\n  node src/cli.mjs --input <video> [options]\n\nOptions:\n  --cache <directory>       Cache root (default: data/transcripts)\n  --prompt <text>           Korean terminology hint for Whisper\n  --prompt-file <path>      Read the terminology hint from a UTF-8 file\n  --raw-response <path>     Normalize a saved verbose_json response instead of calling OpenAI\n  --prepare-only            Hash and preprocess audio without calling OpenAI\n  --force                   Ignore a complete cache and regenerate it\n  --help                    Show this message\n`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") options.help = true;
    else if (value === "--force") options.force = true;
    else if (value === "--prepare-only") options.prepareOnly = true;
    else if (value === "--input") options.inputPath = argv[++index];
    else if (value === "--cache") options.cacheRoot = argv[++index];
    else if (value === "--prompt") options.prompt = argv[++index];
    else if (value === "--prompt-file") options.promptFile = argv[++index];
    else if (value === "--raw-response") options.rawResponsePath = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

try {
  loadProjectEnv();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (!options.inputPath) throw new Error("--input is required");
  if (options.promptFile) options.prompt = await readFile(options.promptFile, "utf8");

  const result = await runBatchStt({
    ...options,
    onProgress(progress) {
      process.stderr.write(`${JSON.stringify(progress)}\n`);
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  // 설정 누락은 사용자가 바로 고칠 수 있는 문제이므로 스택 트레이스 없이 안내만 출력한다.
  const isSetupError = error?.code === "OPENAI_API_KEY_MISSING";
  process.stderr.write(`${isSetupError ? error.message : (error.stack ?? error.message)}\n`);
  if (isSetupError) {
    process.stderr.write(
      "프로젝트 루트에 .env 파일을 만들고 AI_API_KEY=<발급받은 키> 를 넣은 뒤 다시 실행하세요.\n",
    );
  }
  process.exitCode = 1;
}
