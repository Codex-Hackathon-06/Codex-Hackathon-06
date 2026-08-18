import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT ?? 4173);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (urlPath === "/") {
    response.writeHead(302, { location: "/stt" });
    response.end();
    return;
  }

  // STT 화면이 첫 화면이다. 강의를 기록하고 분석한 뒤에 게임으로 넘어가는 순서라서,
  // 루트로 들어오면 live-ui의 실시간 STT 화면을 보여준다.
  // live-ui/는 npm start(src/live-server.mjs)가 쓰는 것과 같은 파일이며,
  // game-team-handoff/integration/의 복사본과 내용이 동일하므로 단일 출처로 live-ui를 쓴다.
  const routes = new Map([
    ["/stt", "/live-ui/index.html"],
    ["/app.js", "/live-ui/app.js"],
    ["/style.css", "/live-ui/style.css"],
    ["/game", "/live-ui/game.html"],
    ["/game.html", "/live-ui/game.html"],
    ["/game.js", "/live-ui/game.js"],
    ["/game-handoff.js", "/live-ui/game-handoff.js"],
    ["/game-runtime.js", "/live-ui/game-runtime.js"],
    ["/apps/web/", "/apps/web/index.html"],
  ]);
  const requested = routes.get(urlPath) ?? urlPath;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": types[extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`강의실 탈출 프로토타입: http://127.0.0.1:${port}\n`);
});
