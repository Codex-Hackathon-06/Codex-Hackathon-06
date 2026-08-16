import { readFile } from "node:fs/promises";
import { validatePuzzlePack } from "../packages/content-schema/src/index.js";

const sampleUrl = new URL(
  "../content/sample-lectures/puppy-poop.room.json",
  import.meta.url,
);
const pack = JSON.parse(await readFile(sampleUrl, "utf8"));
const result = validatePuzzlePack(pack);

if (!result.valid) {
  const messages = result.errors.map(
    (error) => `[${error.code}] ${error.path}: ${error.message}`,
  );
  process.stderr.write(`${messages.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `유효한 샘플: ${pack.room.title}, 퍼즐 ${pack.puzzles.length}개\n`,
  );
}
