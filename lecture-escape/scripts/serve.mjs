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
  ".svg": "image/svg+xml",
};

createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
  if (urlPath === "/") {
    response.writeHead(302, { location: "/stt" });
    response.end();
    return;
  }

  const requested =
    urlPath === "/stt"
      ? "/game-team-handoff/stt.html"
      : urlPath === "/apps/web/"
      ? "/apps/web/index.html"
      : urlPath === "/game"
        ? "/game-team-handoff/integration/game.html"
        : urlPath;
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
