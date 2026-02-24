import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist (SPA routing)
  // but exclude static assets (JS, CSS, images, etc.)
  app.get("*", (req, res, next) => {
    // Don't intercept requests for static assets
    if (req.path.startsWith('/assets/') || req.path.includes('.')) {
      return next(); // Let express.static handle it
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
