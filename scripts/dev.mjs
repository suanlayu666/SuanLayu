import { createReadStream, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { watchSite } from "./build.mjs";
import { mediaTypes, projectRoot, withinDirectory } from "./site-files.mjs";

const root = join(realpathSync(projectRoot), "dist");
const host = "127.0.0.1";
const port = Number(process.env.SUANLAYU_PORT || 4173);
const clients = new Set();
let revision = Date.now();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ...mediaTypes,
};

function previewFile(pathname) {
  const name = decodeURIComponent(pathname).slice(1) || "index.html";
  const segments = name.split("/");
  if (segments.some((segment) => !segment || segment.startsWith(".") || segment.includes("\\"))) return null;

  const extension = extname(name).toLowerCase();
  if (!Object.hasOwn(mimeTypes, extension)) return null;

  const path = realpathSync(resolve(root, name));
  if (!withinDirectory(root, path)) return null;
  return statSync(path).isFile() ? { path, extension } : null;
}

function watchBrowser(response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  clients.add(response);
  response.write(`data: ${revision}\n\n`);
  response.on("close", () => clients.delete(response));
}

function livePage(path) {
  const refresh = `<script>
    const previewRevision = "${revision}";
    const previewEvents = new EventSource("/__preview-events");
    previewEvents.onmessage = (event) => {
      if (event.data !== previewRevision) window.location.reload();
    };
  </script>`;
  return readFileSync(path, "utf8").replace("</body>", `${refresh}\n</body>`);
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (pathname === "/__preview-events" && request.method === "GET") {
    watchBrowser(response);
    return;
  }

  let file;
  try {
    file = previewFile(pathname);
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof URIError)) {
      console.error(error.message);
    }
  }

  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("页面不存在");
    return;
  }

  response.setHeader("Content-Type", mimeTypes[file.extension]);
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "HEAD") {
    response.end();
  } else if (file.extension === ".html") {
    response.end(livePage(file.path));
  } else {
    const stream = createReadStream(file.path);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  }
});

let timer;
server.listen(port, host, () => {
  timer = watchSite(() => {
    revision++;
    for (const client of clients) client.write(`data: ${revision}\n\n`);
  });
  console.log(`本地预览 http://${host}:${port}/`);
});
server.on("close", () => clearInterval(timer));
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
