import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { runConceptPipeline } from "./concept-analysis.mjs";
import { LiveSession } from "./live-session.mjs";
import { loadProjectEnv, resolveOpenAIApiKey } from "./env.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiRoot = resolve(projectRoot, "live-ui");
const projectAssetTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

const staticFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/game", { file: "game.html", type: "text/html; charset=utf-8" }],
  ["/game.html", { file: "game.html", type: "text/html; charset=utf-8" }],
  ["/game.js", { file: "game.js", type: "text/javascript; charset=utf-8" }],
  ["/game-runtime.js", { file: "game-runtime.js", type: "text/javascript; charset=utf-8" }],
  ["/game-handoff.js", { file: "game-handoff.js", type: "text/javascript; charset=utf-8" }],
  ["/style.css", { file: "style.css", type: "text/css; charset=utf-8" }],
]);

function parseArguments(argv) {
  const options = { host: "127.0.0.1", port: 4173 };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--host" && value) options.host = argv[++index];
    else if (argument === "--port" && value) options.port = Number(argv[++index]);
    else if (argument === "--helper" && value) options.helperPath = argv[++index];
    else if (argument === "--outputs" && value) options.outputsRoot = argv[++index];
    else if (argument === "--prompt" && value) options.prompt = argv[++index];
    else if (argument === "--concept-model" && value) options.conceptModel = argv[++index];
    else if (argument === "--concept-reasoning" && value) options.conceptReasoning = argv[++index];
    else if (argument === "--keywords" && value) {
      options.keywords = argv[++index].split(",").map((item) => item.trim()).filter(Boolean);
    } else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) {
    throw new Error("--port must be an integer from 1 to 65535");
  }
  const validReasoning = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
  if (options.conceptReasoning && !validReasoning.has(options.conceptReasoning)) {
    throw new Error("--concept-reasoning must be one of: none, low, medium, high, xhigh, max");
  }
  return options;
}

