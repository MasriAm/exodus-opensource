import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.cwd(), "out");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; media-src blob:; worker-src 'self' blob:; font-src 'self'";
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".zip", "application/zip"],
]);

function safeOutputPath(relativePath) {
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  return candidate;
}

async function existingFile(candidates) {
  for (const candidate of candidates) {
    const path = safeOutputPath(candidate);
    if (!path) {
      continue;
    }
    try {
      const details = await stat(path);
      if (details.isFile()) {
        return { path, size: details.size };
      }
    } catch {
      // Continue through static-export route alternatives.
    }
  }
  return null;
}

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let pathname;
  let requestUrl;
  try {
    requestUrl = new URL(request.url ?? "/", "http://localhost");
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end("Invalid URL");
    return;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const routePath = relativePath.replace(/\/+$/, "");
  const wantsRouteData =
    request.headers.rsc === "1" || requestUrl.searchParams.has("_rsc");
  const candidates =
    relativePath === ""
      ? ["index.html"]
      : [
          relativePath,
          ...(wantsRouteData ? [`${routePath}.txt`] : []),
          `${routePath}.html`,
          `${routePath}/index.html`,
        ];
  const file = await existingFile(candidates);
  if (!file) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Security-Policy": contentSecurityPolicy,
    });
    response.end("Not found");
    return;
  }

  const headers = {
    "Content-Length": String(file.size),
    "Content-Type":
      contentTypes.get(extname(file.path).toLocaleLowerCase()) ??
      "application/octet-stream",
    "Content-Security-Policy": contentSecurityPolicy,
    "X-Content-Type-Options": "nosniff",
  };
  if (file.path.endsWith(`${sep}sw.js`)) {
    headers["Cache-Control"] = "no-cache";
  }
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file.path).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Exodus static preview ready at http://127.0.0.1:${port}`);
});
