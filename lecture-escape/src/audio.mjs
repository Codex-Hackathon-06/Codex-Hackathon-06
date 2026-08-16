import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function isExecutable(command) {
  if (command.includes("/")) {
    try {
      await access(command);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await run(command, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function hasNonEmptyFile(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function createAtomically(outputPath, create) {
  if (await hasNonEmptyFile(outputPath)) return false;
  const extensionIndex = outputPath.lastIndexOf(".");
  const temporaryPath = `${outputPath.slice(0, extensionIndex)}.tmp-${process.pid}${outputPath.slice(extensionIndex)}`;
  try {
    await create(temporaryPath);
    await rename(temporaryPath, outputPath);
    return true;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function findFfmpeg() {
  const bundledFfmpeg = fileURLToPath(
    new URL("../node_modules/ffmpeg-static/ffmpeg", import.meta.url),
  );
  const candidates = [
    process.env.FFMPEG_PATH,
    bundledFfmpeg,
    "ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

export async function preprocessAudio(inputPath, directory) {
  await mkdir(directory, { recursive: true });
  const ffmpeg = await findFfmpeg();
  if (ffmpeg) {
    const outputPath = join(directory, "audio.mp3");
    await createAtomically(outputPath, (temporaryPath) =>
      run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        "-map_metadata",
        "-1",
        temporaryPath,
      ]),
    );
    return { outputPath, converter: "ffmpeg" };
  }

  if (process.platform === "darwin" && (await isExecutable("/usr/bin/afconvert"))) {
    const outputPath = join(directory, "audio.m4a");
    await createAtomically(outputPath, (temporaryPath) =>
      run("/usr/bin/afconvert", [
        inputPath,
        "-o",
        temporaryPath,
        "-f",
        "m4af",
        "-d",
        "0",
      ]),
    );
    return { outputPath, converter: "afconvert-copy" };
  }

  throw new Error(
    "ffmpeg is required. Install it or set FFMPEG_PATH to an executable ffmpeg binary.",
  );
}
