import type { NextFunction, Request, Response } from "express";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { promisify } from "node:util";
import { logger } from "./logger.js";

const gzipAsync = promisify(gzip);
const brotliCompressAsync = promisify(brotliCompress);
const MIN_COMPRESSION_BYTES = 1024;

function negotiateEncoding(req: Request): "br" | "gzip" | null {
  const acceptEncoding = req.headers["accept-encoding"];
  if (typeof acceptEncoding !== "string") {
    return null;
  }

  if (acceptEncoding.includes("br")) {
    return "br";
  }

  if (acceptEncoding.includes("gzip")) {
    return "gzip";
  }

  return null;
}

function isCompressibleContentType(contentTypeHeader: unknown) {
  const contentType = typeof contentTypeHeader === "string"
    ? contentTypeHeader.toLowerCase()
    : "";

  if (!contentType) {
    return false;
  }

  return (
    contentType.startsWith("text/")
    || contentType.includes("application/json")
    || contentType.includes("application/javascript")
    || contentType.includes("application/xml")
    || contentType.includes("image/svg+xml")
  );
}

function appendVaryHeader(res: Response, value: string) {
  const current = res.getHeader("Vary");
  if (typeof current !== "string" || current.length === 0) {
    res.setHeader("Vary", value);
    return;
  }

  const parts = current.split(",").map((entry) => entry.trim().toLowerCase());
  if (!parts.includes(value.toLowerCase())) {
    res.setHeader("Vary", `${current}, ${value}`);
  }
}

async function compressBody(body: Buffer, encoding: "br" | "gzip") {
  if (encoding === "br") {
    return brotliCompressAsync(body, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
      },
    });
  }

  return gzipAsync(body, { level: 6 });
}

export function responseCompression(req: Request, res: Response, next: NextFunction) {
  const encoding = negotiateEncoding(req);
  if (!encoding || req.method === "HEAD") {
    next();
    return;
  }

  const originalSend = res.send.bind(res);

  res.send = ((body?: unknown) => {
    if (
      body == null
      || res.headersSent
      || res.statusCode === 204
      || res.statusCode === 304
      || res.getHeader("Content-Encoding")
    ) {
      return originalSend(body as never);
    }

    const cacheControl = res.getHeader("Cache-Control");
    if (typeof cacheControl === "string" && cacheControl.includes("no-transform")) {
      return originalSend(body as never);
    }

    const bodyBuffer = Buffer.isBuffer(body)
      ? body
      : typeof body === "string"
        ? Buffer.from(body)
        : null;

    if (!bodyBuffer || bodyBuffer.length < MIN_COMPRESSION_BYTES) {
      return originalSend(body as never);
    }

    if (!isCompressibleContentType(res.getHeader("Content-Type"))) {
      return originalSend(body as never);
    }

    void (async () => {
      try {
        const compressedBody = await compressBody(bodyBuffer, encoding);
        if (compressedBody.length >= bodyBuffer.length) {
          originalSend(body as never);
          return;
        }

        appendVaryHeader(res, "Accept-Encoding");
        res.setHeader("Content-Encoding", encoding);
        res.removeHeader("Content-Length");
        originalSend(compressedBody as never);
      } catch (error) {
        logger.warn({ error, encoding, path: req.originalUrl }, "[compression] Failed to compress response, falling back to plain body");
        originalSend(body as never);
      }
    })();

    return res;
  }) as typeof res.send;

  next();
}
