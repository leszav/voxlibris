import { randomUUID } from "node:crypto";
import { fileStorage } from "../file-storage.js";
import { optimizeImage, type ImageType } from "../image-optimizer.js";
import { logger } from "./logger.js";

const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const STORAGE_PUBLIC_PREFIX = "/api/storage/";
const REMOTE_FETCH_TIMEOUT_MS = 10_000;
const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;

interface PersistImageOptions {
  type: ImageType;
  keyPrefix: string;
  filenamePrefix: string;
}

interface ResolvedImageSource {
  buffer: Buffer;
  mimeType: string;
  source: "data-url" | "storage" | "remote-url";
}

function parseImageDataUrl(value: string): { mimeType: string; buffer: Buffer } | null {
  const match = IMAGE_DATA_URL_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  try {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

export function extractStorageKeyFromPublicUrl(value: string): string | null {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith(STORAGE_PUBLIC_PREFIX)) {
    const key = normalizedValue.slice(STORAGE_PUBLIC_PREFIX.length);
    return key ? decodeURIComponent(key) : null;
  }

  try {
    const parsed = new URL(normalizedValue);
    const markerIndex = parsed.pathname.indexOf(STORAGE_PUBLIC_PREFIX);
    if (markerIndex === -1) {
      return null;
    }

    const key = parsed.pathname.slice(markerIndex + STORAGE_PUBLIC_PREFIX.length);
    return key ? decodeURIComponent(key) : null;
  } catch {
    return null;
  }
}

async function readRemoteImageBuffer(response: Response): Promise<{ buffer: Buffer; mimeType: string }> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error(`Remote image is too large (${contentLength} bytes)`);
    }
  }

  const mimeType = (response.headers.get("content-type") || "").toLowerCase();
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Remote resource is not an image (content-type=${mimeType || "unknown"})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error(`Remote image exceeded max allowed size (${MAX_REMOTE_IMAGE_BYTES} bytes)`);
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
  };
}

async function resolveImageSource(value: string): Promise<ResolvedImageSource | null> {
  const parsedDataUrl = parseImageDataUrl(value);
  if (parsedDataUrl) {
    return {
      ...parsedDataUrl,
      source: "data-url",
    };
  }

  const storageKey = extractStorageKeyFromPublicUrl(value);
  if (storageKey) {
    const [metadata, buffer] = await Promise.all([
      fileStorage.getFileMetadata(storageKey),
      fileStorage.getFile(storageKey),
    ]);

    return {
      buffer,
      mimeType: metadata.contentType,
      source: "storage",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Remote image request failed with status ${response.status}`);
    }

    const { buffer, mimeType } = await readRemoteImageBuffer(response);
    return {
      buffer,
      mimeType,
      source: "remote-url",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function storeOptimizedImageIfNeeded(
  value: string | null | undefined,
  options: PersistImageOptions,
): Promise<string | null | undefined> {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  let resolvedSource: ResolvedImageSource | null;
  try {
    resolvedSource = await resolveImageSource(normalizedValue);
  } catch (error) {
    logger.warn({ error, imageType: options.type }, "[uploaded-image-storage] Failed to resolve image source");
    return normalizedValue;
  }

  if (!resolvedSource) {
    return normalizedValue;
  }

  const optimized = await optimizeImage(resolvedSource.buffer, options.type);
  const key = `${options.keyPrefix}/${options.filenamePrefix}-${randomUUID()}.${optimized.extension}`;
  const uploaded = await fileStorage.uploadFile(optimized.buffer, key, optimized.mimeType);
  const publicUrl = `${STORAGE_PUBLIC_PREFIX}${uploaded.key}`;

  logger.info(
    {
      key: uploaded.key,
      imageType: options.type,
      source: resolvedSource.source,
      originalMimeType: resolvedSource.mimeType,
      originalSize: optimized.originalSize,
      optimizedSize: optimized.optimizedSize,
      compressionRatio: optimized.compressionRatio,
    },
    "[uploaded-image-storage] Stored optimized image",
  );

  return publicUrl;
}
