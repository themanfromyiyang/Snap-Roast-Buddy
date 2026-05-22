import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

loadDotEnv(resolve(".env"));

const {
  handleAnalyzeImage,
  handleClassifyLayout,
  handleDebugPrompts,
  handleDebugSkills,
  handleGenerateDoodle,
  handleRoast
} = await import("../api/_shared.mjs");

const root = resolve("frontend");
const port = Number(process.env.PORT ?? 5173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "POST" && url.pathname === "/api/analyze-image") return handleAnalyzeImage(request, response);
  if (request.method === "POST" && url.pathname === "/api/classify-layout") return handleClassifyLayout(request, response);
  if (request.method === "POST" && url.pathname === "/api/roast") return handleRoast(request, response);
  if (request.method === "POST" && url.pathname === "/api/generate-doodle") return handleGenerateDoodle(request, response);
  if (request.method === "GET" && url.pathname === "/api/debug/prompts") return handleDebugPrompts(request, response);
  if (request.method === "GET" && url.pathname === "/api/debug/skills") return handleDebugSkills(request, response);

  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": mime[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Snap Roast Buddy demo: http://localhost:${port}`);
});

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
