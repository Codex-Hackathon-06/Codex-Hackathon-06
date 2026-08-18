import { readFile } from "node:fs/promises";
import { validatePuzzlePack } from "../packages/content-schema/src/index.js";

const sampleNames = ["coding-agents.room.json"];

for (const sampleName of sampleNames) {
  const sampleUrl = new URL(`../content/sample-lectures/${sampleName}`, import.meta.url);
  const pack = JSON.parse(await readFile(sampleUrl, "utf8"));
  const result = validatePuzzlePack(pack);

  if (!result.valid) {
    const messages = result.errors.map(
      (error) => `[${sampleName}] [${error.code}] ${error.path}: ${error.message}`,
    );
    process.stderr.write(`${messages.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    const templates = [...new Set(pack.puzzles.map((puzzle) => puzzle.template))].join(", ");
    process.stdout.write(
      `유효한 샘플: ${pack.room.title}, 퍼즐 ${pack.puzzles.length}개 (${templates})\n`,
    );
  }
}
