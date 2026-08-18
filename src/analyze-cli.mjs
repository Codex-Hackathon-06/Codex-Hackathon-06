#!/usr/bin/env node
import { runConceptPipeline } from "./concept-analysis.mjs";
import { loadProjectEnv } from "./env.mjs";

function usage() {
  return `LecScape concept analyzer\n\nUsage:\n  node src/analyze-cli.mjs --input <transcript.chunks.json> [options]\n\nOptions:\n  --output <path>           Game-generator JSON path (default: next to input)\n  --raw-output <path>       Raw Responses API JSON path\n  --raw-response <path>     Use a saved Responses API response without network\n  --model <id>              OpenAI model (default: gpt-5.6-terra)\n  --reasoning <effort>      none, low, medium, high, xhigh, or max (default: low)\n  --force                   Ignore a matching analysis cache\n  --help                    Show this message\n`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") options.help = true;
    else if (value === "--force") options.force = true;
    else if (value === "--input") options.inputPath = argv[++index];
    else if (value === "--output") options.outputPath = argv[++index];
    else if (value === "--raw-output") options.rawOutputPath = argv[++index];
    else if (value === "--raw-response") options.rawResponsePath = argv[++index];
    else if (value === "--model") options.model = argv[++index];
    else if (value === "--reasoning") options.reasoningEffort = argv[++index];
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
  const validEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
  if (options.reasoningEffort && !validEfforts.has(options.reasoningEffort)) {
    throw new Error(`Invalid --reasoning value: ${options.reasoningEffort}`);
  }

  const result = await runConceptPipeline({
    ...options,
    onProgress(progress) {
      process.stderr.write(`${JSON.stringify(progress)}\n`);
    },
  });
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      outputPath: result.outputPath,
      rawOutputPath: result.rawOutputPath,
      conceptCount: result.result.coreConcepts.length,
      exampleCount: result.result.examples.length,
      confusionCount: result.result.confusions.length,
    }, null, 2)}\n`,
  );
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
