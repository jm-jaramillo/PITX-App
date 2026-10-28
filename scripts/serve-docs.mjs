#!/usr/bin/env node
/**
 * Serves the static `docs/` site locally, the same way GitHub Pages will.
 * Dependency-free so it works with a bare Node install.
 *
 * Usage: node scripts/serve-docs.mjs [port]
 */
import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import path from "path";

const port = Number(process.argv[2] ?? process.env.PORT ?? 3100);
const root = path.resolve(import.meta.dirname, "..", "docs");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let filePath = path.join(root, urlPath);

    // Block path traversal outside docs/.
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let status = 200;
    const info = await stat(filePath).catch(() => null);
    // Like GitHub Pages: a missing path serves 404.html (which forwards
    // legacy page URLs to their module).
    if (!info) {
      filePath = path.join(root, "404.html");
      status = 404;
    }
    if (info?.isDirectory()) filePath = path.join(filePath, "index.html");

    const body = await readFile(filePath);
    res.writeHead(status, {
      "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(port, () => {
  console.log(`Serving docs/ at http://localhost:${port}`);
});
