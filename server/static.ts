import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mime from "mime-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPRESSIBLE_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);

function normalizeRelativePath(distPath: string, filePath: string) {
  return path.relative(distPath, filePath).split(path.sep).join("/");
}

function getCacheControlHeader(relativePath: string) {
  if (relativePath === "index.html") {
    return "no-cache";
  }

  if (relativePath === "sw.js") {
    return "no-cache, no-store, must-revalidate";
  }

  if (relativePath.startsWith("assets/")) {
    return "public, max-age=31536000, immutable";
  }

  if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i.test(relativePath)) {
    return "public, max-age=86400, stale-while-revalidate=604800";
  }

  return "public, max-age=3600, stale-while-revalidate=86400";
}

function setStaticHeaders(res: express.Response, distPath: string, filePath: string) {
  const relativePath = normalizeRelativePath(distPath, filePath);
  res.setHeader("Cache-Control", getCacheControlHeader(relativePath));
}

function resolveStaticPath(distPath: string, requestPath: string) {
  const relativeRequestPath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  if (!relativeRequestPath || relativeRequestPath.endsWith("/")) {
    return null;
  }

  const absolutePath = path.resolve(distPath, relativeRequestPath);
  if (!absolutePath.startsWith(distPath)) {
    return null;
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  return absolutePath;
}

function trySendPrecompressedAsset(req: express.Request, res: express.Response, distPath: string, absolutePath: string) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (!COMPRESSIBLE_EXTENSIONS.has(extension)) {
    return false;
  }

  const acceptEncoding = req.headers["accept-encoding"] ?? "";
  const supportsBrotli = typeof acceptEncoding === "string" && acceptEncoding.includes("br");
  const supportsGzip = typeof acceptEncoding === "string" && acceptEncoding.includes("gzip");

  let candidatePath: { filePath: string; encoding: "br" | "gzip" } | null = null;
  if (supportsBrotli && fs.existsSync(`${absolutePath}.br`)) {
    candidatePath = { filePath: `${absolutePath}.br`, encoding: "br" };
  } else if (supportsGzip && fs.existsSync(`${absolutePath}.gz`)) {
    candidatePath = { filePath: `${absolutePath}.gz`, encoding: "gzip" };
  }

  if (!candidatePath) {
    return false;
  }

  const mimeType = mime.lookup(absolutePath);
  if (mimeType) {
    res.setHeader("Content-Type", mimeType);
  }
  res.setHeader("Content-Encoding", candidatePath.encoding);
  res.setHeader("Vary", "Accept-Encoding");
  setStaticHeaders(res, distPath, absolutePath);
  res.sendFile(candidatePath.filePath);
  return true;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const absolutePath = resolveStaticPath(distPath, req.path);
    if (!absolutePath) {
      next();
      return;
    }

    if (trySendPrecompressedAsset(req, res, distPath, absolutePath)) {
      return;
    }

    next();
  });

  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      setStaticHeaders(res, distPath, filePath);
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.get("/{*splat}", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (trySendPrecompressedAsset(req, res, distPath, indexPath)) {
      return;
    }

    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexPath);
  });
}