function sendJson(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

const ACTIVE_STATES = new Set([
  "Requesting Permission",
  "Connecting",
  "Listening",
  "Finalizing",
  "Analyzing",
  "Grounding",
]);

export function createLiveServer(options = {}) {
  let session = null;
  let operation = Promise.resolve();
  let workflowState = "Idle";
  let workflowDetail;
  let interceptStopEvents = false;
  let deferredSessionComplete = null;
  let latestAnalysisComplete = null;
  const sockets = new Set();
  const LiveSessionImpl = options.LiveSessionImpl ?? LiveSession;
  const conceptRunner = options.runConceptPipelineImpl ?? runConceptPipeline;

  const broadcast = (message) => {
    for (const socket of sockets) sendJson(socket, message);
  };

  const broadcastState = (state, detail) => {
    workflowState = state;
    workflowDetail = detail;
    broadcast({ type: "state", state, detail });
  };

  const makeSession = () => {
    const next = new LiveSessionImpl({
      apiKey: resolveOpenAIApiKey(options.apiKey),
      helperPath: options.helperPath,
      outputsRoot: options.outputsRoot,
      prompt: options.prompt,
      keywords: options.keywords,
    });
    next.on("message", (message) => {
      if (interceptStopEvents && message.type === "session_complete") {
        deferredSessionComplete = message;
        return;
      }
      if (interceptStopEvents && message.type === "state" && message.state === "Stopped") return;
      if (message.type === "state") {
        workflowState = message.state;
        workflowDetail = message.detail;
      }
      broadcast(message);
    });
    return next;
  };

  const execute = (task) => {
    operation = operation.then(task, task);
    return operation;
  };

  const httpServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, state: workflowState }));
      return;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    try {
      const asset = staticFiles.get(url.pathname);
      const isProjectAsset = ["/apps/", "/content/", "/packages/"].some((prefix) =>
        url.pathname.startsWith(prefix),
      );
      const projectPath = resolve(projectRoot, `.${url.pathname}`);
      if (!asset && (!isProjectAsset || !projectPath.startsWith(projectRoot))) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const filePath = asset
        ? resolve(uiRoot, asset.file)
        : url.pathname === "/apps/web/"
          ? resolve(projectRoot, "apps/web/index.html")
          : projectPath;
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": asset?.type ?? projectAssetTypes.get(extname(filePath)) ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.message);
    }
  });

  const webSocketServer = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== "/live") {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit("connection", client, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    sockets.add(socket);
    const snapshot = session?.snapshot() ?? { chunks: [] };
    sendJson(socket, { type: "state", state: workflowState, detail: workflowDetail });
    for (const chunk of snapshot.chunks) sendJson(socket, { type: "transcript", chunk });
    if (latestAnalysisComplete) sendJson(socket, latestAnalysisComplete);

    socket.on("message", (data) => {
      let command;
      try {
        command = JSON.parse(data.toString());
      } catch {
        sendJson(socket, { type: "error", code: "INVALID_COMMAND", message: "잘못된 명령입니다." });
        return;
      }

      if (command.type === "start") {
        execute(async () => {
          if (ACTIVE_STATES.has(workflowState)) {
            sendJson(socket, {
              type: "error",
              code: "LIVE_SESSION_ALREADY_ACTIVE",
              message: "이미 실시간 듣기가 실행 중입니다.",
            });
            return;
          }
          latestAnalysisComplete = null;
          session = makeSession();
          try {
            await session.start();
          } catch {
            // LiveSession already emitted a user-facing error.
          }
        });
      } else if (command.type === "stop") {
        execute(async () => {
          if (!session || !["Requesting Permission", "Connecting", "Listening"].includes(session.state)) {
            return;
          }
          interceptStopEvents = true;
          deferredSessionComplete = null;
          broadcastState("Finalizing", "마지막 발화를 마무리하고 전사본을 저장하고 있습니다.");

          const transcriptResult = await session.stop();
          if (!transcriptResult) return;

          try {
            const analysisResult = await conceptRunner({
              inputPath: transcriptResult.chunksPath,
              outputPath: resolve(transcriptResult.directory, "game-generator.input.json"),
              rawOutputPath: resolve(transcriptResult.directory, "lecture.analysis.raw.json"),
              apiKey: resolveOpenAIApiKey(options.apiKey),
              model: options.conceptModel,
              reasoningEffort: options.conceptReasoning,
              onProgress(progress) {
                const state = progress.stage === "grounding" ? "Grounding" : "Analyzing";
                broadcastState(state, [progress.label, progress.detail].filter(Boolean).join(" · "));
                broadcast({ type: "analysis_progress", ...progress });
              },
            });

            if (deferredSessionComplete) broadcast(deferredSessionComplete);
            latestAnalysisComplete = {
              type: "analysis_complete",
              sessionId: transcriptResult.sessionId,
              status: analysisResult.status,
              outputPath: analysisResult.outputPath,
              rawOutputPath: analysisResult.rawOutputPath,
              analysis: analysisResult.result,
            };
            broadcast(latestAnalysisComplete);
            broadcastState(
              "Ready",
              `${analysisResult.result.lecture.title} · 핵심 개념 ${analysisResult.result.coreConcepts.length}개`,
            );
          } catch (error) {
            latestAnalysisComplete = null;
            if (deferredSessionComplete) broadcast(deferredSessionComplete);
            broadcastState("Stopped", `전사본 저장 완료 · ${transcriptResult.chunksPath}`);
            broadcast({
              type: "analysis_error",
              code: error.code ?? "ANALYSIS_FAILED",
              message: error.message,
              sessionId: transcriptResult.sessionId,
              chunksPath: transcriptResult.chunksPath,
              directory: transcriptResult.directory,
            });
          } finally {
            interceptStopEvents = false;
            deferredSessionComplete = null;
          }
        }).catch((error) => {
          interceptStopEvents = false;
          deferredSessionComplete = null;
          broadcast({ type: "error", code: error.code ?? "STOP_FAILED", message: error.message });
        });
      } else {
        sendJson(socket, { type: "error", code: "UNKNOWN_COMMAND", message: "지원하지 않는 명령입니다." });
      }
    });
    socket.on("close", () => sockets.delete(socket));
  });

  return {
    httpServer,
    webSocketServer,
    listen() {
      return new Promise((resolveListen, rejectListen) => {
        httpServer.once("error", rejectListen);
        httpServer.listen(options.port ?? 4173, options.host ?? "127.0.0.1", () => {
          httpServer.off("error", rejectListen);
          resolveListen(httpServer.address());
        });
      });
    },
    async close() {
      if (["Requesting Permission", "Connecting", "Listening"].includes(session?.state)) {
        await session.stop();
      }
      for (const socket of sockets) socket.close(1001, "Server shutting down");
      webSocketServer.close();
      await new Promise((resolveClose, rejectClose) => {
        httpServer.close((error) => error ? rejectClose(error) : resolveClose());
      });
    },
  };
}

async function main() {
  loadProjectEnv();
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node src/live-server.mjs [--host 127.0.0.1] [--port 4173] [--helper path] [--outputs path] [--prompt text] [--keywords a,b] [--concept-model id] [--concept-reasoning effort]\n");
    return;
  }
  const liveServer = createLiveServer(options);
  const address = await liveServer.listen();
  process.stdout.write(`LecScape Live STT: http://${options.host}:${address.port}\n`);

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await liveServer.close();
  };
  process.once("SIGINT", () => close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => close().finally(() => process.exit(0)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
